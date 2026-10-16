import { describe, expect, it } from "vitest";
import { isFoundingEligible } from "./index.js";

describe("isFoundingEligible (B6)", () => {
  it.each([
    [{ uniqueRegisteredDirectReferrals: 5, isCurrent: true }, true],
    [{ uniqueRegisteredDirectReferrals: 4, isCurrent: true }, false],
    [{ uniqueRegisteredDirectReferrals: 9, isCurrent: false }, false],
  ])("%j -> %s", (c, expected) => {
    expect(isFoundingEligible(c)).toBe(expected);
  });
});
