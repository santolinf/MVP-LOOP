import { describe, expect, it } from "vitest";
import { preferenceGaps, profileGaps, type PreferenceFacts, type ProfileFacts } from "./join-profile.js";

const profile: ProfileFacts = { title: "Senior Data Engineer", skillCount: 5, location: "Edinburgh", locationConfirmed: true };

describe("profileGaps (V33 profile review)", () => {
  it("accepts a complete profile", () => expect(profileGaps(profile)).toEqual([]));
  it.each<[string, Partial<ProfileFacts>, string[]]>([
    ["no title", { title: null }, ["TITLE"]],
    ["blank title", { title: "  " }, ["TITLE"]],
    ["four skills", { skillCount: 4 }, ["SKILLS"]],
    ["no location", { location: null }, ["LOCATION"]],
    ["location not confirmed", { locationConfirmed: false }, ["LOCATION_CONFIRMATION"]],
    ["nothing", { title: null, skillCount: 0, location: "", locationConfirmed: false }, ["TITLE", "SKILLS", "LOCATION"]],
  ])("%s", (_n, patch, gaps) => expect(profileGaps({ ...profile, ...patch })).toEqual(gaps));
});

const prefs: PreferenceFacts = {
  targetDayRatePence: 60000,
  minDayRatePence: 50000,
  ir35Status: "OUTSIDE",
  usesUmbrella: false,
  umbrellaProvider: null,
  workLocations: ["LONDON"],
  otherLocations: null,
  workLocationsConfirmed: true,
  securityClearance: "NO",
  workPatterns: ["REMOTE"],
};

describe("preferenceGaps (V33 preferences)", () => {
  it("accepts complete preferences", () => expect(preferenceGaps(prefs)).toEqual([]));
  it.each<[string, Partial<PreferenceFacts>, string[]]>([
    ["no target rate", { targetDayRatePence: null }, ["TARGET_RATE"]],
    ["no minimum rate", { minDayRatePence: null }, ["MIN_RATE"]],
    ["minimum above target", { minDayRatePence: 70000 }, ["RATE_ORDER"]],
    ["no IR35", { ir35Status: null }, ["IR35"]],
    ["umbrella unanswered", { usesUmbrella: null }, ["UMBRELLA"]],
    ["umbrella without provider", { usesUmbrella: true, umbrellaProvider: " " }, ["UMBRELLA_PROVIDER"]],
    ["umbrella with provider", { usesUmbrella: true, umbrellaProvider: "Brookson" }, []],
    ["no locations", { workLocations: [] }, ["WORK_LOCATIONS"]],
    ["only a typed town", { workLocations: [], otherLocations: "Stirling" }, []],
    ["locations not confirmed", { workLocationsConfirmed: false }, ["WORK_LOCATIONS_CONFIRMATION"]],
    ["clearance unanswered", { securityClearance: null }, ["SECURITY_CLEARANCE"]],
    ["no work pattern", { workPatterns: [] }, ["WORK_PATTERN"]],
  ])("%s", (_n, patch, gaps) => expect(preferenceGaps({ ...prefs, ...patch })).toEqual(gaps));
});
