import { describe, expect, it } from "vitest";
import { describeAvailability } from "./status.js";
import type { AvailabilityFacts } from "./index.js";

const now = new Date("2026-10-17T12:00:00Z");
const thresholds = {
  AVAILABLE_NOW: { currentDays: 7, needsConfirmationDays: 14 },
  IN_CONTRACT: { currentDays: 30, needsConfirmationDays: 60 },
  PERMANENT: { currentDays: 60, needsConfirmationDays: 120 },
};
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
const facts = (over: Partial<AvailabilityFacts>): AvailabilityFacts => ({
  employment: "BETWEEN_CONTRACTS",
  contractEndDate: null,
  availableFrom: null,
  availableNowConfirmed: true,
  lastConfirmedAt: now,
  ...over,
});

describe("describeAvailability", () => {
  it("current available-now is lime", () => {
    expect(describeAvailability(facts({}), thresholds, now)).toMatchObject({ colour: "LIME", freshnessState: "CURRENT" });
  });
  it("needs-confirmation keeps its colour", () => {
    expect(describeAvailability(facts({ lastConfirmedAt: ago(10) }), thresholds, now)).toMatchObject({
      colour: "LIME",
      freshnessState: "NEEDS_CONFIRMATION",
    });
  });
  it("unconfirmed freshness shows grey but keeps underlying status (Q4)", () => {
    expect(describeAvailability(facts({ lastConfirmedAt: ago(20) }), thresholds, now)).toMatchObject({
      colour: "GREY",
      underlyingStatus: "AVAILABLE_NOW",
      freshnessState: "UNCONFIRMED",
    });
  });
  it("status without thresholds is unconfirmed", () => {
    expect(describeAvailability(facts({}), {}, now).colour).toBe("GREY");
  });
});
