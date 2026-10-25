import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  cvChange: { updateMany: vi.fn() },
  confirmedProfileField: { deleteMany: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
  cvVersion: { findUnique: vi.fn() },
  extractionRun: { findUnique: vi.fn() },
}));
const db = vi.hoisted(() => ({
  cvChange: { findFirst: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  cvVersion: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@loop/db", () => ({ prisma: db }));
const purge = vi.hoisted(() => vi.fn(async () => 2));
vi.mock("../cv-changes.js", () => ({ purgeCvData: purge }));

const { CvVersionsService } = await import("../cv-versions.service.js");
const audit = { record: vi.fn() };
const storage = {};
const svc = new CvVersionsService(audit as never, storage as never);

const change = (over: Record<string, unknown>) => ({
  id: "ch1",
  contractorId: "c1",
  cvVersionId: "v2",
  key: "currentRole",
  kind: "CHANGED",
  material: true,
  previousFieldId: "k1",
  previousValue: "Engineer",
  proposedFieldId: "f1",
  proposedValue: "Lead Engineer",
  status: "PENDING",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
  tx.cvChange.updateMany.mockResolvedValue({ count: 1 });
  tx.confirmedProfileField.updateMany.mockResolvedValue({ count: 1 });
  db.cvChange.findMany.mockResolvedValue([]);
});

describe("CvVersionsService.resolve", () => {
  it("rejecting changes nothing in the confirmed profile", async () => {
    db.cvChange.findFirst.mockResolvedValue(change({}));
    await svc.resolve("c1", "ch1", { decision: "REJECT" });
    expect(tx.cvChange.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "REJECTED" }) }));
    expect(tx.confirmedProfileField.updateMany).not.toHaveBeenCalled();
    expect(tx.confirmedProfileField.upsert).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "cv.change.rejected", after: expect.objectContaining({ value: "Engineer" }) }),
    );
  });

  it("accepting a CHANGED proposal updates the confirmed row", async () => {
    db.cvChange.findFirst.mockResolvedValue(change({}));
    await svc.resolve("c1", "ch1", { decision: "ACCEPT" });
    expect(tx.confirmedProfileField.updateMany).toHaveBeenCalledWith({
      where: { id: "k1", contractorId: "c1" },
      data: { value: "Lead Engineer", edited: false },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "cv.change.accepted" }));
  });

  it("accepting an ADDED proposal creates a confirmed field under the new run", async () => {
    db.cvChange.findFirst.mockResolvedValue(change({ kind: "ADDED", key: "skill", previousFieldId: null, previousValue: null, proposedValue: "Rust" }));
    tx.cvVersion.findUnique.mockResolvedValue({ cvUploadId: "u2" });
    tx.extractionRun.findUnique.mockResolvedValue({ id: "r2" });
    await svc.resolve("c1", "ch1", { decision: "ACCEPT" });
    expect(tx.confirmedProfileField.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ contractorId: "c1", extractionRunId: "r2", fieldId: "f1", key: "skill", value: "Rust" }),
      }),
    );
  });

  it("accepting a REMOVED proposal deletes the confirmed row", async () => {
    db.cvChange.findFirst.mockResolvedValue(change({ kind: "REMOVED", key: "skill", proposedFieldId: null, proposedValue: null }));
    await svc.resolve("c1", "ch1", { decision: "ACCEPT" });
    expect(tx.confirmedProfileField.deleteMany).toHaveBeenCalledWith({ where: { id: "k1", contractorId: "c1" } });
  });

  it("refuses a change that is already resolved, or lost a parallel race", async () => {
    db.cvChange.findFirst.mockResolvedValue(change({ status: "ACCEPTED" }));
    await expect(svc.resolve("c1", "ch1", { decision: "ACCEPT" })).rejects.toThrow("already been reviewed");
    db.cvChange.findFirst.mockResolvedValue(change({}));
    tx.cvChange.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.resolve("c1", "ch1", { decision: "ACCEPT" })).rejects.toThrow("already been reviewed");
    expect(tx.confirmedProfileField.updateMany).not.toHaveBeenCalled();
  });

  it("treats another contractor's change as not found", async () => {
    db.cvChange.findFirst.mockResolvedValue(null);
    await expect(svc.resolve("c2", "ch1", { decision: "ACCEPT" })).rejects.toThrow("Change not found");
    expect(db.cvChange.findFirst).toHaveBeenCalledWith({ where: { id: "ch1", contractorId: "c2" } });
  });
});

describe("CvVersionsService.deleteAll", () => {
  it("purges everything and audits the count", async () => {
    expect(await svc.deleteAll("c1")).toBe(2);
    expect(purge).toHaveBeenCalledWith("c1", storage);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "cv.deleted", after: { uploads: 2 } }));
  });
});

describe("CvVersionsService.versions", () => {
  it("reports pending change counts per version", async () => {
    db.cvVersion.findMany.mockResolvedValue([{ id: "v2", versionNumber: 2, cvUploadId: "u2", createdAt: new Date("2026-10-01T00:00:00Z") }]);
    db.cvChange.groupBy.mockResolvedValue([{ cvVersionId: "v2", _count: { _all: 3 } }]);
    expect((await svc.versions("c1")).items[0]).toMatchObject({ versionNumber: 2, pendingChanges: 3 });
  });
});
