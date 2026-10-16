import { describe, expect, it } from "vitest";
import { deriveAvailabilityColour, type AvailabilityFacts } from "./index.js";

const now = new Date("2026-10-15T12:00:00Z");
const confirmed = new Date("2026-10-14T09:00:00Z");

describe("deriveAvailabilityColour (B3)", () => {
  const cases: Array<[string, AvailabilityFacts, string]> = [
    ["permanent stays blue", { employment: "PERMANENT", availableFrom: null, lastConfirmedAt: null }, "BLUE"],
    ["unconfirmed is grey", { employment: "CONTRACTING", availableFrom: new Date("2026-10-01"), lastConfirmedAt: null }, "GREY"],
    ["no confirmed start date never green", { employment: "CONTRACTING", availableFrom: null, lastConfirmedAt: confirmed }, "GREY"],
    ["available now is lime", { employment: "BETWEEN_ROLES", availableFrom: new Date("2026-10-15"), lastConfirmedAt: confirmed }, "LIME"],
    ["within 28 days is orange", { employment: "CONTRACTING", availableFrom: new Date("2026-11-05"), lastConfirmedAt: confirmed }, "ORANGE"],
    ["beyond 28 days is red", { employment: "CONTRACTING", availableFrom: new Date("2026-12-31"), lastConfirmedAt: confirmed }, "RED"],
  ];
  it.each(cases)("%s", (_n, facts, expected) => {
    expect(deriveAvailabilityColour(facts, now)).toBe(expected);
  });
});
