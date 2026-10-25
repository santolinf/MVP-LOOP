import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger, scrub } from "../common/logger.js";

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  return { lines, log: createLogger(stream) };
}

const SEEDED = "seeded.person@example.com";

describe("logger redaction", () => {
  it("redacts a seeded email in a message string", () => {
    const { lines, log } = capture();
    log.info(`sent otp to ${SEEDED}`);
    expect(lines.join("")).not.toContain(SEEDED);
    expect(lines.join("")).toContain("[email]");
  });

  it("redacts sensitive keys, nested keys and free-text values", () => {
    const { lines, log } = capture();
    log.info({ email: SEEDED, user: { phone: "07700 900123", token: "abc" }, note: `call 07700 900123 code 482913` }, "event");
    const out = lines.join("");
    for (const secret of [SEEDED, "07700 900123", "482913", "abc"]) expect(out).not.toContain(secret);
  });

  it("redacts CV text and auth headers", () => {
    const { lines, log } = capture();
    log.info({ cvText: "Jane Doe, 10 years Java", req: { headers: { authorization: "Bearer x", cookie: "sid=1" } } }, "upload");
    const out = lines.join("");
    expect(out).not.toContain("Jane Doe");
    expect(out).not.toContain("Bearer x");
    expect(out).not.toContain("sid=1");
  });

  it("scrub handles emails, UK phones, OTPs and long tokens", () => {
    expect(scrub(`a@b.co +44 7700 900123 123456 ${"a".repeat(40)}`)).toBe("[email] [phone] [code] [token]");
  });
});
