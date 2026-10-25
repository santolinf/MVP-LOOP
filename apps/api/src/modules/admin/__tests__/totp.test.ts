import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, decryptSecret, encryptSecret, otpauthUrl, totpCode, totpStep, verifyTotp } from "../totp.js";

// RFC 6238 appendix B, SHA-1, ASCII secret "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP (RFC 6238)", () => {
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
  ])("matches the RFC vector at T=%i", (t, expected) => {
    expect(totpCode(RFC_SECRET, Math.floor(t / 30), 8)).toBe(expected);
  });

  it("round-trips base32", () => {
    const buf = Buffer.from("hello world, totp");
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });

  const now = new Date("2026-10-30T10:00:10Z");
  const step = totpStep(now);

  it("accepts the current step and one either side, nothing further", () => {
    for (const s of [step - 1, step, step + 1]) expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, s), now, null)).toBe(s);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 2), now, null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), now, null)).toBeNull();
  });

  it("refuses a replay of a step already used", () => {
    const code = totpCode(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, code, now, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, code, now, step - 1)).toBe(step);
  });

  it("rejects malformed codes", () => {
    expect(verifyTotp(RFC_SECRET, "12345", now, null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "abcdef", now, null)).toBeNull();
  });

  it("builds an otpauth url", () => {
    expect(otpauthUrl("a@loop.test", "ABC")).toMatch(/^otpauth:\/\/totp\/LOOP%20Admin%3Aa%40loop\.test\?secret=ABC&issuer=LOOP%20Admin/);
  });
});

describe("secret encryption", () => {
  const key = "k".repeat(40);
  it("round-trips and is not deterministic", () => {
    const a = encryptSecret("JBSWY3DPEHPK3PXP", key);
    expect(a).not.toContain("JBSWY3DPEHPK3PXP");
    expect(encryptSecret("JBSWY3DPEHPK3PXP", key)).not.toBe(a);
    expect(decryptSecret(a, key)).toBe("JBSWY3DPEHPK3PXP");
  });
  it("fails with the wrong key or a tampered value", () => {
    const a = encryptSecret("JBSWY3DPEHPK3PXP", key);
    expect(() => decryptSecret(a, "x".repeat(40))).toThrow();
    const [iv, tag, data] = a.split(".");
    expect(() => decryptSecret(`${iv}.${tag}.${data?.slice(0, -2)}AA`, key)).toThrow();
  });
});
