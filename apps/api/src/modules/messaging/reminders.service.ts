import { Inject, Injectable } from "@nestjs/common";
import { Prisma, prisma } from "@loop/db";
import {
  decideSend,
  describeAvailability,
  escalationStage,
  isSameLondonDay,
  londonDate,
  planReminders,
  type FreshnessThresholds,
  type PlannedReminder,
  type ReminderType,
} from "@loop/domain";
import { AuditService } from "../../common/audit.service.js";
import { loadFreshnessThresholds } from "../../common/freshness-config.js";
import { logger } from "../../common/logger.js";
import { loadReminderConfig, type VersionedReminderConfig } from "../../common/reminder-config.js";
import { hashKey } from "../../common/rate-limit.js";
import { ConsentService } from "../consent/consent.service.js";
import { factsFor } from "../me/me.service.js";
import { ConfirmLinkService, factsOf, MESSAGING_SETTINGS, type MessagingSettings } from "./confirm-link.service.js";
import { DeliveryService } from "./delivery.service.js";
import { escalationPatch } from "./escalation.js";
import { loadTemplateOverride } from "./template-store.js";
import { REMINDER_TEMPLATES, renderReminder } from "./templates.js";

type ContractorRow = NonNullable<Awaited<ReturnType<typeof prisma.contractor.findUnique>>>;

const BATCH = 200;

/** Reminders a one-touch link may answer: the "still the same" checks. Outcome asks and reviews need sign-in. */
const LINK_ELIGIBLE: ReadonlySet<ReminderType> = new Set([
  "AVAILABLE_NOW_CHECK",
  "CONTRACT_END_PROMPT",
  "IN_CONTRACT_CHECK",
  "PERMANENT_CHECK",
  "FUTURE_START_PROMPT",
]);

const TARGET_FOR: Partial<Record<ReminderType, string>> = { INTRODUCTIONS_NUDGE: "INTRODUCE", CV_REVIEW: "JOIN_CV" };

export interface SweepResult {
  contractors: number;
  sent: number;
  failed: number;
  errors: number;
}

/**
 * The Phase 8 cadence engine. Per contractor it (1) keeps the grey-since marker and escalation current, (2) reconciles
 * stored ScheduledReminders with what `planReminders` says should exist, cancelling the obsolete, and (3) sends at most
 * one routine reminder, checking consent and suppression at send time. All the rules are in `@loop/domain`.
 */
