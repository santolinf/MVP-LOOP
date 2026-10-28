import { Injectable } from "@nestjs/common";
import { Prisma, prisma } from "@loop/db";
import { z } from "zod";
import { hashKey } from "../../common/rate-limit.js";

/** Postmark webhook payloads (Delivery, Bounce, SpamComplaint). Unknown fields are ignored. */
export const PostmarkEventSchema = z
  .object({
    RecordType: z.string(),
    ID: z.union([z.number(), z.string()]).optional(),
    MessageID: z.string().optional(),
    Type: z.string().optional(),
    Email: z.string().optional(),
    Recipient: z.string().optional(),
    BouncedAt: z.string().optional(),
    DeliveredAt: z.string().optional(),
  })
  .loose();
export type PostmarkEvent = z.infer<typeof PostmarkEventSchema>;

/** Bounce types after which the address must not be emailed again. Soft/transient bounces are logged only. */
const HARD_BOUNCE_TYPES: ReadonlySet<string> = new Set([
  "HardBounce",
  "BadEmailAddress",
  "SpamNotification",
  "SpamComplaint",
  "ManuallyDeactivated",
  "Unsubscribe",
]);

export type WebhookOutcome = "LOGGED" | "SUPPRESSED" | "DUPLICATE" | "IGNORED";

/**
 * Turns provider events into delivery history and suppression. Idempotent: the provider's event id is unique in
 * DeliveryLog, so a retried webhook changes nothing. The address from a bounce or complaint is suppressed whether or not
 * it belongs to one of our Messages (sign-in codes use the same provider).
 */
@Injectable()
export class WebhookService {
  async handlePostmark(event: PostmarkEvent, now = new Date()): Promise<WebhookOutcome> {
    const kind =
      event.RecordType === "Delivery" ? "DELIVERED" : event.RecordType === "Bounce" ? "BOUNCED" : event.RecordType === "SpamComplaint" ? "COMPLAINED" : null;
    if (!kind) return "IGNORED";

    const message = event.MessageID ? await prisma.message.findUnique({ where: { providerMessageId: event.MessageID } }) : null;
    const eventId = `postmark:${event.RecordType}:${event.ID ?? event.MessageID ?? "unknown"}`;
    const occurredAt = new Date(event.BouncedAt ?? event.DeliveredAt ?? now);
    const hard = kind === "COMPLAINED" || (kind === "BOUNCED" && HARD_BOUNCE_TYPES.has(event.Type ?? ""));

    if (message) {
      try {
        await prisma.deliveryLog.create({
          data: {
            messageId: message.id,
            event: kind,
            providerEventId: eventId,
            occurredAt: Number.isNaN(occurredAt.getTime()) ? now : occurredAt,
            detail: kind === "DELIVERED" ? Prisma.DbNull : { type: event.Type ?? event.RecordType },
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return "DUPLICATE";
        throw e;
      }
      if (hard) await prisma.message.update({ where: { id: message.id }, data: { status: kind } });
    }

    if (!hard) return "LOGGED";
    const address = event.Email ?? (message ? (await prisma.contractor.findUnique({ where: { id: message.contractorId }, select: { email: true } }))?.email : null);
    if (!address) return "LOGGED";
    await prisma.emailSuppression.upsert({
      where: { emailHash: hashKey(address.trim().toLowerCase()) },
      update: {},
      create: { emailHash: hashKey(address.trim().toLowerCase()), reason: kind === "COMPLAINED" ? "COMPLAINT" : "HARD_BOUNCE" },
    });
    return "SUPPRESSED";
  }
}
