import { describe, expect, it } from "vitest";
import {
  generateReferralCode,
  introductionCounts,
  isReferralValid,
  maskName,
  normaliseEmailIdentity,
  normaliseReferralCode,
  REFERRAL_CODE_LENGTH,
  sameDeviceClusters,
} from "./index.js";

describe("introductionCounts", () => {
  it.each([
    [{ locked: true, flagStatuses: [] }, true],
    [{ locked: false, flagStatuses: [] }, false],
    [{ locked: true, flagStatuses: ["OPEN"] }, false],
    [{ locked: true, flagStatuses: ["CONFIRMED"] }, false],
    [{ locked: true, flagStatuses: ["CLEARED"] }, true],
  ] as const)("%j -> %s", (i, expected) => expect(introductionCounts(i)).toBe(expected));
});

describe("maskName", () => {
  it.each([
    ["Sam", "Jones", "S*** J."],
    ["sam", null, "S***"],
    [null, null, "A LOOP member"],
  ])("%s %s", (f, l, expected) => expect(maskName(f, l)).toBe(expected));
});

describe("normaliseEmailIdentity", () => {
  it.each([
    ["Sam.Jones+loop@Gmail.com", "samjones@gmail.com"],
    ["s.j@googlemail.com", "sj@gmail.com"],
    ["a.b+x@corp.co.uk", "a.b@corp.co.uk"],
  ])("%s", (input, expected) => expect(normaliseEmailIdentity(input)).toBe(expected));
});

describe("sameDeviceClusters", () => {
  it("groups referrals sharing a device and ignores unknown devices", () => {
    expect(
      sameDeviceClusters([
        { referralId: "1", deviceHash: "d" },
        { referralId: "2", deviceHash: "d" },
        { referralId: "3", deviceHash: "e" },
        { referralId: "4", deviceHash: null },
        { referralId: "5", deviceHash: null },
      ]),
    ).toEqual([["1", "2"]]);
  });
});

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
