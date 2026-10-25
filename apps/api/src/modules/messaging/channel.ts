import type { EmailSender, SendResult } from "../auth/email-sender.js";
import type { RenderedEmail } from "../auth/email-templates.js";

export const MESSAGE_CHANNELS = Symbol("MESSAGE_CHANNELS");

export type Channel = "EMAIL";

export interface OutboundMessage {
  channel: Channel;
  /** Resolved from the contractor at send time and never stored on the Message. */
  email: string;
  content: RenderedEmail;
}

/**
 * One delivery channel. Email is the only one in the MVP (ADR 0004); a push adapter is added with the app by
 * implementing this interface and registering it, with no change to the cadence engine.
 */
export interface ChannelAdapter {
  readonly channel: Channel;
  send(message: OutboundMessage): Promise<SendResult>;
}

export class EmailChannelAdapter implements ChannelAdapter {
  readonly channel = "EMAIL" as const;
  constructor(private readonly sender: EmailSender) {}

  async send(message: OutboundMessage): Promise<SendResult> {
    return (await this.sender.send(message.email, message.content)) ?? {};
  }
}
