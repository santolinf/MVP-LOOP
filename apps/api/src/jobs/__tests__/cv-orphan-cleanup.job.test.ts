import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  drafts: [] as { id: string; adoptedById: string | null; expiresAt: Date }[],
  uploads: [] as { id: string; contractorId: string | null; draftId: string | null; status: string; createdAt: Date; quarantineKey: string; objectKey: string | null }[],
  decls: [] as { id: string; contractorId: string | null; draftId: string | null }[],
}));

vi.mock("@loop/db", () => ({
  prisma: {
    uploadDraft: {
      findMany: vi.fn(async ({ where }: { where: { expiresAt: { lte: Date } } }) =>
        h.drafts.filter((d) => d.adoptedById === null && d.expiresAt <= where.expiresAt.lte).map((d) => ({ id: d.id })),
      ),
      deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        const before = h.drafts.length;
        h.drafts = h.drafts.filter((d) => !(where.id.in.includes(d.id) && d.adoptedById === null));
        return { count: before - h.drafts.length };
      }),
    },
    cvUpload: {
      findMany: vi.fn(async ({ where }: { where: { OR: [{ draftId: { in: string[] } }, { createdAt: { lte: Date } }] } }) => {
        const [byDraft, byAge] = where.OR;
        return h.uploads.filter(
          (u) =>
            u.contractorId === null &&
            ((u.draftId !== null && byDraft.draftId.in.includes(u.draftId)) || (u.status === "PENDING" && u.createdAt <= byAge.createdAt.lte)),
        );
      }),
      deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        const before = h.uploads.length;
        h.uploads = h.uploads.filter((u) => !where.id.in.includes(u.id));
        return { count: before - h.uploads.length };
      }),
    },
    eligibilityDeclaration: {
      deleteMany: vi.fn(async ({ where }: { where: { draftId: { in: string[] } } }) => {
        const before = h.decls.length;
        h.decls = h.decls.filter((d) => !(d.contractorId === null && d.draftId !== null && where.draftId.in.includes(d.draftId)));
        return { count: before - h.decls.length };
      }),
    },
  },
}));
vi.mock("../../config/index.js", () => ({ loadEnv: vi.fn() }));
vi.mock("../../modules/cv/storage.service.js", () => ({ StorageService: class {} }));

const { runCvOrphanCleanup } = await import("../cv-orphan-cleanup.job.js");

const now = new Date("2026-10-21T12:00:00Z");
const hoursAgo = (n: number) => new Date(now.getTime() - n * 3_600_000);

beforeEach(() => {
  h.drafts = [
    { id: "expired", adoptedById: null, expiresAt: hoursAgo(1) },
    { id: "live", adoptedById: null, expiresAt: new Date(now.getTime() + 3_600_000) },
    { id: "adopted", adoptedById: "c1", expiresAt: hoursAgo(5) },
  ];
  h.uploads = [
    { id: "u1", contractorId: null, draftId: "expired", status: "READY", createdAt: hoursAgo(30), quarantineKey: "quarantine/1", objectKey: "cv/1" },
    { id: "u2", contractorId: null, draftId: "live", status: "PENDING", createdAt: hoursAgo(30), quarantineKey: "quarantine/2", objectKey: null },
    { id: "u3", contractorId: null, draftId: "live", status: "PENDING", createdAt: hoursAgo(1), quarantineKey: "quarantine/3", objectKey: null },
    { id: "u4", contractorId: "c1", draftId: "adopted", status: "READY", createdAt: hoursAgo(40), quarantineKey: "quarantine/4", objectKey: "cv/4" },
  ];
  h.decls = [
    { id: "e1", contractorId: null, draftId: "expired" },
    { id: "e2", contractorId: "c1", draftId: "adopted" },
  ];
});

describe("runCvOrphanCleanup", () => {
  it("removes expired anonymous drafts and stale pending uploads, deleting objects first", async () => {
    const store = { delete: vi.fn(async () => undefined) };
    const res = await runCvOrphanCleanup(store, 24, now);
    expect(res).toEqual({ uploads: 2, drafts: 1 });
    expect(store.delete.mock.calls.map((c) => (c as unknown[])[0]).sort()).toEqual(["cv/1", "quarantine/1", "quarantine/2"]);
    expect(h.uploads.map((u) => u.id).sort()).toEqual(["u3", "u4"]);
    expect(h.drafts.map((d) => d.id).sort()).toEqual(["adopted", "live"]);
    expect(h.decls.map((d) => d.id)).toEqual(["e2"]);
  });

  it("keeps rows when an object delete fails, so a retry can finish", async () => {
    const store = { delete: vi.fn(async () => Promise.reject(new Error("s3 down"))) };
    await expect(runCvOrphanCleanup(store, 24, now)).rejects.toThrow("s3 down");
    expect(h.uploads).toHaveLength(4);
  });

  it("is idempotent", async () => {
    const store = { delete: vi.fn(async () => undefined) };
    await runCvOrphanCleanup(store, 24, now);
    expect(await runCvOrphanCleanup(store, 24, now)).toEqual({ uploads: 0, drafts: 0 });
  });
});
