import { beforeEach, describe, expect, it, vi } from "vitest";

interface Draft {
  id: string;
  tokenHash: string;
  ipHash: string | null;
  expiresAt: Date;
  adoptedById: string | null;
  adoptedAt: Date | null;
}

const h = vi.hoisted(() => ({
  drafts: [] as Draft[],
  uploadsMoved: 0,
  declsMoved: 0,
  fieldsMoved: 0,
}));

vi.mock("@loop/db", () => {
  const tx = {
    uploadDraft: {
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; adoptedById: null }; data: Partial<Draft> }) => {
        const d = h.drafts.find((x) => x.id === where.id && x.adoptedById === null);
        if (!d) return { count: 0 };
        Object.assign(d, data);
        return { count: 1 };
      }),
    },
    cvUpload: {
      updateMany: vi.fn(async () => {
        h.uploadsMoved++;
        return { count: 1 };
      }),
      findMany: vi.fn(async () => [{ id: "u1" }]),
    },
    extractionRun: { updateMany: vi.fn(async () => ({ count: 1 })) },
    confirmedProfileField: {
      updateMany: vi.fn(async () => {
        h.fieldsMoved++;
        return { count: 1 };
      }),
    },
    eligibilityDeclaration: {
      updateMany: vi.fn(async () => {
        h.declsMoved++;
        return { count: 1 };
      }),
    },
  };
  return {
    prisma: {
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<boolean>) => fn(tx)),
      uploadDraft: {
        create: vi.fn(async ({ data }: { data: Omit<Draft, "id" | "adoptedById" | "adoptedAt"> }) => {
          const d: Draft = { ...data, id: `d${h.drafts.length + 1}`, adoptedById: null, adoptedAt: null };
          h.drafts.push(d);
          return d;
        }),
        findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => h.drafts.find((d) => d.tokenHash === where.tokenHash) ?? null),
      },
    },
  };
});

const { DraftService } = await import("../draft.service.js");

const svc = new DraftService({ CV_ORPHAN_TTL_HOURS: 24 } as never);
const now = new Date("2026-10-21T12:00:00Z");

beforeEach(() => {
  h.drafts.length = 0;
  h.uploadsMoved = 0;
  h.declsMoved = 0;
  h.fieldsMoved = 0;
});

describe("DraftService", () => {
  it("stores only hashes, never the token or raw IP", async () => {
    const { draftToken, expiresAt } = await svc.create("1.2.3.4", now);
    expect(draftToken.length).toBeGreaterThanOrEqual(32);
    expect(h.drafts[0]?.tokenHash).not.toBe(draftToken);
    expect(h.drafts[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(h.drafts[0]?.ipHash).not.toBe("1.2.3.4");
    expect(expiresAt).toBe("2026-10-22T12:00:00.000Z");
  });

  it("resolves a live token and refuses missing, unknown and expired ones", async () => {
    const { draftToken } = await svc.create(undefined, now);
    await expect(svc.resolve(draftToken, now)).resolves.toEqual({ id: "d1" });
    await expect(svc.resolve(undefined, now)).rejects.toThrow();
    await expect(svc.resolve("nope", now)).rejects.toThrow();
    await expect(svc.resolve(draftToken, new Date("2026-10-23T00:00:00Z"))).rejects.toThrow();
  });

  it("adopts once, moving uploads and declarations, and refuses a second adoption", async () => {
    const { draftToken } = await svc.create(undefined, now);
    expect(await svc.adopt(draftToken, "c1", now)).toBe(true);
    expect(h.uploadsMoved).toBe(1);
    expect(h.declsMoved).toBe(1);
    expect(h.fieldsMoved).toBe(1);
    expect(await svc.adopt(draftToken, "c2", now)).toBe(false);
    expect(h.drafts[0]?.adoptedById).toBe("c1");
    await expect(svc.resolve(draftToken, now)).rejects.toThrow();
  });

  it("does not adopt unknown or expired drafts", async () => {
    const { draftToken } = await svc.create(undefined, now);
    expect(await svc.adopt("nope", "c1", now)).toBe(false);
    expect(await svc.adopt(draftToken, "c1", new Date("2026-10-23T00:00:00Z"))).toBe(false);
  });
});
