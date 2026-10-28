import { beforeEach, describe, expect, it, vi } from "vitest";
import { factsFingerprint } from "@loop/domain";

interface Link {
  id: string;
  contractorId: string;
  action: string;
  tokenHash: string;
  fingerprint: string;
  expiresAt: Date;
  usedAt: Date | null;
}

const h = vi.hoisted(() => ({
  links: [] as Link[],
  contractor: null as Record<string, unknown> | null,
}));

vi.mock("@loop/db", () => ({
  prisma: {
    confirmLink: {
      create: vi.fn(async ({ data }: { data: Omit<Link, "id" | "usedAt"> }) => void h.links.push({ ...data, id: `l${h.links.length + 1}`, usedAt: null })),
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => h.links.find((l) => l.tokenHash === where.tokenHash) ?? null),
      updateMany: vi.fn(async ({ where, data }: { where: { id?: string; tokenHash?: string; usedAt?: null }; data: { usedAt: Date | null } }) => {
        const rows = h.links.filter((l) => (where.id ? l.id === where.id : l.tokenHash === where.tokenHash) && (where.usedAt === undefined || l.usedAt === null));
        rows.forEach((l) => (l.usedAt = data.usedAt));
        return { count: rows.length };
      }),
    },
    contractor: { findUnique: vi.fn(async () => h.contractor) },
  },
}));

import { hashKey } from "../../../common/rate-limit.js";
import { ConfirmLinkService } from "../confirm-link.service.js";

const svc = new ConfirmLinkService({ baseUrl: "https://loop.test/", confirmLinkTtlHours: 72 });
const NOW = new Date("2026-10-24T10:00:00Z");
const facts = { employment: "BETWEEN_CONTRACTS", availableFrom: null, contractEndDate: null };
const tokenOf = (url: string) => new URL(url).searchParams.get("t") ?? "";

beforeEach(() => {
  h.links = [];
  h.contractor = { id: "c1", erasedAt: null, employmentSituation: "BETWEEN_CONTRACTS", availableFrom: null, contractEndDate: null };
});

describe("ConfirmLinkService", () => {
  it("issues an unguessable link and stores only its hash", async () => {
    const url = await svc.issue("c1", "r1", facts, NOW);
    const token = tokenOf(url);
    expect(url.startsWith("https://loop.test/confirm?t=")).toBe(true);
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(h.links[0]?.tokenHash).toBe(hashKey(token));
    expect(JSON.stringify(h.links)).not.toContain(token);
    expect(h.links[0]?.expiresAt.toISOString()).toBe("2026-10-27T10:00:00.000Z");
    expect(h.links[0]?.fingerprint).toBe(factsFingerprint(facts));
  });

  it("claims a valid link exactly once", async () => {
    const token = tokenOf(await svc.issue("c1", null, facts, NOW));
    expect(await svc.claim(token, NOW)).toEqual({ ok: true, contractorId: "c1" });
    expect(await svc.claim(token, NOW)).toEqual({ ok: false, reason: "USED" });
  });

  it("refuses an unknown token without saying anything about contractors", async () => {
    expect(await svc.claim("x".repeat(43), NOW)).toEqual({ ok: false, reason: "INVALID" });
  });

  it("refuses an expired link", async () => {
    const token = tokenOf(await svc.issue("c1", null, facts, NOW));
    expect(await svc.claim(token, new Date("2026-10-27T10:00:01Z"))).toEqual({ ok: false, reason: "EXPIRED" });
  });

  it("refuses when the situation has changed since the email went out", async () => {
    const token = tokenOf(await svc.issue("c1", null, facts, NOW));
    h.contractor = { ...h.contractor, employmentSituation: "PERMANENT" };
    expect(await svc.claim(token, NOW)).toEqual({ ok: false, reason: "FACTS_CHANGED" });
    expect(h.links[0]?.usedAt).toBeNull();
  });

  it("never confirms past a contract end date", async () => {
    const ended = { employment: "CONTRACTING", availableFrom: null, contractEndDate: new Date("2026-10-24T00:00:00Z") };
    h.contractor = { id: "c1", erasedAt: null, employmentSituation: "CONTRACTING", availableFrom: null, contractEndDate: ended.contractEndDate };
    const token = tokenOf(await svc.issue("c1", null, ended, new Date("2026-10-23T10:00:00Z")));
    expect(await svc.claim(token, new Date("2026-10-25T09:00:00Z"))).toEqual({ ok: false, reason: "END_DATE_PASSED" });
  });

  it("treats an erased contractor's link as invalid", async () => {
    const token = tokenOf(await svc.issue("c1", null, facts, NOW));
    h.contractor = { ...h.contractor, erasedAt: NOW };
    expect(await svc.claim(token, NOW)).toEqual({ ok: false, reason: "INVALID" });
  });

  it("can release a claimed link so a failed confirmation can be retried", async () => {
    const token = tokenOf(await svc.issue("c1", null, facts, NOW));
    await svc.claim(token, NOW);
    await svc.release(token);
    expect((await svc.claim(token, NOW)).ok).toBe(true);
  });
});
