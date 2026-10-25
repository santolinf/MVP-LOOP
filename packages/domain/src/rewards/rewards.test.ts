import { describe, expect, it } from "vitest";
import { canTransitionReward, isPlacementRewardEligible, isRewardApprovable, wholeMonthsBetween } from "./index.js";

describe("isRewardApprovable (B7)", () => {
  it.each([
    [{ agencyVerified: true, paidServiceMonths: 3 }, true],
    [{ agencyVerified: false, paidServiceMonths: 6 }, false],
    [{ agencyVerified: true, paidServiceMonths: 2 }, false],
  ])("%j -> %s", (c, expected) => {
    expect(isRewardApprovable(c)).toBe(expected);
  });
});

describe("canTransitionReward", () => {
  it.each([
    ["PENDING", "UNDER_VERIFICATION", true],
    ["UNDER_VERIFICATION", "APPROVED", true],
    ["APPROVED", "PAID", true],
    ["PENDING", "APPROVED", false],
    ["PENDING", "PAID", false],
    ["PAID", "APPROVED", false],
    ["APPROVED", "PENDING", false],
  ] as const)("%s -> %s = %s", (from, to, expected) => expect(canTransitionReward(from, to)).toBe(expected));
});

describe("isPlacementRewardEligible", () => {
  it.each([
    [{ isRadar: false, hasEarlierPlacementReward: false }, true],
    [{ isRadar: true, hasEarlierPlacementReward: false }, false],
    [{ isRadar: false, hasEarlierPlacementReward: true }, false],
  ])("%j -> %s", (p, expected) => expect(isPlacementRewardEligible(p)).toBe(expected));
});

describe("wholeMonthsBetween", () => {
  it.each([
    ["2026-01-15", "2026-04-15", 3],
    ["2026-01-15", "2026-04-14", 2],
    ["2026-01-31", "2026-04-30", 2],
    ["2025-11-01", "2026-02-01", 3],
    ["2026-05-01", "2026-04-01", 0],
  ])("%s to %s = %s", (a, b, expected) => expect(wholeMonthsBetween(new Date(a), new Date(b))).toBe(expected));
});
