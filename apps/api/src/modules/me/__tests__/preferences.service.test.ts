import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreferencesSchema, UpdatePreferencesRequestSchema } from "@loop/contracts";

const db = vi.hoisted(() => ({
  contractor: { findUnique: vi.fn() },
  contractorPreferences: { findUnique: vi.fn(), upsert: vi.fn() },
}));
vi.mock("@loop/db", () => ({ prisma: db }));

import { PreferencesService } from "../preferences.service.js";

const valid = {
  workTypes: ["CONTRACT_OUTSIDE_IR35"],
  rateBand: "R500_600",
  remote: "HYBRID",
  regions: ["LONDON"],
  sectors: ["FINANCIAL_SERVICES"],
  noticePeriod: "TWO_WEEKS",
};

describe("preferences validation", () => {
  it("accepts a valid set", () => expect(UpdatePreferencesRequestSchema.safeParse(valid).success).toBe(true));
  it.each([
    ["unknown work type", { ...valid, workTypes: ["FREELANCE"] }],
    ["unknown rate band", { ...valid, rateBand: "R9999" }],
    ["unknown remote value", { ...valid, remote: "ANYWHERE" }],
    ["unknown region", { ...valid, regions: ["MARS"] }],
    ["unknown sector", { ...valid, sectors: ["CRYPTO"] }],
    ["unknown notice period", { ...valid, noticePeriod: "NEVER" }],
    ["duplicate values", { ...valid, sectors: ["RETAIL", "RETAIL"] }],
    ["unknown key", { ...valid, extra: 1 }],
  ])("rejects %s", (_n, body) => expect(UpdatePreferencesRequestSchema.safeParse(body).success).toBe(false));
  it("allows empty selections", () =>
    expect(
      PreferencesSchema.safeParse({ workTypes: [], rateBand: null, remote: null, regions: [], sectors: [], noticePeriod: null }).success,
    ).toBe(true));
});

describe("PreferencesService", () => {
  const audit = { record: vi.fn() };
  const svc = new PreferencesService(audit as never);
  beforeEach(() => vi.clearAllMocks());

  it("returns empty preferences before any are saved", async () => {
    db.contractorPreferences.findUnique.mockResolvedValue(null);
    expect(await svc.get("c1")).toMatchObject({ workTypes: [], rateBand: null });
  });

  it("replace upserts and audits before/after without touching confirmation fields", async () => {
    db.contractor.findUnique.mockResolvedValue({ id: "c1" });
    db.contractorPreferences.findUnique.mockResolvedValue(null);
    db.contractorPreferences.upsert.mockResolvedValue({ contractorId: "c1", ...valid });
    const out = await svc.replace("c1", UpdatePreferencesRequestSchema.parse(valid));
    expect(out).toEqual(valid);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "preferences.updated", entityId: "c1", after: valid }),
    );
  });
});
