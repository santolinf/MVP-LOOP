import { createTransport } from "nodemailer";
import { logger } from "../../common/logger.js";
import type { Env } from "../../config/index.js";
import type { RenderedEmail } from "./email-templates.js";

export const EMAIL_SENDER = Symbol("EMAIL_SENDER");

/** `providerMessageId` lets webhook events be matched back to the message (Phase 8). */
export interface SendResult {
  providerMessageId?: string;
}

export interface EmailSender {
  send(to: string, message: RenderedEmail): Promise<SendResult | void>;
}

/** `none` is plain text for the local Mailpit only; production must use `starttls` (port 587) or `tls` (port 465). */
export type SmtpTls = "none" | "starttls" | "tls";

export interface EmailSenderOptions {
  from: string;
  smtpHost?: string;
  smtpPort: number;
  smtpTls?: SmtpTls;
  smtpUser?: string;
  smtpPassword?: string;
  postmarkToken?: string;
  production: boolean;
}

/** Development stand-in: prints the message so the flow works without a mail server. Never used in production. */
export class ConsoleEmailSender implements EmailSender {
  async send(to: string, message: RenderedEmail): Promise<void> {
    // Recipient and body are never logged (they carry the email address and OTP). Read the message in Mailpit.
    logger.info({ subject: message.subject, recipientDomain: to.split("@")[1] ?? "unknown" }, "dev email suppressed; set SMTP_HOST to deliver");
  }
}

/** nodemailer transport options for the SMTP settings (ADR 0013). Pure, so the TLS and auth rules are testable. */
export function smtpTransportOptions(o: Pick<EmailSenderOptions, "smtpHost" | "smtpPort" | "smtpTls" | "smtpUser" | "smtpPassword">) {
  const tls = o.smtpTls ?? "none";
  return {
    host: o.smtpHost,
    port: o.smtpPort,
    secure: tls === "tls",
    // starttls refuses to send in clear if the server does not offer the upgrade; none never upgrades.
    requireTLS: tls === "starttls",
    ignoreTLS: tls === "none",
    auth: o.smtpUser && o.smtpPassword ? { user: o.smtpUser, pass: o.smtpPassword } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}

/**
 * Standard SMTP submission: works with any provider (SES SMTP, SendGrid, Mailgun, Postmark SMTP, ...) and Mailpit
 * locally. MIME encoding, header-injection protection, STARTTLS and AUTH are nodemailer's.
 */
export interface MailTransport {
  sendMail(mail: { from: string; to: string; subject: string; text: string; html: string }): Promise<{ messageId?: unknown }>;
}

export class SmtpEmailSender implements EmailSender {
  constructor(
    private readonly transport: MailTransport,
    private readonly from: string,
  ) {}

  async send(to: string, message: RenderedEmail): Promise<SendResult> {
    const info = await this.transport.sendMail({
      from: this.from,
      to: address(to),
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    // The RFC 5322 Message-ID we sent; providers that echo it in events let webhooks be matched back to the Message.
    return typeof info.messageId === "string" ? { providerMessageId: info.messageId } : {};
  }
}

/**
 * Postmark transactional email (OQ4). Plain fetch, no SDK dependency. `MessageStream: outbound` is the transactional
 * stream; marketing would use a separate broadcast stream.
 */
export class PostmarkEmailSender implements EmailSender {
  constructor(
    private readonly token: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(to: string, message: RenderedEmail): Promise<SendResult> {
    const res = await this.fetchImpl("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Postmark-Server-Token": this.token },
      body: JSON.stringify({
        From: this.from,
        To: address(to),
        Subject: message.subject,
        TextBody: message.text,
        HtmlBody: message.html,
        MessageStream: "outbound",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    // The body can echo the recipient, so only the status code is surfaced.
    if (!res.ok) throw new Error(`Postmark send failed with status ${res.status}`);
    const body = (await res.json()) as { MessageID?: unknown };
    return typeof body.MessageID === "string" ? { providerMessageId: body.MessageID } : {};
  }
}

/** Strips header/command injection characters from an address. */
function address(value: string): string {
  const m = /<([^>]+)>/.exec(value);
  return (m?.[1] ?? value).replace(/[\r\n<>\s]/g, "");
}

export function createEmailSender(opts: EmailSenderOptions): EmailSender {
  if (opts.postmarkToken) return new PostmarkEmailSender(opts.postmarkToken, opts.from);
  if (opts.smtpHost) return new SmtpEmailSender(createTransport(smtpTransportOptions(opts)), opts.from);
  if (opts.production) {
    // Config validation already refuses to boot like this; this is the last line of defence.
    return {
      send: async () => {
        throw new Error("No email provider configured");
      },
    };
  }
  return new ConsoleEmailSender();
}

/** The one place env becomes a sender, so the API and the worker jobs cannot drift apart. */
export function createEmailSenderFromEnv(env: Env): EmailSender {
  return createEmailSender({
    from: env.EMAIL_FROM,
    smtpHost: env.SMTP_HOST,
    smtpPort: env.SMTP_PORT,
    smtpTls: env.SMTP_TLS,
    smtpUser: env.SMTP_USER,
    smtpPassword: env.SMTP_PASSWORD,
    postmarkToken: env.POSTMARK_SERVER_TOKEN,
    production: env.production,
  });
}
