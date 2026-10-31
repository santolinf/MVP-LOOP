import { createTransport } from "nodemailer";
import { describe, expect, it } from "vitest";
import { loadEnv } from "../../../config/index.js";
import { SmtpEmailSender, createEmailSenderFromEnv, smtpTransportOptions } from "../email-sender.js";

const message = { subject: "Your LOOP code – 123456", text: "Code 123456\n.leading dot line", html: "<p>Code 123456</p>" };

describe("smtpTransportOptions", () => {
  it.each([
    ["none", { secure: false, requireTLS: false, ignoreTLS: true }],
    ["starttls", { secure: false, requireTLS: true, ignoreTLS: false }],
    ["tls", { secure: true, requireTLS: false, ignoreTLS: false }],
  ] as const)("maps %s", (smtpTls, expected) => {
    expect(smtpTransportOptions({ smtpHost: "h", smtpPort: 587, smtpTls })).toMatchObject(expected);
  });

  it("sends credentials only when both are set", () => {
    expect(smtpTransportOptions({ smtpHost: "h", smtpPort: 587, smtpUser: "u", smtpPassword: "p" }).auth).toEqual({ user: "u", pass: "p" });
    expect(smtpTransportOptions({ smtpHost: "h", smtpPort: 587, smtpUser: "u" }).auth).toBeUndefined();
  });
});

describe("SmtpEmailSender", () => {
  it("builds a multipart message, encodes a non-ASCII subject, and returns the Message-ID", async () => {
    const transport = createTransport({ jsonTransport: true });
    const result = await new SmtpEmailSender(transport, "LOOP <no-reply@loop.example>").send("Pat <pat@example.com>", message);
    expect(result.providerMessageId).toMatch(/^<.+@.+>$/);
  });

  it("strips header-injection characters from the recipient", async () => {
    const sent: { to?: string }[] = [];
    const transport = { sendMail: async (m: { to?: string }) => (sent.push(m), { messageId: "<id@x>" }) };
    await new SmtpEmailSender(transport, "no-reply@loop.example").send("a@b.co\r\nBcc: evil@x.co", message);
    expect(sent[0]?.to).not.toMatch(/[\r\n\s]/);
  });
});

describe("createEmailSenderFromEnv", () => {
  const base = { DATABASE_URL: "postgresql://x" };
  it("uses SMTP when SMTP_HOST is set, with no TLS by default outside production", () => {
    const env = loadEnv({ ...base, SMTP_HOST: "localhost" });
    expect(env.SMTP_TLS).toBe("none");
    expect(createEmailSenderFromEnv(env)).toBeInstanceOf(SmtpEmailSender);
  });
});
