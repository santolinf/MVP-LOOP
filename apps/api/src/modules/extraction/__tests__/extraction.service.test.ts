import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  created: [] as Array<Record<string, unknown>>,
  version: null as null | { versionNumber: number },
}));

vi.mock("@loop/db", () => ({
  prisma: {
    cvUpload: { findFirst: vi.fn(async () => ({ id: "u1" })) },
    cvVersion: { findUnique: vi.fn(async () => h.version) },
    extractionRun: {
      findUnique: vi.fn(async () => ({
        id: "r1",
        status: "READY",
        fields: [{ id: "f1", key: "headline", value: "Senior Dev", sourceExcerpt: "Senior Dev", confidence: 0.9 }],
      })),
    },
    confirmedProfileField: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => {
        h.created.push(create);
        return { id: "c1", value: create.value, edited: create.edited };
      }),
    },
  },
}));

const { ExtractionService } = await import("../extraction.service.js");
const audit = { record: vi.fn(async () => undefined) };
const svc = new ExtractionService(audit as never);

beforeEach(() => {
  h.created.length = 0;
  h.version = null;
  audit.record.mockClear();
});

describe("ExtractionService.confirmField", () => {
  it("stores a draft owner's confirmation against the draft, not a contractor", async () => {
    const out = await svc.confirmField({ draftId: "d1" }, "u1", "f1", undefined);
    expect(h.created[0]).toMatchObject({ contractorId: null, draftId: "d1", value: "Senior Dev", edited: false });
    expect(out.confirmedValue).toBe("Senior Dev");
    expect(out.suggestedValue).toBe("Senior Dev");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ actorId: undefined }));
  });

  it("stores a signed-in contractor's edit against the contractor and marks it edited", async () => {
    await svc.confirmField({ contractorId: "c9" }, "u1", "f1", "Lead Dev");
    expect(h.created[0]).toMatchObject({ contractorId: "c9", draftId: null, value: "Lead Dev", edited: true });
  });

  it("lets the first CV through the normal review", async () => {
    h.version = { versionNumber: 1 };
    await svc.confirmField({ contractorId: "c9" }, "u1", "f1", undefined);
    expect(h.created).toHaveLength(1);
  });

  it("refuses to write confirmed data straight from a replacement CV (A5)", async () => {
    h.version = { versionNumber: 2 };
    await expect(svc.confirmField({ contractorId: "c9" }, "u1", "f1", undefined)).rejects.toThrow("Review the changes");
    expect(h.created).toHaveLength(0);
  });
});
