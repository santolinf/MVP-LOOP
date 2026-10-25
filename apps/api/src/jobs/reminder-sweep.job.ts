import type { PgBoss } from "pg-boss";
import { AuditService } from "../common/audit.service.js";
import { logger } from "../common/logger.js";
import { loadEnv } from "../config/index.js";
import { createEmailSender } from "../modules/auth/email-sender.js";
import { ConsentService } from "../modules/consent/consent.service.js";
import { EmailChannelAdapter } from "../modules/messaging/channel.js";
import { ConfirmLinkService } from "../modules/messaging/confirm-link.service.js";
import { DeliveryService } from "../modules/messaging/delivery.service.js";
import { RemindersService, type SweepResult } from "../modules/messaging/reminders.service.js";

export const REMINDER_SWEEP = "reminder-sweep";

/** The worker role runs without the Nest container, so the engine is wired by hand here. */
function buildEngine(): RemindersService {
  const env = loadEnv();
  const audit = new AuditService();
  const settings = { baseUrl: env.APP_BASE_URL, confirmLinkTtlHours: env.CONFIRM_LINK_TTL_HOURS };
  const sender = createEmailSender({
    from: env.EMAIL_FROM,
    smtpHost: env.SMTP_HOST,
    smtpPort: env.SMTP_PORT,
    postmarkToken: env.POSTMARK_SERVER_TOKEN,
    production: env.production,
  });
  return new RemindersService(
    new ConsentService(audit),
    new DeliveryService([new EmailChannelAdapter(sender)]),
    new ConfirmLinkService(settings),
    audit,
    settings,
  );
}

/** Idempotent: reminders are keyed by contractor + cadence + window and each has at most one Message. */
export async function runReminderSweep(now = new Date(), engine = buildEngine()): Promise<SweepResult> {
  return engine.runSweep(now);
}

/** Every 15 minutes, so reminders held for quiet hours go out soon after 08:00 London. Singleton key: one sweep at a time. */
export async function registerReminderSweep(boss: PgBoss): Promise<void> {
  await boss.createQueue(REMINDER_SWEEP);
  await boss.work(REMINDER_SWEEP, async () => {
    const r = await runReminderSweep();
    logger.info(r, "reminder sweep finished");
  });
  await boss.schedule(REMINDER_SWEEP, "*/15 * * * *", {}, { singletonKey: REMINDER_SWEEP });
}
