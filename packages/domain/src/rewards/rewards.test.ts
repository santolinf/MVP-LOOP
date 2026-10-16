import { describe, expect, it } from "vitest";
import { isRewardApprovable } from "./index.js";

describe("isRewardApprovable (B7)", () => {
  it.each([
    [{ agencyVerified: true, paidServiceMonths: 3 }, true],
    [{ agencyVerified: false, paidServiceMonths: 6 }, false],
    [{ agencyVerified: true, paidServiceMonths: 2 }, false],
  ])("%j -> %s", (c, expected) => {
    expect(isRewardApprovable(c)).toBe(expected);
  });
});
