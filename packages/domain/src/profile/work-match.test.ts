import { describe, expect, it } from "vitest";
import { assessWorkMatch, isExplicitLocation, type WorkPreferences, type WorkRequirement } from "./work-match.js";
import { preferenceGaps } from "./join-profile.js";

const base: WorkPreferences = {
  workLocations: ["SCOTLAND"],
  places: ["Edinburgh", "Glasgow", "Stirling"],
  workPatterns: ["HYBRID"],
  hybridDays: 2,
  remoteUk: false,
  occasionalTravel: null,
};

describe("assessWorkMatch (handover 06, acceptance 2-7)", () => {
  const cases: [string, Partial<WorkPreferences>, WorkRequirement, string][] = [
    ["explicit town, hybrid within the day limit", {}, { pattern: "HYBRID", place: "Glasgow", hybridDaysRequired: 2 }, "CONFIRMED"],
    ["explicit region (Scotland) covers a town in it", {}, { pattern: "HYBRID", region: "SCOTLAND", hybridDaysRequired: 1 }, "CONFIRMED"],
    ["hybrid 3 days when the maximum is 2 is not confirmed", {}, { pattern: "HYBRID", place: "Glasgow", hybridDaysRequired: 3 }, "POTENTIAL"],
    ["a place never chosen is not confirmed by radius", {}, { pattern: "HYBRID", place: "Manchester", hybridDaysRequired: 2 }, "POTENTIAL"],
    ["on-site not accepted is a non-match", {}, { pattern: "ONSITE", place: "Manchester" }, "NO_MATCH"],
    ["on-site accepted at an unselected place is only potential", { workPatterns: ["ONSITE"] }, { pattern: "ONSITE", place: "Manchester" }, "POTENTIAL"],
    ["fully on-site ignores the hybrid-day limit", { workPatterns: ["HYBRID", "ONSITE"], hybridDays: 1 }, { pattern: "ONSITE", place: "Edinburgh" }, "CONFIRMED"],
    ["remote only: remote is confirmed", { workPatterns: ["REMOTE"], remoteUk: true }, { pattern: "REMOTE" }, "CONFIRMED"],
    ["remote only: no on-site match is confirmed", { workPatterns: ["REMOTE"], remoteUk: true }, { pattern: "ONSITE", place: "Edinburgh" }, "NO_MATCH"],
    ["anywhere in the UK is explicit", { workLocations: ["ANYWHERE"], places: [] }, { pattern: "HYBRID", place: "Leeds", hybridDaysRequired: 2 }, "CONFIRMED"],
  ];
  it.each(cases)("%s", (_n, over, req, want) => expect(assessWorkMatch({ ...base, ...over }, req)).toBe(want));

  it("matches town names case-insensitively", () => expect(isExplicitLocation(base, undefined, "edinburgh")).toBe(true));
});

describe("preferenceGaps: work pattern rules", () => {
  const ok = {
    targetDayRatePence: 60000,
    minDayRatePence: 50000,
    ir35Status: "OUTSIDE",
    usesUmbrella: false,
    umbrellaProvider: null,
    workLocations: ["SCOTLAND"],
    otherLocations: null,
    workLocationsConfirmed: true,
    securityClearance: "NO",
    workPatterns: ["REMOTE"],
  };
  it("is complete for a remote-only contractor", () => expect(preferenceGaps(ok)).toEqual([]));
  it("needs hybrid days only when hybrid is accepted", () => {
    expect(preferenceGaps({ ...ok, workPatterns: ["HYBRID"], hybridDays: null })).toContain("HYBRID_DAYS");
    expect(preferenceGaps({ ...ok, workPatterns: ["HYBRID"], hybridDays: 2 })).toEqual([]);
    expect(preferenceGaps({ ...ok, workPatterns: ["ONSITE"], hybridDays: null })).toEqual([]);
  });
  it("flags UK-wide remote Yes without remote accepted", () => {
    expect(preferenceGaps({ ...ok, workPatterns: ["ONSITE"], remoteUk: true })).toContain("REMOTE_CONFLICT");
    expect(preferenceGaps({ ...ok, workPatterns: ["REMOTE", "ONSITE"], remoteUk: true })).toEqual([]);
  });
});
