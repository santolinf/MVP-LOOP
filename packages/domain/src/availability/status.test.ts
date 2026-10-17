import { describe, expect, it } from "vitest";
import { describeAvailability } from "./status.js";

const now = new Date("2026-10-15T12:00:00Z");
const confirmed = new Date("2026-10-14T09:00:00Z");

describe("describeAvailability (B3, B4)", () => {
  it("lime reconfirms 14 days after last confirmation", () => {
    const s = describeAvailability(
      { employment: "BETWEEN_CONTRACTS", availableFrom: new Date("2026-10-15"), lastConfirmedAt: confirmed },
      now,
    );
    expect(s.colour).toBe("LIME");
    expect(s.label).toBe("Available now");
    expect(s.nextCheckAt?.toISOString()).toBe("2026-10-28T09:00:00.000Z");
  });
  it("blue reconfirms after 12 weeks", () => {
    const s = describeAvailability({ employment: "PERMANENT", availableFrom: null, lastConfirmedAt: confirmed }, now);
    expect(s.colour).toBe("BLUE");
    expect(s.nextCheckAt?.toISOString()).toBe("2027-01-06T09:00:00.000Z");
  });
  it("grey has no scheduled check and is never promoted", () => {
    const s = describeAvailability({ employment: "CONTRACTING", availableFrom: null, lastConfirmedAt: null }, now);
    expect(s).toMatchObject({ colour: "GREY", nextCheckAt: null, lastConfirmedAt: null });
  });
});
