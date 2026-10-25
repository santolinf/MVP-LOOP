import { describe, expect, it } from "vitest";
import { DEFAULT_FRESHNESS_THRESHOLDS, deriveFreshness, isFreshnessGrey } from "./index.js";
import type { UnderlyingStatus } from "../availability/index.js";

const now = new Date("2026-10-18T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("deriveFreshness (V33 cadences)", () => {
  const cases: [UnderlyingStatus, number | null, string][] = [
    ["AVAILABLE_NOW", 0, "CURRENT"],
    ["AVAILABLE_NOW", 7, "CURRENT"],
    ["AVAILABLE_NOW", 8, "NEEDS_CONFIRMATION"],
    ["AVAILABLE_NOW", 14, "NEEDS_CONFIRMATION"],
    ["AVAILABLE_NOW", 15, "UNCONFIRMED"],
    ["ENDING_SOON", 14, "CURRENT"],
    ["ENDING_SOON", 15, "NEEDS_CONFIRMATION"],
    ["ENDING_SOON", 29, "UNCONFIRMED"],
    ["IN_CONTRACT", 30, "CURRENT"],
    ["IN_CONTRACT", 31, "NEEDS_CONFIRMATION"],
    ["IN_CONTRACT", 61, "UNCONFIRMED"],
    ["PERMANENT", 60, "CURRENT"],
    ["PERMANENT", 61, "NEEDS_CONFIRMATION"],
    ["PERMANENT", 121, "UNCONFIRMED"],
    ["AVAILABLE_NOW", null, "UNCONFIRMED"],
  ];
  it.each(cases)("%s confirmed %s days ago is %s", (status, age, expected) => {
    const at = age === null ? null : daysAgo(age);
    expect(deriveFreshness(status, at, DEFAULT_FRESHNESS_THRESHOLDS, now)).toBe(expected);
  });

  it("is UNCONFIRMED when no threshold is configured for the status", () => {
    expect(deriveFreshness("PERMANENT", daysAgo(1), {}, now)).toBe("UNCONFIRMED");
  });

  it("only UNCONFIRMED renders grey", () => {
    expect(isFreshnessGrey("UNCONFIRMED")).toBe(true);
    expect(isFreshnessGrey("NEEDS_CONFIRMATION")).toBe(false);
    expect(isFreshnessGrey("CURRENT")).toBe(false);
  });
});
