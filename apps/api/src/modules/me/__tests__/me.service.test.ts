import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn() }));
vi.mock("@loop/db", () => ({ prisma: { contractor: db, reminderConfig: { findMany: vi.fn().mockResolvedValue([]) } } }));

import { MeService } from "../me.service.js";
import { resolveContractorId } from "../current-contractor.js";

const now = new Date("2026-10-15T12:00:00Z");
const base = {
  id: "c1", firstName: "A", lastName: "B", live: true, paused: false,
  employmentSituation: "BETWEEN_CONTRACTS", availableFrom: new Date("2026-10-15T00:00:00Z"),
  lastConfirmedAt: null, confirmationSource: null,
};

describe("MeService", () => {
  const audit = { record: vi.fn() };
  const svc = new MeService(audit as never);
  beforeEach(() => vi.clearAllMocks());

  it("returns grey for an unconfirmed contractor", async () => {
    db.findUnique.mockResolvedValue(base);
    expect((await svc.get("c1", now)).availability.colour).toBe("GREY");
  });

  it("confirm sets WEB source, returns lime and audits before/after", async () => {
    db.findUnique.mockResolvedValue(base);
    db.update.mockResolvedValue({ ...base, lastConfirmedAt: now, confirmationSource: "WEB" });
    const me = await svc.confirmAvailability("c1", { employment: "BETWEEN_CONTRACTS", availableFrom: "2026-10-15" }, now);
    expect(db.update.mock.calls[0]?.[0].data).toMatchObject({ confirmationSource: "WEB", lastConfirmedAt: now });
    expect(me.availability.colour).toBe("LIME");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "availability.confirmed", entityId: "c1" }),
    );
  });
});

describe("resolveContractorId", () => {
  it("rejects when unauthenticated", () => expect(() => resolveContractorId({}, {})).toThrow());
  it("never uses the dev fallback in production", () =>
    expect(() => resolveContractorId({}, { NODE_ENV: "production", LOOP_DEV_CONTRACTOR_ID: "x" })).toThrow());
  it("uses the dev fallback outside production", () =>
    expect(resolveContractorId({}, { LOOP_DEV_CONTRACTOR_ID: "x" })).toBe("x"));
});
