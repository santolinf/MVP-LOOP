import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  contractor: { findUnique: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
  referral: { findMany: vi.fn() },
  reminderConfig: { findMany: vi.fn() },
  queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));
vi.mock("@loop/db", () => ({
  prisma: {
    contractor: db.contractor,
    referral: db.referral,
    reminderConfig: db.reminderConfig,
    $transaction: db.$transaction,
  },
}));

import { FoundingService } from "../founding.service.js";

const audit = { record: vi.fn() };
const NOW = new Date("2026-10-17T12:00:00Z");

function eligibleContractor(foundingPlace: number | null = null) {
  db.contractor.findUnique.mockResolvedValue({
    id: "c1",
    foundingPlace,
    employmentSituation: "BETWEEN_CONTRACTS",
    availableFrom: new Date("2026-10-01T00:00:00Z"),
    lastConfirmedAt: new Date("2026-10-16T00:00:00Z"),
  });
  db.referral.findMany.mockResolvedValue([1, 2, 3, 4, 5].map((n) => ({ refereeId: `r${n}` })));
  db.contractor.count.mockResolvedValue(5);
}

describe("FoundingService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.reminderConfig.findMany.mockResolvedValue([]);
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn({ $queryRaw: db.queryRaw, contractor: { updateMany: db.contractor.updateMany } }),
    );
  });

  it("reports progress and eligibility", async () => {
    eligibleContractor();
    const s = await new FoundingService(audit as never).status("c1", NOW);
    expect(s).toMatchObject({ required: 5, registeredReferrals: 5, isCurrentProfile: true, eligible: true, place: null });
  });

  it("is not eligible with fewer than 5 live referrals", async () => {
    eligibleContractor();
    db.contractor.count.mockResolvedValue(3);
    const svc = new FoundingService(audit as never);
    expect((await svc.status("c1", NOW)).eligible).toBe(false);
    expect(await svc.allocateIfEligible("c1", NOW)).toBeNull();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("allocates the next place and audits it", async () => {
    eligibleContractor();
    db.queryRaw.mockResolvedValue([{ allocated: 42 }]);
    db.contractor.updateMany.mockResolvedValue({ count: 1 });
    expect(await new FoundingService(audit as never).allocateIfEligible("c1", NOW)).toBe(42);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "founding.allocated", after: { foundingPlace: 42 } }),
    );
  });

  it("returns the existing place without touching the counter", async () => {
    eligibleContractor(7);
    expect(await new FoundingService(audit as never).allocateIfEligible("c1", NOW)).toBe(7);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("allocates nothing once the cap is reached", async () => {
    eligibleContractor();
    db.queryRaw.mockResolvedValue([]);
    expect(await new FoundingService(audit as never).allocateIfEligible("c1", NOW)).toBeNull();
    expect(db.contractor.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("rolls back and returns the current place when another request already allocated", async () => {
    eligibleContractor();
    db.queryRaw.mockResolvedValue([{ allocated: 9 }]);
    db.contractor.updateMany.mockResolvedValue({ count: 0 });
    // The retry snapshot sees the place the winning request set.
    db.contractor.findUnique
      .mockResolvedValueOnce({ id: "c1", foundingPlace: null, employmentSituation: "BETWEEN_CONTRACTS", availableFrom: new Date("2026-10-01T00:00:00Z"), lastConfirmedAt: NOW })
      .mockResolvedValueOnce({ id: "c1", foundingPlace: 8, employmentSituation: "BETWEEN_CONTRACTS", availableFrom: new Date("2026-10-01T00:00:00Z"), lastConfirmedAt: NOW });
    expect(await new FoundingService(audit as never).allocateIfEligible("c1", NOW)).toBe(8);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("never allocates more places than the cap under parallel completions", async () => {
    const cap = 3;
    let allocated = 0;
    // Mimics the atomic conditional UPDATE ... WHERE allocated < cap RETURNING.
    db.queryRaw.mockImplementation(async () => (allocated < cap ? [{ allocated: ++allocated }] : []));
    db.contractor.updateMany.mockResolvedValue({ count: 1 });
    db.contractor.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      foundingPlace: null,
      employmentSituation: "BETWEEN_CONTRACTS",
      availableFrom: new Date("2026-10-01T00:00:00Z"),
      lastConfirmedAt: new Date("2026-10-16T00:00:00Z"),
    }));
    db.referral.findMany.mockResolvedValue([1, 2, 3, 4, 5].map((n) => ({ refereeId: `r${n}` })));
    db.contractor.count.mockResolvedValue(5);

    const svc = new FoundingService(audit as never);
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => svc.allocateIfEligible(`c${i}`, NOW)));
    const places = results.filter((p): p is number => p !== null);
    expect(places).toHaveLength(cap);
    expect(new Set(places).size).toBe(cap);
    expect(Math.max(...places)).toBeLessThanOrEqual(cap);
  });
});
