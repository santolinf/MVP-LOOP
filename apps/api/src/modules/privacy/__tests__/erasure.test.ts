import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => {
  const del = () => ({ deleteMany: vi.fn() });
  return {
    session: del(),
    confirmedProfileField: del(),
    contractorPreferences: del(),
    contractorProfileDetails: del(),
    assignment: del(),
    consentRecord: del(),
    eligibilityDeclaration: del(),
    confirmationEvent: del(),
    deliveryLog: del(),
    message: { ...del(), findMany: vi.fn(async () => [{ id: "m1" }]) },
    scheduledReminder: del(),
    confirmLink: del(),
    campaignRecipient: del(),
    loopMessage: del(),
    notification: del(),
    manualCallTask: del(),
    contractor: { update: vi.fn() },
    auditEvent: { updateMany: vi.fn(), create: vi.fn() },
    $executeRaw: vi.fn(),
  };
});
const db = vi.hoisted(() => ({ contractor: { findUnique: vi.fn() }, $transaction: vi.fn() }));
vi.mock("@loop/db", () => ({ prisma: db, Prisma: { DbNull: "DbNull" } }));
const purge = vi.hoisted(() => vi.fn(async () => 1));
vi.mock("../../cv/cv-changes.js", () => ({ purgeCvData: purge }));

const { eraseContractor } = await import("../erasure.js");
const store = { delete: vi.fn() };
const NOW = new Date("2026-10-24T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  db.contractor.findUnique.mockResolvedValue({ id: "c1", erasedAt: null });
  db.$transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
});

describe("eraseContractor", () => {
  it("deletes files and owned records, anonymises the row, redacts audit payloads, then writes a PII-free tombstone", async () => {
    expect(await eraseContractor("c1", store, NOW)).toBe("ERASED");
    expect(purge).toHaveBeenCalledWith("c1", store);
    for (const t of ["session", "confirmedProfileField", "contractorPreferences", "contractorProfileDetails", "assignment", "consentRecord", "eligibilityDeclaration", "confirmationEvent", "message", "scheduledReminder", "confirmLink", "campaignRecipient", "loopMessage", "notification", "manualCallTask"] as const) {
      expect(tx[t].deleteMany).toHaveBeenCalledWith({ where: { contractorId: "c1" } });
    }
    expect(tx.deliveryLog.deleteMany).toHaveBeenCalledWith({ where: { messageId: { in: ["m1"] } } });
    const data = tx.contractor.update.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({ phone: "erased:c1", email: null, firstName: null, lastName: null, live: false, searchSuppressed: true, erasedAt: NOW });
    expect(tx.auditEvent.updateMany).toHaveBeenCalledWith({
      where: { OR: [{ entityId: "c1" }, { actorId: "c1" }] },
      data: { before: "DbNull", after: "DbNull" },
    });
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: { entityType: "Contractor", entityId: "c1", action: "privacy.erased", after: { erasedAt: NOW.toISOString() } },
    });
    // The tombstone must be written after the redaction, or it would be blanked too.
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.auditEvent.updateMany.mock.invocationCallOrder[0] ?? 0);
    expect(tx.auditEvent.updateMany.mock.invocationCallOrder[0]).toBeLessThan(tx.auditEvent.create.mock.invocationCallOrder[0] ?? 0);
  });

  it("is idempotent and tolerates a missing contractor", async () => {
    db.contractor.findUnique.mockResolvedValue({ id: "c1", erasedAt: NOW });
    expect(await eraseContractor("c1", store, NOW)).toBe("ALREADY_ERASED");
    db.contractor.findUnique.mockResolvedValue(null);
    expect(await eraseContractor("c1", store, NOW)).toBe("NOT_FOUND");
    expect(purge).not.toHaveBeenCalled();
  });

  it("does not touch the database rows when file deletion fails", async () => {
    purge.mockRejectedValueOnce(new Error("s3 down"));
    await expect(eraseContractor("c1", store, NOW)).rejects.toThrow("s3 down");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
