import { Injectable } from "@nestjs/common";
import { Prisma, prisma } from "@loop/db";
import { z } from "zod";
import { hashKey } from "../../common/rate-limit.js";

/**
 * Provider-neutral delivery event (ADR 0013). Every provider adapter, and the generic POST /webhooks/email endpoint,
 * produces this; the handling below knows nothing about any provider. `hard` means the address must not be emailed
 * again (hard bounce, complaint); a complaint is always hard.
 */
export const EmailEventSchema = z.object({
  kind: z.enum(["DELIVERED", "BOUNCED", "COMPLAINED"]),
  hard: z.boolean().default(false),
  /** Provider's unique id for the event; retries of the same event must repeat it (idempotency key). */
  eventId: z.string().min(1).max(200),
  /** Matches Message.providerMessageId when the provider echoes the id we were given on send. */
  providerMessageId: z.string().min(1).max(500).optional(),
  email: z.string().max(320).optional(),
  occurredAt: z.coerce.date().optional(),
  detail: z.string().max(200).optional(),
});
export type EmailEvent = z.infer<typeof EmailEventSchema>;

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

/** Postmark bounce types after which the address must not be emailed again. Soft/transient bounces are logged only. */
const POSTMARK_HARD_BOUNCE_TYPES: ReadonlySet<string> = new Set([
  "HardBounce",
  "BadEmailAddress",
  "SpamNotification",
  "SpamComplaint",
  "ManuallyDeactivated",
  "Unsubscribe",
]);

/** Postmark adapter. Returns null for record types we do not act on (opens, clicks, ...). */
export function fromPostmark(event: PostmarkEvent): EmailEvent | null {
  const kind =
    event.RecordType === "Delivery" ? "DELIVERED" : event.RecordType === "Bounce" ? "BOUNCED" : event.RecordType === "SpamComplaint" ? "COMPLAINED" : null;
  if (!kind) return null;
  const at = new Date(event.BouncedAt ?? event.DeliveredAt ?? "");
  return {
    kind,
    hard: kind === "COMPLAINED" || (kind === "BOUNCED" && POSTMARK_HARD_BOUNCE_TYPES.has(event.Type ?? "")),
    eventId: `postmark:${event.RecordType}:${event.ID ?? event.MessageID ?? "unknown"}`,
    providerMessageId: event.MessageID,
    email: event.Email,
    occurredAt: Number.isNaN(at.getTime()) ? undefined : at,
    detail: event.Type ?? event.RecordType,
  };
}

export type WebhookOutcome = "LOGGED" | "SUPPRESSED" | "DUPLICATE" | "IGNORED";

/**
 * Turns delivery events into delivery history and suppression. Idempotent: the provider's event id is unique in
 * DeliveryLog, so a retried webhook changes nothing. The address from a bounce or complaint is suppressed whether or not
 * it belongs to one of our Messages (sign-in codes use the same provider).
 */
@Injectable()
export class WebhookService {
  /** Postmark payload through its adapter. */
  async handlePostmark(event: PostmarkEvent, now = new Date()): Promise<WebhookOutcome> {
    const normalised = fromPostmark(event);
    return normalised ? this.handle(normalised, now) : "IGNORED";
  }

  async handle(event: EmailEvent, now = new Date()): Promise<WebhookOutcome> {
    const hard = event.kind === "COMPLAINED" || (event.kind === "BOUNCED" && event.hard);
    const message = event.providerMessageId ? await prisma.message.findUnique({ where: { providerMessageId: event.providerMessageId } }) : null;

    if (message) {
      try {
        await prisma.deliveryLog.create({
          data: {
            messageId: message.id,
            event: event.kind,
            providerEventId: event.eventId,
            occurredAt: event.occurredAt ?? now,
            detail: event.kind === "DELIVERED" ? Prisma.DbNull : { type: event.detail ?? event.kind },
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return "DUPLICATE";
        throw e;
      }
      if (hard) await prisma.message.update({ where: { id: message.id }, data: { status: event.kind } });
    }

    if (!hard) return "LOGGED";
    const address = event.email ?? (message ? (await prisma.contractor.findUnique({ where: { id: message.contractorId }, select: { email: true } }))?.email : null);
    if (!address) return "LOGGED";
    await prisma.emailSuppression.upsert({
      where: { emailHash: hashKey(address.trim().toLowerCase()) },
      update: {},
      create: { emailHash: hashKey(address.trim().toLowerCase()), reason: event.kind === "COMPLAINED" ? "COMPLAINT" : "HARD_BOUNCE" },
    });
    return "SUPPRESSED";
  }
}
