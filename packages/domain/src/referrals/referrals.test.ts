import { describe, expect, it } from "vitest";
import { generateReferralCode, isReferralValid, normaliseReferralCode, REFERRAL_CODE_LENGTH } from "./index.js";

describe("isReferralValid", () => {
  it.each([
    ["different people, unattributed", "a", "b", false, true],
    ["self referral", "a", "a", false, false],
    ["already attributed", "a", "b", true, false],
  ])("%s", (_n, referrerId, refereeId, refereeAlreadyAttributed, expected) => {
    expect(isReferralValid({ referrerId, refereeId, refereeAlreadyAttributed })).toBe(expected);
  });
});

describe("referral codes", () => {
  it("generates codes of the right length from the safe alphabet", () => {
    const code = generateReferralCode(() => 0);
    expect(code).toHaveLength(REFERRAL_CODE_LENGTH);
    expect(normaliseReferralCode(code)).toBe(code);
  });
  it.each([
    ["abcd2345", "ABCD2345"],
    ["  abcd2345 ", "ABCD2345"],
    ["ABCD234", null],
    ["ABCD2340", null],
    ["ABCD23O5", null],
  ])("normalises %j", (input, expected) => expect(normaliseReferralCode(input)).toBe(expected));
});
