import { Inject, Injectable } from "@nestjs/common";
import { Prisma, prisma } from "@loop/db";
import { batchSize, isQuietHours, isSameLondonDay, mergeCampaignSettings, skipReason, type CampaignKind } from "@loop/domain";
import { AuditService } from "../../common/audit.service.js";
import { logger } from "../../common/logger.js";
import { hashKey } from "../../common/rate-limit.js";
import { ConsentService } from "../consent/consent.service.js";
import { renderCampaign } from "./campaign-email.js";
import { DeliveryService } from "./delivery.service.js";

export const CAMPAIGN_SETTINGS_KEY = "campaign.settings";

export async function loadCampaignSettings() {
  const row = await prisma.reminderConfig.findUnique({ where: { key: CAMPAIGN_SETTINGS_KEY } });
  return { settings: mergeCampaignSettings(row?.value), updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ?? null };
}

export interface DrainResult {
  held: boolean;
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  completed: number;
}

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/**
 * Sends approved campaigns at a throttled rate. Each run attempts at most `ratePerMinute` messages across all
 * campaigns and nothing leaves in quiet hours. Consent, suppression and the one-admin-message-a-day cap are read at
 * send time, not trusted from submit time. Delivery is at-most-once per (campaign, contractor): the Message row is
 * claimed first, and a failed send is recorded as FAILED for an admin to see, not retried silently.
 */
@Injectable()
export class CampaignSendService {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(
    @Inject(ConsentService) private readonly consents: ConsentService,
    @Inject(DeliveryService) private readonly delivery: DeliveryService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async drain(now = new Date()): Promise<DrainResult> {
    const result: DrainResult = { held: false, attempted: 0, sent: 0, failed: 0, skipped: 0, completed: 0 };
    if (isQuietHours(now)) return { ...result, held: true };
    const { settings } = await loadCampaignSettings();

    const campaigns = await prisma.campaign.findMany({ where: { status: "SENDING" }, orderBy: { approvedAt: "asc" } });
    for (const campaign of campaigns) {
      for (;;) {
        const room = batchSize(settings, result.attempted);
        if (room === 0) return result;
        const queued = await prisma.campaignRecipient.findMany({
          where: { campaignId: campaign.id, status: "QUEUED" },
          orderBy: { id: "asc" },
          take: Math.min(room, 200),
        });
        if (queued.length === 0) break;
        for (const r of queued) {
          try {
            const outcome = await this.sendOne(campaign, r.id, r.contractorId, now);
            if (outcome !== "SKIPPED") result.attempted++;
            if (outcome === "SENT") result.sent++;
            if (outcome === "FAILED") result.failed++;
            if (outcome === "SKIPPED") result.skipped++;
          } catch (e) {
            result.attempted++;
            result.failed++;
            // Only ids and the error class are logged: never an address or message text.
            logger.error({ campaignId: campaign.id, contractorId: r.contractorId, err: e instanceof Error ? e.name : "unknown" }, "campaign send failed");
            await prisma.campaignRecipient.updateMany({ where: { id: r.id, status: "QUEUED" }, data: { status: "FAILED", processedAt: now } });
          }
        }
      }
      if ((await prisma.campaignRecipient.count({ where: { campaignId: campaign.id, status: "QUEUED" } })) === 0) {
        const done = await prisma.campaign.updateMany({ where: { id: campaign.id, status: "SENDING" }, data: { status: "SENT", sentAt: now } });
        if (done.count === 1) {
          result.completed++;
          await this.audit.record({ actorType: "SYSTEM", entityType: "Campaign", entityId: campaign.id, action: "campaign.completed", after: { sentAt: now.toISOString() } });
        }
      }
    }
    return result;
  }

  private async sendOne(
    campaign: { id: string; kind: string; subject: string; body: string[]; createdBy: string },
    recipientId: string,
    contractorId: string,
    now: Date,
  ): Promise<"SENT" | "FAILED" | "SKIPPED"> {
    const kind = campaign.kind as CampaignKind;
    const c = await prisma.contractor.findUnique({ where: { id: contractorId } });
    const skip = async (reason: string) => {
      await prisma.campaignRecipient.updateMany({ where: { id: recipientId, status: "QUEUED" }, data: { status: "SKIPPED", skipReason: reason, processedAt: now } });
      return "SKIPPED" as const;
    };
    if (!c || c.erasedAt || c.erasureRequestedAt) return skip("ERASED");

    const [active, suppressed, lastAdmin] = await Promise.all([
      this.consents.active(c.id),
      c.email ? prisma.emailSuppression.findUnique({ where: { emailHash: hashKey(c.email.toLowerCase()) } }) : null,
      prisma.message.findFirst({ where: { contractorId: c.id, kind: "ADMIN", sentAt: { not: null } }, orderBy: { sentAt: "desc" } }),
    ]);
    const reason = skipReason({
      kind,
      erased: false,
      hasEmail: !!c.email,
      consents: active,
      emailSuppressed: !!suppressed,
      receivedAdminToday: lastAdmin?.sentAt ? isSameLondonDay(lastAdmin.sentAt, now) : false,
    });
    if (reason || !c.email) return skip(reason ?? "NO_EMAIL");

    let messageId: string;
    try {
      const m = await prisma.message.create({
        data: { contractorId: c.id, channel: "EMAIL", kind: "ADMIN", templateKey: `campaign.${campaign.id}`, templateVersion: 1, campaignId: campaign.id, status: "QUEUED" },
      });
      await prisma.deliveryLog.create({ data: { messageId: m.id, event: "QUEUED", occurredAt: now } });
      messageId = m.id;
    } catch (e) {
      if (!isUnique(e)) throw e;
      // Already attempted by an earlier run: settle the recipient from that message, never send twice.
      const prior = await prisma.message.findUnique({ where: { campaignId_contractorId: { campaignId: campaign.id, contractorId: c.id } } });
      const settled = prior?.status === "SENT" ? "SENT" : "FAILED";
      await prisma.campaignRecipient.updateMany({ where: { id: recipientId, status: "QUEUED" }, data: { status: settled, messageId: prior?.id ?? null, processedAt: now } });
      return settled;
    }

    const rendered = renderCampaign({ kind, subject: campaign.subject, body: campaign.body }, c.firstName);
    const outcome = await this.delivery.send(messageId, "EMAIL", c.email, rendered, now);
    await prisma.campaignRecipient.updateMany({ where: { id: recipientId, status: "QUEUED" }, data: { status: outcome, messageId, processedAt: now } });
    if (outcome === "SENT") {
      // The same words appear in My LOOP: one-way, no reply path.
      await prisma.loopMessage.create({ data: { contractorId: c.id, subject: rendered.subject, body: rendered.plainBody.join("\n\n"), sentBy: campaign.createdBy } });
    }
    return outcome;
  }
}
