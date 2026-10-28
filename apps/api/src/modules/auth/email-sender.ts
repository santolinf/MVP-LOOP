import type { Socket} from "node:net";
import { connect } from "node:net";
import { logger } from "../../common/logger.js";
import type { RenderedEmail } from "./email-templates.js";

export const EMAIL_SENDER = Symbol("EMAIL_SENDER");

/** `providerMessageId` lets webhook events be matched back to the message (Phase 8). */
export interface SendResult {
  providerMessageId?: string;
}

export interface EmailSender {
  send(to: string, message: RenderedEmail): Promise<SendResult | void>;
}

export interface EmailSenderOptions {
  from: string;
  smtpHost?: string;
  smtpPort: number;
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

/** Plain SMTP (Mailpit locally). Production provider (Postmark/SES) is wired in with infra. */
export class SmtpEmailSender implements EmailSender {
  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly from: string,
  ) {}

  async send(to: string, message: RenderedEmail): Promise<void> {
    const socket = connect({ host: this.host, port: this.port });
    const read = reader(socket);
    try {
      await read(220);
      await command(socket, read, "EHLO loop.local", 250);
      await command(socket, read, `MAIL FROM:<${address(this.from)}>`, 250);
      await command(socket, read, `RCPT TO:<${address(to)}>`, 250);
      await command(socket, read, "DATA", 354);
      const boundary = `loop-${Date.now().toString(36)}`;
      const body = [
        `From: ${this.from}`,
        `To: <${address(to)}>`,
        `Subject: ${message.subject}`,
        "MIME-Version: 1.0",
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        'Content-Type: text/plain; charset="utf-8"',
        "",
        message.text,
        `--${boundary}`,
        'Content-Type: text/html; charset="utf-8"',
        "",
        message.html,
        `--${boundary}--`,
      ]
        .join("\r\n")
        .replace(/^\./gm, "..");
      socket.write(`${body}\r\n.\r\n`);
      await read(250);
      socket.write("QUIT\r\n");
    } finally {
      socket.end();
    }
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

async function command(socket: Socket, read: (code: number) => Promise<void>, line: string, expect: number): Promise<void> {
  socket.write(`${line}\r\n`);
  await read(expect);
}

/** Resolves when a complete (possibly multi-line) reply with the expected code arrives. */
function reader(socket: Socket): (code: number) => Promise<void> {
  let buffer = "";
  const waiting: { code: number; resolve: () => void; reject: (e: Error) => void }[] = [];
  const settle = (): void => {
    const w = waiting[0];
    if (!w) return;
    const lines = buffer.split("\r\n");
    const idx = lines.findIndex((l) => /^\d{3} /.test(l));
    if (idx === -1) return;
    const reply = lines[idx] as string;
    buffer = lines.slice(idx + 1).join("\r\n");
    waiting.shift();
    if (Number(reply.slice(0, 3)) === w.code) w.resolve();
    else w.reject(new Error(`SMTP unexpected reply ${reply.slice(0, 3)}`));
  };
  socket.on("data", (d) => {
    buffer += d.toString("utf8");
    settle();
  });
  socket.on("error", (e) => waiting.splice(0).forEach((w) => w.reject(e)));
  socket.setTimeout(10_000, () => socket.destroy(new Error("SMTP timeout")));
  return (code) =>
    new Promise<void>((resolve, reject) => {
      waiting.push({ code, resolve, reject });
      settle();
    });
}

export function createEmailSender(opts: EmailSenderOptions): EmailSender {
  if (opts.postmarkToken) return new PostmarkEmailSender(opts.postmarkToken, opts.from);
  if (opts.smtpHost) return new SmtpEmailSender(opts.smtpHost, opts.smtpPort, opts.from);
  if (opts.production) {
    // TODO(spec): production email provider (Postmark/SES) is configured with infra; fail loudly until then.
    return {
      send: async () => {
        throw new Error("No email provider configured");
      },
    };
  }
  return new ConsoleEmailSender();
}
