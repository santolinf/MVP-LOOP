import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn() }));
const event = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@loop/db", () => ({
  prisma: {
    contractor: db,
    confirmationEvent: event,
    reminderConfig: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: (fn: (tx: unknown) => unknown) => fn({ contractor: db, confirmationEvent: event }),
  },
}));

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
    expect(event.create.mock.calls[0]?.[0].data).toMatchObject({
      contractorId: "c1", source: "WEB", employmentSituation: "BETWEEN_CONTRACTS", confirmedAt: now,
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "availability.confirmed", entityId: "c1" }),
    );
  });
});

describe("MeService.confirmAvailability situation rules", () => {
  const audit = { record: vi.fn() };
  const svc = new MeService(audit as never);
  beforeEach(() => {
    vi.clearAllMocks();
    db.findUnique.mockResolvedValue(base);
    let row: object = base;
    db.update.mockImplementation(async (a: { data: object }) => (row = { ...row, ...a.data }));
  });

  it("permanent stays blue and clears dates", async () => {
    const me = await svc.confirmAvailability(
      "c1", { employment: "PERMANENT", availableFrom: "2026-11-01", contractEndDate: "2026-12-01" }, now,
    );
    expect(db.update.mock.calls[0]?.[0].data).toMatchObject({ availableFrom: null, contractEndDate: null });
    expect(me.availability.colour).toBe("BLUE");
  });

  it("a passed contract end date is grey, never auto-green", async () => {
    const me = await svc.confirmAvailability(
      "c1", { employment: "CONTRACTING", availableFrom: null, contractEndDate: "2026-10-01" }, now,
    );
    expect(me.availability.colour).toBe("GREY");
    expect(me.contractEndDate).toBe("2026-10-01");
  });

  it("records the supplied source on the contractor and the event", async () => {
    await svc.confirmAvailability(
      "c1", { employment: "CONTRACTING", availableFrom: null, contractEndDate: "2026-12-01" }, now, "EMAIL_LINK",
    );
    expect(db.update.mock.calls[0]?.[0].data).toMatchObject({ confirmationSource: "EMAIL_LINK" });
    expect(event.create.mock.calls[0]?.[0].data).toMatchObject({ source: "EMAIL_LINK" });
  });

  it("rejects an invalid start date without writing", async () => {
    await expect(
      svc.confirmAvailability("c1", { employment: "BETWEEN_CONTRACTS", availableFrom: "2026-10-01" }, now),
    ).rejects.toThrow(/availableFrom/);
    expect(db.update).not.toHaveBeenCalled();
    expect(event.create).not.toHaveBeenCalled();
  });
});

describe("resolveContractorId", () => {
  it("rejects when unauthenticated", () => expect(() => resolveContractorId({}, {})).toThrow());
  it("never uses the dev fallback in production", () =>
    expect(() => resolveContractorId({}, { NODE_ENV: "production", LOOP_DEV_CONTRACTOR_ID: "x" })).toThrow());
  it("uses the dev fallback outside production", () =>
    expect(resolveContractorId({}, { LOOP_DEV_CONTRACTOR_ID: "x" })).toBe("x"));
});
