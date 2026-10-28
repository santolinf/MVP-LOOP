import { describe, expect, it } from "vitest";
import { foundingPlacesLeft, isFoundingEligible } from "./index.js";

describe("isFoundingEligible (B6)", () => {
  it.each([
    [{ uniqueRegisteredDirectReferrals: 5, isCurrent: true }, true],
    [{ uniqueRegisteredDirectReferrals: 6, isCurrent: true }, true],
    [{ uniqueRegisteredDirectReferrals: 4, isCurrent: true }, false],
    [{ uniqueRegisteredDirectReferrals: 9, isCurrent: false }, false],
    [{ uniqueRegisteredDirectReferrals: 5, isCurrent: true, requireAppSignIn: true, hasVerifiedAppSignIn: false }, false],
    [{ uniqueRegisteredDirectReferrals: 5, isCurrent: true, requireAppSignIn: true, hasVerifiedAppSignIn: true }, true],
  ])("%j -> %s", (c, expected) => {
    expect(isFoundingEligible(c)).toBe(expected);
  });
});

describe("foundingPlacesLeft", () => {
  it.each([
    [0, 50_000],
    [49_999, 1],
    [50_000, 0],
    [60_000, 0],
  ])("allocated %s -> %s left", (allocated, left) => expect(foundingPlacesLeft(allocated)).toBe(left));
});