@Injectable()
export class RemindersService {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(
    @Inject(ConsentService) private readonly consents: ConsentService,
    @Inject(DeliveryService) private readonly delivery: DeliveryService,
    @Inject(ConfirmLinkService) private readonly links: ConfirmLinkService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MESSAGING_SETTINGS) private readonly settings: MessagingSettings,
  ) {}

  async runSweep(now = new Date()): Promise<SweepResult> {
    const cfg = await loadReminderConfig();
    const thresholds = await loadFreshnessThresholds();
    const result: SweepResult = { contractors: 0, sent: 0, failed: 0, errors: 0 };
    let cursor: string | undefined;
    for (;;) {
      const rows = await prisma.contractor.findMany({
        where: { erasedAt: null, erasureRequestedAt: null, email: { not: null } },
        take: BATCH,
        orderBy: { id: "asc" },
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (rows.length === 0) break;
      for (const c of rows) {
        result.contractors++;
        try {
          const outcome = await this.processContractor(c, now, cfg, thresholds);
          if (outcome === "SENT") result.sent++;
          if (outcome === "FAILED") result.failed++;
        } catch (e) {
          // One bad contractor must not stop the sweep. Only ids and error class are logged.
          result.errors++;
          logger.error({ contractorId: c.id, err: e instanceof Error ? e.name : "unknown" }, "reminder sweep failed for contractor");
        }
      }
      cursor = rows[rows.length - 1]?.id;
      if (rows.length < BATCH) break;
    }
    return result;
  }

  /** Reconcile and dispatch for one contractor, e.g. straight after they confirm or change their situation. */
  async refresh(contractorId: string, now = new Date()): Promise<void> {
    const c = await prisma.contractor.findUnique({ where: { id: contractorId } });
    if (!c || c.erasedAt) return;
    await this.reconcile(c, now, await loadReminderConfig(), await loadFreshnessThresholds());
  }

  private async processContractor(
    start: ContractorRow,
    now: Date,
    cfg: VersionedReminderConfig,
    thresholds: FreshnessThresholds,
  ): Promise<"SENT" | "FAILED" | "NONE"> {
    const c = await this.syncEscalation(start, now, cfg, thresholds);
    await this.reconcile(c, now, cfg, thresholds);
    return this.dispatch(c, now, cfg);
  }

  // ---- escalation ----------------------------------------------------------------------------------------------

  /**
   * Follow-up is the UNCONFIRMED_FOLLOW_UP reminder planned below. Then an Admin call task, then search suppression.
   * Nothing here changes the colour; grey stays grey until the contractor confirms.
   */
  private async syncEscalation(c: ContractorRow, now: Date, cfg: VersionedReminderConfig, thresholds: FreshnessThresholds): Promise<ContractorRow> {
    const a = describeAvailability(factsFor(c, now), thresholds, now);
    let row = c;
    const patch = escalationPatch(c, a.freshnessState, now);
    if (Object.keys(patch).length > 0) {
      row = await prisma.contractor.update({ where: { id: c.id }, data: patch });
      if (patch.searchSuppressed === false) {
        await this.audit.record({
          entityType: "Contractor",
          entityId: c.id,
          action: "escalation.suppression_lifted",
          before: { searchSuppressed: true },
          after: { searchSuppressed: false },
        });
      }
    }
    if (!row.live || !row.unconfirmedSince) return row;

    const stage = escalationStage(row.unconfirmedSince, now, cfg.config);
    if ((stage === "CALL_TASK" || stage === "SUPPRESS") && row.escalationStage === null) {
      try {
        await prisma.manualCallTask.create({ data: { contractorId: row.id, reason: "UNCONFIRMED_AVAILABILITY" } });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") throw e;
      }
      row = await prisma.contractor.update({ where: { id: row.id }, data: { escalationStage: "CALL_TASK" } });
    }
    if (stage === "SUPPRESS" && row.escalationStage !== "SUPPRESS") {
      const before = { searchSuppressed: row.searchSuppressed };
      row = await prisma.contractor.update({ where: { id: row.id }, data: { searchSuppressed: true, escalationStage: "SUPPRESS" } });
      await this.audit.record({
        entityType: "Contractor",
        entityId: row.id,
        action: "escalation.search_suppressed",
        before,
        after: { searchSuppressed: true, reason: "availability unconfirmed" },
      });
    }
    return row;
  }

  // ---- planning ------------------------------------------------------------------------------------------------

  private async plan(c: ContractorRow, now: Date, cfg: VersionedReminderConfig, thresholds: FreshnessThresholds) {
    const a = describeAvailability(factsFor(c, now), thresholds, now);
    const [golive, cv, introductionCount] = await Promise.all([
      prisma.auditEvent.findFirst({ where: { entityType: "Contractor", entityId: c.id, action: "golive.activated" }, orderBy: { createdAt: "desc" } }),
      prisma.cvUpload.findFirst({ where: { contractorId: c.id, status: "READY" }, orderBy: { createdAt: "desc" } }),
      prisma.referral.count({ where: { referrerId: c.id } }),
    ]);
    // TODO(spec): no dedicated "profile reviewed" / "CV reviewed" timestamp exists yet (decision: go-live and CV upload
    // reset these clocks). Add the confirm actions and their fields when the review flows are built.
    const planned = planReminders(
      {
        // A contractor who has not stated their situation has nothing to be reminded about yet.
        status: c.employmentSituation ? a.underlyingStatus : "UNCONFIRMED",
        contractEndDate: c.contractEndDate,
        availableFrom: c.availableFrom,
        lastConfirmedAt: c.lastConfirmedAt,
        profileLastVerifiedAt: golive?.createdAt ?? null,
        lastCvActivityAt: cv?.createdAt ?? null,
        registeredAt: c.createdAt,
        introductionCount,
        unconfirmedSince: c.live ? c.unconfirmedSince : null,
      },
      cfg.config,
    );
    const answeredOn = c.lastConfirmedAt ? londonDate(c.lastConfirmedAt) : null;
    const endOn = c.contractEndDate ? londonDate(c.contractEndDate) : null;
    // A prompt is answered by any confirmation on or after its day. The end-date ask and its +3/+7 follow-ups are answered
    // by a confirmation made on or after the end date itself, which is what they are asking for.
    const satisfied = (p: PlannedReminder) => {
      if (answeredOn === null) return false;
      if (p.type === "CONTRACT_END_PROMPT") return londonDate(p.dueAt) <= answeredOn;
      if (p.type === "CONTRACT_END_DATE" || p.type === "CONTRACT_END_FOLLOW_UP") return endOn !== null && endOn <= answeredOn;
      return false;
    };
    return { effective: planned.filter((p) => !satisfied(p)), satisfiedKeys: new Set(planned.filter(satisfied).map((p) => p.dedupeKey)) };
  }

  /** Inserts what is missing (idempotent by contractor + dedupeKey) and cancels pending rows that are no longer planned. */
  async reconcile(c: ContractorRow, now: Date, cfg: VersionedReminderConfig, thresholds: FreshnessThresholds): Promise<void> {
    const { effective, satisfiedKeys } = await this.plan(c, now, cfg, thresholds);
    const wanted = new Set(effective.map((p) => p.dedupeKey));
    const existing = await prisma.scheduledReminder.findMany({ where: { contractorId: c.id, dedupeKey: { in: [...wanted] } }, select: { dedupeKey: true } });
    const have = new Set(existing.map((r) => r.dedupeKey));

    const fresh = effective.filter((p) => !have.has(p.dedupeKey));
    if (fresh.length > 0) {
      await prisma.scheduledReminder.createMany({
        skipDuplicates: true,
        data: fresh.map((p) => {
          // Born stale (e.g. a 28-day prompt for a contract ending in 10 days): record it as skipped so it is not re-planned.
          const stale = now.getTime() - p.dueAt.getTime() > cfg.config.staleAfterDays * 86_400_000;
          return {
            contractorId: c.id,
            type: p.type,
            dedupeKey: p.dedupeKey,
            dueAt: p.dueAt,
            configVersion: cfg.version,
            ...(stale ? { status: "SKIPPED", resolution: "STALE", resolvedAt: now } : {}),
          };
        }),
      });
    }

    const pending = await prisma.scheduledReminder.findMany({ where: { contractorId: c.id, status: "PENDING" }, select: { id: true, dedupeKey: true } });
    for (const r of pending) {
      if (wanted.has(r.dedupeKey)) continue;
      await prisma.scheduledReminder.updateMany({
        where: { id: r.id, status: "PENDING" },
        data: { status: "CANCELLED", resolution: satisfiedKeys.has(r.dedupeKey) ? "SATISFIED" : "OBSOLETE", resolvedAt: now },
      });
    }
  }

  // ---- sending -------------------------------------------------------------------------------------------------

  async dispatch(c: ContractorRow, now: Date, cfg: VersionedReminderConfig): Promise<"SENT" | "FAILED" | "NONE"> {
    const dueRows = await prisma.scheduledReminder.findMany({ where: { contractorId: c.id, status: "PENDING", dueAt: { lte: now } } });
    if (dueRows.length === 0) return "NONE";

    // Consent and suppression are read now, at send time, not when the reminder was scheduled.
    const [active, suppressed, lastSent] = await Promise.all([
      this.consents.active(c.id),
      c.email ? prisma.emailSuppression.findUnique({ where: { emailHash: hashKey(c.email.toLowerCase()) } }) : null,
      prisma.message.findFirst({ where: { contractorId: c.id, kind: "REMINDER", sentAt: { not: null } }, orderBy: { sentAt: "desc" } }),
    ]);
    const due = dueRows.map((r) => ({ id: r.id, type: r.type as ReminderType, dueAt: r.dueAt }));
    const decision = decideSend({
      now,
      due,
      sentToday: lastSent?.sentAt ? isSameLondonDay(lastSent.sentAt, now) : false,
      hasEmail: !!c.email,
      operationalConsent: active.has("OPERATIONAL_EMAIL"),
      emailSuppressed: !!suppressed,
      erased: !!c.erasedAt,
      staleAfterDays: cfg.config.staleAfterDays,
    });

    if (decision.stale.length > 0) {
      await prisma.scheduledReminder.updateMany({
        where: { id: { in: decision.stale.map((r) => r.id) }, status: "PENDING" },
        data: { status: "SKIPPED", resolution: "STALE", resolvedAt: now },
      });
    }
    const chosen = decision.send;
    if (!chosen || !c.email) return "NONE";

    const template = REMINDER_TEMPLATES[chosen.type];
    // Phase 10: the latest admin-published wording wins; the message records which version it was rendered from.
    const override = await loadTemplateOverride(template.key);
    const messageId = await this.delivery.claim(
      { contractorId: c.id, channel: "EMAIL", kind: "REMINDER", templateKey: template.key, templateVersion: override?.version ?? template.version, reminderId: chosen.id },
      now,
    );
    if (!messageId) return "NONE";

    const facts = factsOf(c);
    const linkOk = LINK_ELIGIBLE.has(chosen.type) && facts !== null && !(facts.contractEndDate && londonDate(facts.contractEndDate) < londonDate(now));
    const confirmUrl = linkOk && facts ? await this.links.issue(c.id, chosen.id, facts, now) : null;
    const rendered = renderReminder(chosen.type, {
      firstName: c.firstName,
      endDate: c.contractEndDate ? londonDate(c.contractEndDate) : null,
      confirmUrl,
      signInUrl: `${this.settings.baseUrl.replace(/\/$/, "")}/my-loop/availability`,
    }, override);

    const outcome = await this.delivery.send(messageId, "EMAIL", c.email, rendered, now);
    if (outcome === "FAILED") return "FAILED";

    await prisma.scheduledReminder.updateMany({ where: { id: chosen.id, status: "PENDING" }, data: { status: "SENT", resolvedAt: now } });
    await prisma.notification.create({
      data: {
        contractorId: c.id,
        kind: "REMINDER",
        title: rendered.subject,
        body: rendered.text.split("\n\n")[0] ?? rendered.subject,
        target: TARGET_FOR[chosen.type] ?? "AVAILABILITY",
      },
    });
    return "SENT";
  }
}
