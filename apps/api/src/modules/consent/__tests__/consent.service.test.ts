import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateConsentsRequestSchema } from "@loop/contracts";

interface Rec {
  id: string;
  contractorId: string;
  purpose: string;
  wordingVersion: string;
  source: string;
  ipHash: string | null;
  grantedAt: Date;
  withdrawnAt: Date | null;
}

const h = vi.hoisted(() => ({
  rows: [] as Rec[],
  live: false,
  audits: [] as { action: string; after?: unknown }[],
  contractorUpdates: [] as Record<string, unknown>[],
  n: 0,
}));

vi.mock("@loop/db", () => {
  const consentRecord = {
    findMany: vi.fn(async ({ where }: { where: { contractorId: string } }) => h.rows.filter((r) => r.contractorId === where.contractorId)),
    create: vi.fn(async ({ data }: { data: Omit<Rec, "id" | "withdrawnAt"> }) => {
      const r = { ...data, id: `r${++h.n}`, withdrawnAt: null };
      h.rows.push(r);
      return r;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Rec> }) => {
      const r = h.rows.find((x) => x.id === where.id);
      if (r) Object.assign(r, data);
      return r;
    }),
  };
  const contractor = {
    findUnique: vi.fn(async ({ select }: { select: Record<string, boolean> }) => ("live" in select ? { live: h.live } : { id: "c1" })),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      h.contractorUpdates.push(data);
      if (data.live === false) h.live = false;
    }),
  };
  const auditEvent = { create: vi.fn(async ({ data }: { data: { action: string; after?: unknown } }) => void h.audits.push(data)) };
  const tx = { consentRecord, contractor, auditEvent };
  return {
    Prisma: { PrismaClientKnownRequestError: class extends Error {} },
    prisma: { ...tx, $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) },
  };
});

import { CONSENT_WORDING } from "@loop/domain";
import { ConsentService } from "../consent.service.js";

const V = CONSENT_WORDING.PROFILE_VISIBILITY.version;
const audit = { record: vi.fn() };
const svc = new ConsentService(audit as never);
const now = new Date("2026-10-26T10:00:00Z");
const req = (changes: object[]) => UpdateConsentsRequestSchema.parse({ changes });
const grant = (purpose: string) => ({ purpose, granted: true, wordingVersion: V });

beforeEach(() => {
  h.rows = [];
  h.live = false;
  h.audits = [];
  h.contractorUpdates = [];
  vi.clearAllMocks();
});

describe("request validation", () => {
  it("requires the wording version when granting", () => {
    expect(UpdateConsentsRequestSchema.safeParse({ changes: [{ purpose: "LOOP_MARKETING", granted: true }] }).success).toBe(false);
  });
  it("allows withdrawing without a version", () => {
    expect(UpdateConsentsRequestSchema.safeParse({ changes: [{ purpose: "LOOP_MARKETING", granted: false }] }).success).toBe(true);
  });
  it("rejects duplicate purposes and unknown purposes", () => {
    expect(UpdateConsentsRequestSchema.safeParse({ changes: [grant("LOOP_MARKETING"), grant("LOOP_MARKETING")] }).success).toBe(false);
    expect(UpdateConsentsRequestSchema.safeParse({ changes: [grant("SMS")] }).success).toBe(false);
  });
});

describe("ConsentService", () => {
  it("starts with nothing granted (no pre-ticked boxes)", async () => {
    const { items } = await svc.list("c1");
    expect(items).toHaveLength(4);
    expect(items.every((i) => !i.granted && i.grantedAt === null)).toBe(true);
    expect(items.filter((i) => i.required).map((i) => i.purpose)).toEqual(["PROFILE_VISIBILITY", "OPERATIONAL_EMAIL"]);
  });

  it("records a grant with version, source and hashed IP, and audits it", async () => {
    const out = await svc.update("c1", req([grant("PROFILE_VISIBILITY")]), "203.0.113.9", now);
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0]).toMatchObject({ purpose: "PROFILE_VISIBILITY", wordingVersion: V, source: "WEB", grantedAt: now });
    expect(h.rows[0]?.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(h.rows)).not.toContain("203.0.113.9");
    expect(out.items.find((i) => i.purpose === "PROFILE_VISIBILITY")?.granted).toBe(true);
    expect(h.audits.map((a) => a.action)).toEqual(["consent.granted"]);
  });

  it("refuses a stale wording version", async () => {
    await expect(
      svc.update("c1", req([{ purpose: "PROFILE_VISIBILITY", granted: true, wordingVersion: "v0" }]), undefined, now),
    ).rejects.toThrow(/wording has changed/);
    expect(h.rows).toHaveLength(0);
  });

  it("repeating a grant adds no row and no audit event", async () => {
    await svc.update("c1", req([grant("LOOP_MARKETING")]), undefined, now);
    h.audits = [];
    await svc.update("c1", req([grant("LOOP_MARKETING")]), undefined, now);
    expect(h.rows).toHaveLength(1);
    expect(h.audits).toHaveLength(0);
  });

  it("withdrawal stamps the row, keeps history and mirrors the legacy marketing flag", async () => {
    await svc.update("c1", req([grant("LOOP_MARKETING")]), undefined, now);
    expect(h.contractorUpdates.at(-1)).toMatchObject({ marketingConsent: true });
    const later = new Date("2026-10-27T10:00:00Z");
    await svc.update("c1", req([{ purpose: "LOOP_MARKETING", granted: false }]), undefined, later);
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0]?.withdrawnAt).toEqual(later);
    expect(h.contractorUpdates.at(-1)).toMatchObject({ marketingConsent: false });
    expect(h.audits.map((a) => a.action)).toEqual(["consent.granted", "consent.withdrawn"]);
  });

  it("a re-grant after withdrawal is a new row", async () => {
    await svc.update("c1", req([grant("PARTNER_MARKETING")]), undefined, now);
    await svc.update("c1", req([{ purpose: "PARTNER_MARKETING", granted: false }]), undefined, now);
    await svc.update("c1", req([grant("PARTNER_MARKETING")]), undefined, new Date("2026-10-28T10:00:00Z"));
    expect(h.rows).toHaveLength(2);
    expect((await svc.active("c1")).has("PARTNER_MARKETING")).toBe(true);
  });

  it("withdrawing a marketing consent never takes a LIVE profile offline", async () => {
    await svc.update("c1", req([grant("PROFILE_VISIBILITY"), grant("OPERATIONAL_EMAIL"), grant("LOOP_MARKETING")]), undefined, now);
    h.live = true;
    await svc.update("c1", req([{ purpose: "LOOP_MARKETING", granted: false }]), undefined, now);
    expect(h.live).toBe(true);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("withdrawing a required consent takes a LIVE profile offline and audits it", async () => {
    await svc.update("c1", req([grant("PROFILE_VISIBILITY"), grant("OPERATIONAL_EMAIL")]), undefined, now);
    h.live = true;
    await svc.update("c1", req([{ purpose: "OPERATIONAL_EMAIL", granted: false }]), undefined, now);
    expect(h.live).toBe(false);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "golive.revoked", after: expect.objectContaining({ live: false }) }));
  });
});
