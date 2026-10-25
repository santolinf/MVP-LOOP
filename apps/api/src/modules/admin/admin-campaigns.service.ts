import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { prisma } from "@loop/db";
import {
  hasPermission,
  mayApproveCampaign,
  needsApproval,
  requiredConsent,
  validateCampaignSettings,
  validateTemplate,
  type CampaignKind,
  type CampaignStatus,
} from "@loop/domain";
import {
  AdminAudienceSchema,
  type AdminCampaignDecisionSchema,
  type AdminCampaignQuerySchema,
  type AdminCampaignPreviewSchema,
  type AdminCreateCampaignSchema,
  type AdminDeliveryQuerySchema,
  type AdminPublishCampaignSettingsSchema,
} from "@loop/contracts";
import type { z } from "zod";
import { AuditService } from "../../common/audit.service.js";
import { ConsentService } from "../consent/consent.service.js";
import { evaluateAudience } from "../messaging/campaign-audience.js";
import { CAMPAIGN_SETTINGS_KEY, loadCampaignSettings } from "../messaging/campaign-send.service.js";
import type { StaffPrincipal } from "./staff-access.js";

const fullName = (c: { firstName: string | null; lastName: string | null } | undefined): string | null =>
  c ? [c.firstName, c.lastName].filter(Boolean).join(" ") || null : null;

const SKIP_ORDER = ["NO_CONSENT", "NO_EMAIL", "EMAIL_SUPPRESSED", "ERASED", "DAILY_CAP"] as const;

type CampaignRow = NonNullable<Awaited<ReturnType<typeof prisma.campaign.findUnique>>>;

/**
 * Phase 12 compose and send. Audience preview and the consent filter run here on the server; a send above the
 * approval threshold waits for a second person (never its author); the actual sending is the throttled
 * `campaign-send` job. Every step writes an AuditEvent.
 */
