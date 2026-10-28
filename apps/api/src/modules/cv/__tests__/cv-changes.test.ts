import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  cvVersion: { findUnique: vi.fn(), deleteMany: vi.fn() },
  cvChange: { count: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
  extractionRun: { findUnique: vi.fn(), deleteMany: vi.fn() },
  confirmedProfileField: { findMany: vi.fn() },
  cvUpload: { findMany: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
vi.mock("@loop/db", () => ({ prisma: db, Prisma: { PrismaClientKnownRequestError: class extends Error {} } }));

const { proposeCvChanges, purgeCvData } = await import("../cv-changes.js");

const run = (fields: unknown[]) => ({ id: "r2", status: "READY", fields });

beforeEach(() => {
  vi.clearAllMocks();
  db.cvVersion.findUnique.mockResolvedValue({ id: "v2", contractorId: "c1", versionNumber: 2 });
  db.cvChange.count.mockResolvedValue(0);
  db.extractionRun.findUnique.mockResolvedValue(run([]));
  db.confirmedProfileField.findMany.mockResolvedValue([]);
});

describe("proposeCvChanges", () => {
  it("proposes nothing for the first CV (normal review applies)", async () => {
    db.cvVersion.findUnique.mockResolvedValue({ id: "v1", contractorId: "c1", versionNumber: 1 });
    expect(await proposeCvChanges("u1")).toBe(0);
    expect(db.cvChange.createMany).not.toHaveBeenCalled();
  });

  it("stores differences as PENDING proposals and compares against everything except the new run", async () => {
    db.confirmedProfileField.findMany.mockResolvedValue([{ id: "k1", key: "currentRole", value: "Engineer" }]);
    db.extractionRun.findUnique.mockResolvedValue(
      run([{ id: "f1", key: "currentRole", value: "Lead Engineer", sourceExcerpt: "Lead Engineer at Acme", confidence: 0.9 }]),
    );
    expect(await proposeCvChanges("u1")).toBe(1);
    expect(db.confirmedProfileField.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { contractorId: "c1", extractionRunId: { not: "r2" } } }),
    );
    expect(db.cvChange.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          contractorId: "c1",
          cvVersionId: "v2",
          key: "currentRole",
          kind: "CHANGED",
          material: true,
          previousFieldId: "k1",
          proposedFieldId: "f1",
          proposedValue: "Lead Engineer",
          proposedExcerpt: "Lead Engineer at Acme",
        }),
      ],
    });
  });

  it("is idempotent for a version that already has changes", async () => {
    db.cvChange.count.mockResolvedValue(2);
    expect(await proposeCvChanges("u1")).toBe(0);
    expect(db.cvChange.createMany).not.toHaveBeenCalled();
  });

  it("does nothing until the extraction run is READY", async () => {
    db.extractionRun.findUnique.mockResolvedValue({ id: "r2", status: "PENDING", fields: [] });
    expect(await proposeCvChanges("u1")).toBe(0);
  });
});

describe("purgeCvData", () => {
  it("deletes every object before any row", async () => {
    const order: string[] = [];
    db.cvUpload.findMany.mockResolvedValue([
      { id: "u1", quarantineKey: "quarantine/a", objectKey: "cv/a" },
      { id: "u2", quarantineKey: "quarantine/b", objectKey: null },
    ]);
    const store = { delete: vi.fn(async (k: string) => void order.push(`obj:${k}`)) };
    db.$transaction.mockImplementation(async (ops: unknown[]) => {
      order.push("rows");
      return ops;
    });
    expect(await purgeCvData("c1", store)).toBe(2);
    expect(order).toEqual(["obj:quarantine/a", "obj:cv/a", "obj:quarantine/b", "rows"]);
  });

  it("leaves rows in place when storage fails, so it can be retried", async () => {
    db.cvUpload.findMany.mockResolvedValue([{ id: "u1", quarantineKey: "q", objectKey: "cv/a" }]);
    await expect(purgeCvData("c1", { delete: vi.fn().mockRejectedValue(new Error("s3 down")) })).rejects.toThrow("s3 down");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
