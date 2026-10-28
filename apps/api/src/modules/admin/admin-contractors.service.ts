import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@loop/db";
import { describeAvailability, londonDate, type FreshnessThresholds } from "@loop/domain";
import type {
  AdminConfirmOnBehalfSchema,
  AdminContractorDetail,
  AdminContractorRow,
  AdminQueueSchema,
  AdminResolveCallTaskSchema,
  AdminSendMessageSchema,
} from "@loop/contracts";
import type { z } from "zod";
import { AuditService } from "../../common/audit.service.js";
import { loadFreshnessThresholds } from "../../common/freshness-config.js";
import { InboxService } from "../messaging/inbox.service.js";
import { MeService, factsFor } from "../me/me.service.js";
import type { StaffPrincipal } from "./staff-access.js";

type Contractor = NonNullable<Awaited<ReturnType<typeof prisma.contractor.findUnique>>>;
type Page = { page: number; pageSize: number };
type Queue = z.infer<typeof AdminQueueSchema>;

const dateOnly = (d: Date | null): string | null => (d ? londonDate(d) : null);
const iso = (d: Date | null): string | null => d?.toISOString() ?? null;
const fullName = (c: { firstName: string | null; lastName: string | null } | undefined): string | null =>
  c ? [c.firstName, c.lastName].filter(Boolean).join(" ") || null : null;

/** Colour and label come from the domain (rule 13): the admin client never calculates them. */
export function toRow(c: Contractor, thresholds: FreshnessThresholds, now: Date): AdminContractorRow {
  const a = describeAvailability(factsFor(c, now), thresholds, now);
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    live: c.live,
    paused: c.paused,
    searchSuppressed: c.searchSuppressed,
    colour: a.colour,
    label: a.label,
    lastConfirmedAt: iso(c.lastConfirmedAt),
    confirmationSource: c.confirmationSource,
    foundingPlace: c.foundingPlace,
  };
}

