import { describe, expect, it } from "vitest";
import type { ConsentPurpose } from "../consent/index.js";
import { decideGoLive, mustLeaveLive, type GoLiveBlocker, type GoLiveInput } from "./index.js";

const ready: GoLiveInput = {
  firstName: "Ada",
  lastName: "Lovelace",
  eligibilityDeclared: true,
  availabilityConfirmed: true,
  confirmedProfileFields: 1,
  profileComplete: true,
  preferencesComplete: true,
  activeConsents: new Set<ConsentPurpose>(["PROFILE_VISIBILITY", "OPERATIONAL_EMAIL"]),
};

describe("decideGoLive", () => {
  it("allows a complete profile with required consents", () => expect(decideGoLive(ready)).toEqual({ allowed: true }));

  it.each<[string, Partial<GoLiveInput>, GoLiveBlocker[]]>([
    ["missing first name", { firstName: null }, ["NAME_MISSING"]],
    ["blank last name", { lastName: "  " }, ["NAME_MISSING"]],
    ["no eligibility", { eligibilityDeclared: false }, ["ELIGIBILITY_MISSING"]],
    ["availability not confirmed", { availabilityConfirmed: false }, ["AVAILABILITY_NOT_CONFIRMED"]],
    ["no confirmed profile field", { confirmedProfileFields: 0 }, ["PROFILE_FIELD_MISSING"]],
    ["profile incomplete", { profileComplete: false }, ["PROFILE_INCOMPLETE"]],
    ["preferences incomplete", { preferencesComplete: false }, ["PREFERENCES_INCOMPLETE"]],
    ["no visibility consent", { activeConsents: new Set<ConsentPurpose>(["OPERATIONAL_EMAIL"]) }, ["CONSENT_PROFILE_VISIBILITY"]],
    ["no operational consent", { activeConsents: new Set<ConsentPurpose>(["PROFILE_VISIBILITY"]) }, ["CONSENT_OPERATIONAL_EMAIL"]],
    [
      "only marketing consents",
      { activeConsents: new Set<ConsentPurpose>(["LOOP_MARKETING", "PARTNER_MARKETING"]) },
      ["CONSENT_PROFILE_VISIBILITY", "CONSENT_OPERATIONAL_EMAIL"],
    ],
  ])("blocks: %s", (_n, patch, blockers) => {
    expect(decideGoLive({ ...ready, ...patch })).toEqual({ allowed: false, blockers });
  });

  it("reports every blocker at once", () => {
    const d = decideGoLive({
      firstName: null,
      lastName: null,
      eligibilityDeclared: false,
      availabilityConfirmed: false,
      confirmedProfileFields: 0,
      profileComplete: false,
      preferencesComplete: false,
      activeConsents: new Set(),
    });
    expect(d).toEqual({
      allowed: false,
      blockers: [
        "NAME_MISSING",
        "ELIGIBILITY_MISSING",
        "AVAILABILITY_NOT_CONFIRMED",
        "PROFILE_FIELD_MISSING",
        "PROFILE_INCOMPLETE",
        "PREFERENCES_INCOMPLETE",
        "CONSENT_PROFILE_VISIBILITY",
        "CONSENT_OPERATIONAL_EMAIL",
      ],
    });
  });
});

describe("mustLeaveLive", () => {
  it.each<[ConsentPurpose[], boolean]>([
    [["PROFILE_VISIBILITY", "OPERATIONAL_EMAIL"], false],
    [["OPERATIONAL_EMAIL"], true],
    [["PROFILE_VISIBILITY"], true],
    [["PROFILE_VISIBILITY", "OPERATIONAL_EMAIL", "LOOP_MARKETING"], false],
  ])("active %j -> %s", (active, leave) => expect(mustLeaveLive(new Set(active))).toBe(leave));
});
