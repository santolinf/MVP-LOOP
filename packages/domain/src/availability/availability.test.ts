import { describe, expect, it } from "vitest";
import { colourForStatus, deriveUnderlyingStatus, type AvailabilityFacts } from "./index.js";

const now = new Date("2026-10-17T12:00:00Z");
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const base: AvailabilityFacts = {
  employment: "CONTRACTING",
  contractEndDate: null,
  availableFrom: null,
  availableNowConfirmed: false,
  lastConfirmedAt: now,
};

describe("deriveUnderlyingStatus (B3)", () => {
  const cases: [string, Partial<AvailabilityFacts>, string, string][] = [
    ["permanent is blue", { employment: "PERMANENT" }, "PERMANENT", "BLUE"],
    ["permanent unconfirmed still blue", { employment: "PERMANENT", lastConfirmedAt: null }, "PERMANENT", "BLUE"],
    ["end in 28d is orange", { contractEndDate: d("2026-11-14") }, "ENDING_SOON", "ORANGE"],
    ["end in 1d is orange", { contractEndDate: d("2026-10-18") }, "ENDING_SOON", "ORANGE"],
    ["end in 29d is red", { contractEndDate: d("2026-11-15") }, "IN_CONTRACT", "RED"],
    ["end date today is grey, never green", { contractEndDate: d("2026-10-17") }, "END_DATE_REACHED", "GREY"],
    ["end date passed is grey, never green", { contractEndDate: d("2026-09-01") }, "END_DATE_REACHED", "GREY"],
    ["contracting without end date unconfirmed", {}, "UNCONFIRMED", "GREY"],
    ["never confirmed unconfirmed", { lastConfirmedAt: null, contractEndDate: d("2026-12-01") }, "UNCONFIRMED", "GREY"],
    ["explicit available now is lime", { employment: "BETWEEN_CONTRACTS", availableNowConfirmed: true }, "AVAILABLE_NOW", "LIME"],
    ["between contracts, no confirmation, past date is not lime", { employment: "BETWEEN_CONTRACTS", availableFrom: d("2026-10-01") }, "UNCONFIRMED", "GREY"],
    ["Q2 future start <=28d orange", { employment: "BETWEEN_CONTRACTS", availableFrom: d("2026-11-01") }, "ENDING_SOON", "ORANGE"],
    ["Q2 future start >28d red", { employment: "BETWEEN_CONTRACTS", availableFrom: d("2027-01-01") }, "IN_CONTRACT", "RED"],
  ];
  it.each(cases)("%s", (_n, facts, status, colour) => {
    const s = deriveUnderlyingStatus({ ...base, ...facts }, now);
    expect(s).toBe(status);
    expect(colourForStatus(s)).toBe(colour);
  });

  it("future start mapping can be switched off", () => {
    const s = deriveUnderlyingStatus(
      { ...base, employment: "BETWEEN_CONTRACTS", availableFrom: d("2026-11-01") },
      now,
      { futureStartMapping: false },
    );
    expect(s).toBe("UNCONFIRMED");
  });
});