@Injectable()
export class AdminContractorsService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MeService) private readonly me: MeService,
    @Inject(InboxService) private readonly inbox: InboxService,
  ) {}

  async list(q: { q?: string; live?: "true" | "false" } & Page, now = new Date()) {
    const term = q.q?.trim();
    const where = {
      erasedAt: null,
      ...(q.live ? { live: q.live === "true" } : {}),
      ...(term
        ? {
            OR: [
              { firstName: { contains: term, mode: "insensitive" as const } },
              { lastName: { contains: term, mode: "insensitive" as const } },
              { email: { contains: term, mode: "insensitive" as const } },
              { phone: { contains: term } },
            ],
          }
        : {}),
    };
    const [rows, total, thresholds] = await Promise.all([
      prisma.contractor.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.contractor.count({ where }),
      loadFreshnessThresholds(),
    ]);
    return { items: rows.map((c) => toRow(c, thresholds, now)), total, page: q.page, pageSize: q.pageSize };
  }

  async detail(id: string, now = new Date()): Promise<AdminContractorDetail> {
    const c = await prisma.contractor.findFirst({ where: { id, erasedAt: null } });
    if (!c) throw new NotFoundException("Contractor not found");
    const [thresholds, referral, introductionsMade, events, task] = await Promise.all([
      loadFreshnessThresholds(),
      prisma.referral.findUnique({ where: { refereeId: id } }),
      prisma.referral.count({ where: { referrerId: id, lockedAt: { not: null } } }),
      prisma.confirmationEvent.findMany({ where: { contractorId: id }, orderBy: { confirmedAt: "desc" }, take: 10 }),
      prisma.manualCallTask.findFirst({ where: { contractorId: id, status: "OPEN" } }),
    ]);
    const referrer = referral ? await prisma.contractor.findUnique({ where: { id: referral.referrerId }, select: { firstName: true, lastName: true } }) : null;
    const a = describeAvailability(factsFor(c, now), thresholds, now);
    return {
      ...toRow(c, thresholds, now),
      phone: c.phone,
      employment: c.employmentSituation,
      availableFrom: dateOnly(c.availableFrom),
      contractEndDate: dateOnly(c.contractEndDate),
      underlyingStatus: a.underlyingStatus,
      freshnessState: a.freshnessState,
      unconfirmedSince: iso(c.unconfirmedSince),
      escalationStage: c.escalationStage,
      createdAt: c.createdAt.toISOString(),
      introducer: referral
        ? { referralId: referral.id, referrerId: referral.referrerId, referrerName: fullName(referrer ?? undefined), locked: referral.lockedAt !== null }
        : null,
      introductionsMade,
      events: events.map((e) => ({
        id: e.id,
        source: e.source,
        employment: e.employmentSituation,
        availableFrom: dateOnly(e.availableFrom),
        contractEndDate: dateOnly(e.contractEndDate),
        confirmedAt: e.confirmedAt.toISOString(),
      })),
      openCallTask: task ? { id: task.id, reason: task.reason, createdAt: task.createdAt.toISOString() } : null,
    };
  }

  /**
   * Manual confirm "on behalf" (source = ADMIN, reason mandatory). It is a meaningful confirmation like any other, so
   * it ends escalation; an open call task for the contractor is closed because the call has now happened.
   */
  async confirmOnBehalf(id: string, body: z.infer<typeof AdminConfirmOnBehalfSchema>, staff: StaffPrincipal, now = new Date()) {
    await this.exists(id);
    const me = await this.me.confirmAvailability(
      id,
      { employment: body.employment, availableFrom: body.availableFrom, contractEndDate: body.contractEndDate ?? null },
      now,
      "ADMIN",
      { staffId: staff.id, reason: body.reason },
    );
    const closed = await prisma.manualCallTask.updateMany({ where: { contractorId: id, status: "OPEN" }, data: { status: "DONE", resolvedAt: now } });
    if (closed.count > 0) {
      await this.audit.record({
        actorId: staff.id,
        actorType: "STAFF",
        entityType: "Contractor",
        entityId: id,
        action: "admin.call_task_closed_by_confirmation",
        after: { closed: closed.count },
      });
    }
    return me;
  }

  async sendMessage(id: string, body: z.infer<typeof AdminSendMessageSchema>, staff: StaffPrincipal) {
    await this.exists(id);
    const msg = await this.inbox.sendMessage(id, body.subject, body.body, staff.id);
    await this.audit.record({
      actorId: staff.id,
      actorType: "STAFF",
      entityType: "Contractor",
      entityId: id,
      action: "admin.loop_message_sent",
      after: { messageId: msg.id, subject: body.subject, templateKey: body.templateKey ?? null },
    });
    return { id: msg.id };
  }

  private async exists(id: string) {
    const c = await prisma.contractor.findFirst({ where: { id, erasedAt: null }, select: { id: true } });
    if (!c) throw new NotFoundException("Contractor not found");
  }

  /** LIVE contractors whose availability is unconfirmed, awaiting a call, or already suppressed from search. */
  async queue(q: { stage: "ALL" | "UNCONFIRMED" | "CALL_TASK" | "SUPPRESSED" } & Page, now = new Date()): Promise<Queue> {
    const stageWhere = {
      UNCONFIRMED: { freshnessState: "UNCONFIRMED" },
      CALL_TASK: { escalationStage: "CALL_TASK" },
      SUPPRESSED: { escalationStage: "SUPPRESS" },
      ALL: { OR: [{ freshnessState: "UNCONFIRMED" }, { escalationStage: { not: null } }] },
    }[q.stage];
    const where = { erasedAt: null, live: true, ...stageWhere };
    const [rows, total, thresholds] = await Promise.all([
      prisma.contractor.findMany({ where, orderBy: [{ unconfirmedSince: "asc" }, { createdAt: "asc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.contractor.count({ where }),
      loadFreshnessThresholds(),
    ]);
    const tasks = rows.length
      ? await prisma.manualCallTask.findMany({ where: { contractorId: { in: rows.map((r) => r.id) }, status: "OPEN" } })
      : [];
    const byContractor = new Map(tasks.map((t) => [t.contractorId, t]));
    return {
      items: rows.map((c) => {
        const t = byContractor.get(c.id);
        return {
          ...toRow(c, thresholds, now),
          unconfirmedSince: iso(c.unconfirmedSince),
          escalationStage: c.escalationStage,
          callTask: t ? { id: t.id, reason: t.reason, createdAt: t.createdAt.toISOString() } : null,
        };
      }),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async resolveCallTask(taskId: string, body: z.infer<typeof AdminResolveCallTaskSchema>, staff: StaffPrincipal, now = new Date()) {
    const res = await prisma.manualCallTask.updateMany({ where: { id: taskId, status: "OPEN" }, data: { status: body.outcome, resolvedAt: now } });
    if (res.count !== 1) throw new NotFoundException("Open call task not found");
    const task = await prisma.manualCallTask.findUnique({ where: { id: taskId } });
    await this.audit.record({
      actorId: staff.id,
      actorType: "STAFF",
      entityType: "ManualCallTask",
      entityId: taskId,
      action: "admin.call_task_resolved",
      before: { status: "OPEN" },
      after: { status: body.outcome, note: body.note ?? null, contractorId: task?.contractorId ?? null },
    });
    return { ok: true as const };
  }
}
