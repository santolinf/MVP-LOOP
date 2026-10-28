import { describe, expect, it } from "vitest";
import {
  DEFAULT_OTP_CONFIG as cfg,
  checkOtpUsable,
  decideOtpSend,
  generateOtpCode,
  normaliseEmail,
  normaliseUkMobile,
} from "./index.js";

const now = new Date("2026-10-17T12:00:00Z");
const ago = (s: number) => new Date(now.getTime() - s * 1000);

describe("decideOtpSend", () => {
  const base = { now, lastSentAt: null as Date | null, sentLastHourForEmail: 0, sentLastHourForIp: 0 };
  const cases: [string, Partial<typeof base>, unknown][] = [
    ["first send", {}, { allowed: true }],
    ["within cooldown", { lastSentAt: ago(10) }, { allowed: false, reason: "COOLDOWN", retryAfterSeconds: 50 }],
    ["cooldown elapsed", { lastSentAt: ago(60) }, { allowed: true }],
    ["email limit", { sentLastHourForEmail: 5 }, { allowed: false, reason: "EMAIL_LIMIT", retryAfterSeconds: 3600 }],
    ["under email limit", { sentLastHourForEmail: 4 }, { allowed: true }],
    ["ip limit", { sentLastHourForIp: 20 }, { allowed: false, reason: "IP_LIMIT", retryAfterSeconds: 3600 }],
  ];
  it.each(cases)("%s", (_n, over, expected) => {
    expect(decideOtpSend({ ...base, ...over }, cfg)).toEqual(expected);
  });
});

describe("checkOtpUsable", () => {
  const otp = { expiresAt: new Date(now.getTime() + 60_000), consumedAt: null as Date | null, attempts: 0 };
  const cases: [string, Partial<typeof otp>, string][] = [
    ["fresh", {}, "USABLE"],
    ["consumed (single use)", { consumedAt: now }, "CONSUMED"],
    ["expired exactly now", { expiresAt: now }, "EXPIRED"],
    ["last attempt left", { attempts: 4 }, "USABLE"],
    ["attempts exhausted", { attempts: 5 }, "TOO_MANY_ATTEMPTS"],
  ];
  it.each(cases)("%s", (_n, over, expected) => {
    expect(checkOtpUsable({ ...otp, ...over }, now, cfg)).toBe(expected);
  });
});

describe("generateOtpCode", () => {
  it("is zero padded digits of the configured length", () => {
    expect(generateOtpCode(() => 0, 6)).toBe("000000");
    let i = 0;
    expect(generateOtpCode(() => i++, 6)).toBe("012345");
  });
});

describe("normaliseEmail", () => {
  it("trims and lowercases", () => expect(normaliseEmail("  Sam@Example.COM ")).toBe("sam@example.com"));
});

describe("normaliseUkMobile", () => {
  const cases: [string, string | null][] = [
    ["07700 900001", "+447700900001"],
    ["+44 7700 900001", "+447700900001"],
    ["0044 7700-900001", "+447700900001"],
    ["+44 (0)7700 900001", "+447700900001"],
    ["0044 (0) 7700 900001", "+447700900001"],
    ["020 7946 0000", null],
    ["+1 415 555 0100", null],
    ["07012345678", null],
    ["0770090000", null],
  ];
  it.each(cases)("%s", (input, expected) => expect(normaliseUkMobile(input)).toBe(expected));
});