@Injectable()
export class AdminCampaignsService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ConsentService) private readonly consents: ConsentService,
  ) {}

  // ---- compose -------------------------------------------------------------------------------------------------

  async preview(body: z.infer<typeof AdminCampaignPreviewSchema>, staff: StaffPrincipal) {
    const { settings } = await loadCampaignSettings();
    const evaluated = await evaluateAudience(body.audience, this.consents);
    const eligible = evaluated.filter((e) => e.skip === null);
    const tally = new Map<string, number>();
    for (const e of evaluated) if (e.skip) tally.set(e.skip, (tally.get(e.skip) ?? 0) + 1);
    await this.audit.record({
      actorId: staff.id,
      actorType: "STAFF",
      entityType: "Campaign",
      entityId: "preview",
      action: "admin.campaign_previewed",
      after: { kind: body.audience.kind, matched: evaluated.length, eligible: eligible.length },
    });
    return {
      matched: evaluated.length,
      eligible: eligible.length,
      skipped: SKIP_ORDER.flatMap((reason) => (tally.get(reason) ? [{ reason, count: tally.get(reason) ?? 0 }] : [])),
      sample: eligible.slice(0, 5).map((e) => ({ contractorId: e.contractorId, name: e.firstName })),
      requiresApproval: needsApproval(eligible.length, settings),
      approvalThreshold: settings.approvalThreshold,
      consentRequired: requiredConsent(body.audience.kind),
    };
  }

  async create(body: z.infer<typeof AdminCreateCampaignSchema>, staff: StaffPrincipal, now = new Date()) {
    const issues = validateTemplate({ kind: "LOOP_MESSAGE", subject: body.subject, body: body.body });
    if (issues.length > 0) throw new UnprocessableEntityException(issues.join("; "));
    const { settings } = await loadCampaignSettings();
    const evaluated = await evaluateAudience(body.audience, this.consents);
    const eligible = evaluated.filter((e) => e.skip === null);
    if (eligible.length === 0) throw new UnprocessableEntityException("Nobody in this audience can be emailed: check the audience and their consent");

    const approvalRequired = needsApproval(eligible.length, settings);
    const status: CampaignStatus = approvalRequired ? "PENDING_APPROVAL" : "SENDING";
    const campaign = await prisma.$transaction(async (tx) => {
      const c = await tx.campaign.create({
        data: {
          name: body.name,
          kind: body.audience.kind,
          audience: body.audience as never,
          subject: body.subject.trim(),
          body: body.body,
          status,
          recipientCount: eligible.length,
          skippedCount: evaluated.length - eligible.length,
          approvalRequired,
          thresholdAtSubmit: settings.approvalThreshold,
          createdBy: staff.id,
          ...(approvalRequired ? {} : { approvedAt: now }),
        },
      });
      await tx.campaignRecipient.createMany({
        data: evaluated.map((e) => ({
          campaignId: c.id,
          contractorId: e.contractorId,
          ...(e.skip ? { status: "SKIPPED", skipReason: e.skip, processedAt: now } : {}),
        })),
      });
      return c;
    });
    await this.audit.record({
      actorId: staff.id,
      actorType: "STAFF",
      entityType: "Campaign",
      entityId: campaign.id,
      action: "admin.campaign_submitted",
      after: { name: body.name, kind: body.audience.kind, recipients: eligible.length, skipped: evaluated.length - eligible.length, status, approvalRequired, threshold: settings.approvalThreshold },
    });
    return this.detail(campaign.id, staff);
  }

  // ---- approval ------------------------------------------------------------------------------------------------

  async approve(id: string, body: z.infer<typeof AdminCampaignDecisionSchema>, staff: StaffPrincipal, now = new Date()) {
    const c = await this.find(id);
    if (c.status !== "PENDING_APPROVAL") throw new ConflictException("This send is not waiting for approval");
    if (!mayApproveCampaign({ approverId: staff.id, authorId: c.createdBy })) throw new ForbiddenException("A send must be approved by someone other than its author");
    const res = await prisma.campaign.updateMany({
      where: { id, status: "PENDING_APPROVAL" },
      data: { status: "SENDING", approvedBy: staff.id, approvedAt: now, decisionNote: body.note },
    });
    if (res.count !== 1) throw new ConflictException("This send was just decided by someone else");
    await this.audit.record({
      actorId: staff.id,
      actorType: "STAFF",
      entityType: "Campaign",
      entityId: id,
      action: "admin.campaign_approved",
      before: { status: c.status },
      after: { status: "SENDING", note: body.note, recipients: c.recipientCount },
    });
    return this.detail(id, staff);
  }

  async reject(id: string, body: z.infer<typeof AdminCampaignDecisionSchema>, staff: StaffPrincipal, now = new Date()) {
    return this.stop(id, "REJECTED", "PENDING_APPROVAL", body.note, staff, now);
  }

  async cancel(id: string, body: z.infer<typeof AdminCampaignDecisionSchema>, staff: StaffPrincipal, now = new Date()) {
    return this.stop(id, "CANCELLED", ["PENDING_APPROVAL", "SENDING"], body.note, staff, now);
  }

  /** Stops a send. Anything already sent stays sent; recipients still queued are released and will not be emailed. */
  private async stop(id: string, to: "REJECTED" | "CANCELLED", from: CampaignStatus | CampaignStatus[], note: string, staff: StaffPrincipal, now: Date) {
    const c = await this.find(id);
    const allowed = Array.isArray(from) ? from : [from];
    if (!allowed.includes(c.status as CampaignStatus)) throw new ConflictException(`This send cannot be ${to === "REJECTED" ? "rejected" : "cancelled"} while ${c.status.toLowerCase().replace("_", " ")}`);
    const released = await prisma.$transaction(async (tx) => {
      const res = await tx.campaign.updateMany({ where: { id, status: c.status }, data: { status: to, decisionNote: note } });
      if (res.count !== 1) throw new ConflictException("This send was just changed by someone else");
      const r = await tx.campaignRecipient.updateMany({ where: { campaignId: id, status: "QUEUED" }, data: { status: "SKIPPED", skipReason: "CANCELLED", processedAt: now } });
      return r.count;
    });
    await this.audit.record({
      actorId: staff.id,
      actorType: "STAFF",
      entityType: "Campaign",
      entityId: id,
      action: to === "REJECTED" ? "admin.campaign_rejected" : "admin.campaign_cancelled",
      before: { status: c.status },
      after: { status: to, note, released },
    });
    return this.detail(id, staff);
  }

  // ---- reading -------------------------------------------------------------------------------------------------

  private async find(id: string): Promise<CampaignRow> {
    const c = await prisma.campaign.findUnique({ where: { id } });
    if (!c) throw new NotFoundException("Send not found");
    return c;
  }

  private async toView(rows: CampaignRow[], staff: StaffPrincipal) {
    const grouped = rows.length
      ? await prisma.campaignRecipient.groupBy({ by: ["campaignId", "status"], where: { campaignId: { in: rows.map((r) => r.id) } }, _count: { _all: true } })
      : [];
    const count = (id: string, status: string) => grouped.find((g) => g.campaignId === id && g.status === status)?._count._all ?? 0;
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind as CampaignKind,
      status: c.status as CampaignStatus,
      subject: c.subject,
      body: c.body,
      audience: AdminAudienceSchema.parse(c.audience),
      recipientCount: c.recipientCount,
      skippedCount: c.skippedCount,
      approvalRequired: c.approvalRequired,
      createdBy: c.createdBy,
      approvedBy: c.approvedBy,
      approvedAt: c.approvedAt?.toISOString() ?? null,
      decisionNote: c.decisionNote,
      sentAt: c.sentAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      counts: { queued: count(c.id, "QUEUED"), sent: count(c.id, "SENT"), failed: count(c.id, "FAILED"), skipped: count(c.id, "SKIPPED") },
      canApprove: c.status === "PENDING_APPROVAL" && hasPermission(staff.role, "comms.approve") && mayApproveCampaign({ approverId: staff.id, authorId: c.createdBy }),
    }));
  }

  async list(q: z.infer<typeof AdminCampaignQuerySchema>, staff: StaffPrincipal) {
    const where = q.status ? { status: q.status } : {};
    const [rows, total] = await Promise.all([
      prisma.campaign.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.campaign.count({ where }),
    ]);
    return { items: await this.toView(rows, staff), total, page: q.page, pageSize: q.pageSize };
  }

  async detail(id: string, staff: StaffPrincipal) {
    const [view] = await this.toView([await this.find(id)], staff);
    if (!view) throw new NotFoundException("Send not found");
    return view;
  }

  /** The delivery log: per recipient, the outcome and the provider events in order. No addresses are returned. */
  async deliveries(id: string, q: z.infer<typeof AdminDeliveryQuerySchema>) {
    await this.find(id);
    const where = { campaignId: id, ...(q.status ? { status: q.status } : {}) };
    const [rows, total] = await Promise.all([
      prisma.campaignRecipient.findMany({ where, orderBy: { id: "asc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.campaignRecipient.count({ where }),
    ]);
    const messageIds = rows.flatMap((r) => (r.messageId ? [r.messageId] : []));
    const [people, messages, events] = rows.length
      ? await Promise.all([
          prisma.contractor.findMany({ where: { id: { in: rows.map((r) => r.contractorId) } }, select: { id: true, firstName: true, lastName: true } }),
          prisma.message.findMany({ where: { id: { in: messageIds } }, select: { id: true, sentAt: true } }),
          prisma.deliveryLog.findMany({ where: { messageId: { in: messageIds } }, orderBy: { occurredAt: "asc" }, select: { messageId: true, event: true, occurredAt: true } }),
        ])
      : [[], [], []];
    const byPerson = new Map(people.map((p) => [p.id, p]));
    const byMessage = new Map(messages.map((m) => [m.id, m]));
    return {
      items: rows.map((r) => ({
        contractorId: r.contractorId,
        name: fullName(byPerson.get(r.contractorId)),
        status: r.status as "QUEUED" | "SENT" | "FAILED" | "SKIPPED",
        skipReason: r.skipReason as never,
        sentAt: (r.messageId ? byMessage.get(r.messageId)?.sentAt : null)?.toISOString() ?? null,
        events: events.filter((e) => e.messageId === r.messageId).map((e) => ({ event: e.event, occurredAt: e.occurredAt.toISOString() })),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  // ---- settings ------------------------------------------------------------------------------------------------

  async settings() {
    const { settings, updatedAt, updatedBy } = await loadCampaignSettings();
    return { ...settings, updatedAt: updatedAt?.toISOString() ?? null, updatedBy };
  }

  async publishSettings(body: z.infer<typeof AdminPublishCampaignSettingsSchema>, staff: StaffPrincipal) {
    const next = { approvalThreshold: body.approvalThreshold, ratePerMinute: body.ratePerMinute };
    const issues = validateCampaignSettings(next);
    if (issues.length > 0) throw new UnprocessableEntityException(issues.join("; "));
    const before = (await loadCampaignSettings()).settings;
    await prisma.reminderConfig.upsert({
      where: { key: CAMPAIGN_SETTINGS_KEY },
      create: { key: CAMPAIGN_SETTINGS_KEY, value: next, updatedBy: staff.id },
      update: { value: next, updatedBy: staff.id },
    });
    await this.audit.record({
      actorId: staff.id,
      actorType: "STAFF",
      entityType: "CampaignSettings",
      entityId: CAMPAIGN_SETTINGS_KEY,
      action: "admin.campaign_settings_changed",
      before,
      after: { ...next, note: body.note },
    });
    return this.settings();
  }
}
