import type { PgBoss } from "pg-boss";
import { AuditService } from "../common/audit.service.js";
import { logger } from "../common/logger.js";
import { loadEnv } from "../config/index.js";
import { createEmailSenderFromEnv } from "../modules/auth/email-sender.js";
import { ConsentService } from "../modules/consent/consent.service.js";
import { CampaignSendService, type DrainResult } from "../modules/messaging/campaign-send.service.js";
import { EmailChannelAdapter } from "../modules/messaging/channel.js";
import { DeliveryService } from "../modules/messaging/delivery.service.js";

export const CAMPAIGN_SEND = "campaign-send";

/** The worker role runs without the Nest container, so the sender is wired by hand here. */
function buildSender(): CampaignSendService {
  const env = loadEnv();
  const audit = new AuditService();
  const sender = createEmailSenderFromEnv(env);
  return new CampaignSendService(new ConsentService(audit), new DeliveryService([new EmailChannelAdapter(sender)]), audit);
}

/** Idempotent: each (campaign, contractor) has at most one Message, so a retried or overlapping run cannot double-send. */
export async function runCampaignSend(now = new Date(), sender = buildSender()): Promise<DrainResult> {
  return sender.drain(now);
}

/** Every minute. Singleton key: one drain at a time. The per-run cap is the admin-set send rate. */
export async function registerCampaignSend(boss: PgBoss): Promise<void> {
  await boss.createQueue(CAMPAIGN_SEND);
  await boss.work(CAMPAIGN_SEND, async () => {
    const r = await runCampaignSend();
    if (r.attempted > 0 || r.skipped > 0 || r.completed > 0) logger.info(r, "campaign send finished");
  });
  await boss.schedule(CAMPAIGN_SEND, "* * * * *", {}, { singletonKey: CAMPAIGN_SEND });
}
