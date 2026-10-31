import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadEnv } from "../../../config/index.js";
import { createEmailSenderFromEnv } from "../email-sender.js";

// Real SMTP round trip against Mailpit (docker compose, or the remote one: SMTP_HOST=<host>). Reads the message back
// over Mailpit's HTTP API. Mailpit has no TLS or auth, so this covers MIME and delivery, not STARTTLS or AUTH.
const env = loadEnv();
const api = process.env.MAILPIT_API ?? `http://${env.SMTP_HOST ?? "localhost"}:8025`;

describe(`SMTP delivery via Mailpit (${env.SMTP_HOST ?? "localhost"}:${env.SMTP_PORT})`, () => {
  it("delivers a multipart message with an encoded subject and a leading-dot line intact", async () => {
    const tag = randomUUID();
    const sender = createEmailSenderFromEnv({ ...env, SMTP_HOST: env.SMTP_HOST ?? "localhost" });
    const subject = `LOOP sign-in code – ${tag}`;
    const result = await sender.send(`Pat Example <pat-${tag}@example.com>`, { subject, text: "Code 123456\n.starts with a dot", html: "<p>Code 123456</p>" });
    expect(result?.providerMessageId).toMatch(/^<.+>$/);

    const found = (await (await fetch(`${api}/api/v1/search?query=${encodeURIComponent(`to:pat-${tag}@example.com`)}`)).json()) as {
      messages: { ID: string; Subject: string }[];
    };
    expect(found.messages).toHaveLength(1);
    expect(found.messages[0]?.Subject).toBe(subject);

    const full = (await (await fetch(`${api}/api/v1/message/${found.messages[0]?.ID}`)).json()) as { Text: string; HTML: string };
    expect(full.Text).toContain(".starts with a dot");
    expect(full.HTML).toContain("<p>Code 123456</p>");
  });
});
