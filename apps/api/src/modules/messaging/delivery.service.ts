import { Inject, Injectable } from "@nestjs/common";
import { Prisma, prisma } from "@loop/db";
import type { RenderedEmail } from "../auth/email-templates.js";
import type { Channel, ChannelAdapter } from "./channel.js";
import { MESSAGE_CHANNELS } from "./channel.js";

export interface ClaimInput {
  contractorId: string;
  channel: Channel;
  kind: "REMINDER" | "SECURITY" | "CONFIRMATION";
  templateKey: string;
  templateVersion: number;
  reminderId: string;
}

export type SendOutcome = "SENT" | "FAILED";

/**
 * Records and sends outbound messages. A Message row is claimed before anything leaves the building, and the unique
 * `reminderId` means two workers (or a retried job) can never both send the same reminder. The recipient address is
 * passed in for the send and is never stored on the Message or the log.
 */
@Injectable()
export class DeliveryService {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(@Inject(MESSAGE_CHANNELS) private readonly channels: readonly ChannelAdapter[]) {}

  /** Returns the message id to send, or null when another worker holds it or it has already gone out. */
  async claim(input: ClaimInput, now: Date): Promise<string | null> {
    try {
      const m = await prisma.message.create({ data: { ...input, status: "QUEUED" } });
      await this.log(m.id, "QUEUED", now);
      return m.id;
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") throw e;
    }
    // A previous attempt failed: take it back to QUEUED for exactly one retrier.
    const existing = await prisma.message.findUnique({ where: { reminderId: input.reminderId } });
    if (!existing || existing.status !== "FAILED") return null;
    const retake = await prisma.message.updateMany({ where: { id: existing.id, status: "FAILED" }, data: { status: "QUEUED" } });
    if (retake.count !== 1) return null;
    await this.log(existing.id, "QUEUED", now);
    return existing.id;
  }

  async send(messageId: string, channel: Channel, email: string, content: RenderedEmail, now: Date): Promise<SendOutcome> {
    const adapter = this.channels.find((c) => c.channel === channel);
    try {
      if (!adapter) throw new Error("no adapter");
      const result = await adapter.send({ channel, email, content });
      await prisma.message.update({
        where: { id: messageId },
        data: { status: "SENT", sentAt: now, ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}) },
      });
      await this.log(messageId, "SENT", now);
      return "SENT";
    } catch {
      // The provider's error text can echo the recipient, so only the fact of failure is stored.
      await prisma.message.update({ where: { id: messageId }, data: { status: "FAILED" } });
      await this.log(messageId, "FAILED", now);
      return "FAILED";
    }
  }

  private async log(messageId: string, event: string, occurredAt: Date): Promise<void> {
    await prisma.deliveryLog.create({ data: { messageId, event, occurredAt } });
  }
}
