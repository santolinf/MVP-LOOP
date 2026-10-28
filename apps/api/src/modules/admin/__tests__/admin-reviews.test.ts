import "reflect-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FRESHNESS_THRESHOLDS } from "@loop/domain";

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  contractor: { findMany: vi.fn() },
  cvChange: { groupBy: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@loop/db", () => ({ prisma: db, Prisma: {} }));
vi.mock("../../../common/freshness-config.js", () => ({ loadFreshnessThresholds: async () => DEFAULT_FRESHNESS_THRESHOLDS }));

const { AdminReviewsService } = await import("../admin-reviews.service.js");

const introductions = { foundingSummary: vi.fn() };
const svc = () => new AdminReviewsService(introductions as never);
const NOW = new Date("2026-10-26T10:00:00Z");

beforeEach(() => {
  vi.resetAllMocks();
  introductions.foundingSummary.mockResolvedValue({ allocated: 49_998, cap: 50_000, recent: [] });
});

describe("AdminReviewsService.foundingTracker", () => {
  it("shows counted-introduction progress, the places left, and whether each contractor is current", async () => {
    db.$queryRaw.mockResolvedValueOnce([{ id: "a", n: 5 }, { id: "b", n: 2 }]).mockResolvedValueOnce([{ total: 2 }]);
    db.contractor.findMany.mockResolvedValue([
      { id: "a", firstName: "Ann", lastName: "Lee", employmentSituation: "BETWEEN_CONTRACTS", availableFrom: null, contractEndDate: null, lastConfirmedAt: new Date("2026-10-25T09:00:00Z"), confirmationSource: "WEB" },
      { id: "b", firstName: "Bo", lastName: null, employmentSituation: "BETWEEN_CONTRACTS", availableFrom: null, contractEndDate: null, lastConfirmedAt: null, confirmationSource: null },
    ]);
    const r = await svc().foundingTracker({ page: 1, pageSize: 25 }, NOW);
    expect(r).toMatchObject({ allocated: 49_998, cap: 50_000, remaining: 2, total: 2 });
    expect(r.items[0]).toMatchObject({ contractorId: "a", name: "Ann Lee", registeredReferrals: 5, required: 5, isCurrent: true, state: "QUALIFIED" });
    expect(r.items[1]).toMatchObject({ contractorId: "b", registeredReferrals: 2, isCurrent: false, state: "IN_PROGRESS" });
  });

  it("five introductions but not current is still in progress", async () => {
    db.$queryRaw.mockResolvedValueOnce([{ id: "b", n: 5 }]).mockResolvedValueOnce([{ total: 1 }]);
    db.contractor.findMany.mockResolvedValue([
      { id: "b", firstName: "Bo", lastName: null, employmentSituation: "BETWEEN_CONTRACTS", availableFrom: null, contractEndDate: null, lastConfirmedAt: null, confirmationSource: null },
    ]);
    const r = await svc().foundingTracker({ page: 1, pageSize: 25 }, NOW);
    expect(r.items[0]?.state).toBe("IN_PROGRESS");
  });
});

describe("AdminReviewsService.profileChanges", () => {
  it("lists contractors with pending suggestions, oldest first, with their material count", async () => {
    db.cvChange.groupBy
      .mockResolvedValueOnce([{ contractorId: "a", _count: { _all: 3 }, _min: { createdAt: new Date("2026-10-01T09:00:00Z") } }])
      .mockResolvedValueOnce([{ contractorId: "a", _count: { _all: 1 } }]);
    db.cvChange.findMany.mockResolvedValue([{ contractorId: "a" }]);
    db.contractor.findMany.mockResolvedValue([{ id: "a", firstName: "Ann", lastName: "Lee" }]);
    const r = await svc().profileChanges({ page: 1, pageSize: 25 });
    expect(r.items).toEqual([{ contractorId: "a", name: "Ann Lee", pending: 3, material: 1, oldestAt: "2026-10-01T09:00:00.000Z" }]);
    expect(r.total).toBe(1);
    expect(db.cvChange.groupBy.mock.calls[0]?.[0].where).toEqual({ status: "PENDING" });
  });

  it("materialOnly narrows the queue", async () => {
    db.cvChange.groupBy.mockResolvedValue([]);
    db.cvChange.findMany.mockResolvedValue([]);
    await svc().profileChanges({ materialOnly: "true", page: 1, pageSize: 25 });
    expect(db.cvChange.groupBy.mock.calls[0]?.[0].where).toEqual({ status: "PENDING", material: true });
  });
});
