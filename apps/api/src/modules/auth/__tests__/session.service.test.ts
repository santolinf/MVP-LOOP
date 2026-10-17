import { beforeEach, describe, expect, it, vi } from "vitest";

interface Row {
  id: string;
  contractorId: string;
  clientType: "WEB" | "MOBILE_APP";
  refreshTokenHash: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}

const h = vi.hoisted(() => ({ rows: [] as Row[], seq: 0 }));

vi.mock("@loop/db", () => ({
  prisma: {
    session: {
      create: async ({ data }: { data: Partial<Row> }) => {
        const row = { id: `s${++h.seq}`, revokedAt: null, createdAt: new Date(), lastUsedAt: null, ...data } as Row;
        h.rows.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: { id?: string; refreshTokenHash?: string } }) =>
        h.rows.find((r) => (where.id ? r.id === where.id : r.refreshTokenHash === where.refreshTokenHash)) ?? null,
      updateMany: async ({ where, data }: { where: Partial<Row>; data: Partial<Row> }) => {
        const hits = h.rows.filter(
          (r) =>
            (where.id === undefined || r.id === where.id) &&
            (where.contractorId === undefined || r.contractorId === where.contractorId) &&
            (where.refreshTokenHash === undefined || r.refreshTokenHash === where.refreshTokenHash) &&
            (where.revokedAt === undefined || r.revokedAt === where.revokedAt),
        );
        hits.forEach((r) => Object.assign(r, data));
        return { count: hits.length };
      },
      findMany: async ({ where }: { where: { contractorId: string; expiresAt: { gt: Date } } }) =>
        h.rows.filter((r) => r.contractorId === where.contractorId && !r.revokedAt && r.expiresAt > where.expiresAt.gt),
    },
  },
}));

import { ACCESS_TOKEN_SECONDS, SessionService } from "../session.service.js";

const settings = { sessionSecret: "s".repeat(32), jwtSecret: "j".repeat(32), production: false };
const svc = new SessionService(settings);
const now = new Date("2026-10-17T12:00:00Z");
const later = (s: number) => new Date(now.getTime() + s * 1000);

beforeEach(() => {
  h.rows.length = 0;
  h.seq = 0;
});

describe("create", () => {
  it("gives web sessions a CSRF token and no bearer credentials", async () => {
    const res = await svc.create({ contractorId: "c1", clientType: "WEB", now });
    expect(res.csrfToken).toBe(svc.csrfToken(res.sessionId));
    expect(res.accessToken).toBeUndefined();
    expect(res.refreshToken).toBeUndefined();
    expect(h.rows[0]?.refreshTokenHash).toBeNull();
  });

  it("gives app sessions an access token and a hashed refresh token", async () => {
    const res = await svc.create({ contractorId: "c1", clientType: "MOBILE_APP", now });
    expect(res.expiresInSeconds).toBe(ACCESS_TOKEN_SECONDS);
    expect(res.csrfToken).toBeUndefined();
    expect(res.refreshToken).toBeTruthy();
    expect(h.rows[0]?.refreshTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(h.rows[0]?.refreshTokenHash).not.toBe(res.refreshToken);
    expect(svc.verifyAccessToken(res.accessToken ?? "", now)).toEqual({ sub: "c1", sid: res.sessionId });
  });
});

describe("access tokens", () => {
  const token = svc.signAccessToken("c1", "s1", now);
  it("expires after 15 minutes", () => {
    expect(svc.verifyAccessToken(token, later(ACCESS_TOKEN_SECONDS - 1))).not.toBeNull();
    expect(svc.verifyAccessToken(token, later(ACCESS_TOKEN_SECONDS))).toBeNull();
  });
  it("rejects a tampered payload", () => {
    const [head, , sig] = token.split(".") as [string, string, string];
    const body = Buffer.from(JSON.stringify({ sub: "c2", sid: "s1", exp: 9_999_999_999 })).toString("base64url");
    expect(svc.verifyAccessToken(`${head}.${body}.${sig}`, now)).toBeNull();
  });
  it("rejects a token signed with another secret", () => {
    const other = new SessionService({ ...settings, jwtSecret: "x".repeat(32) });
    expect(svc.verifyAccessToken(other.signAccessToken("c1", "s1", now), now)).toBeNull();
  });
  it.each(["", "a.b", "a.b.c.d", "garbage"])("rejects malformed %j", (t) => {
    expect(svc.verifyAccessToken(t, now)).toBeNull();
  });
});

describe("cookie and CSRF", () => {
  it("round-trips the session id and rejects tampering", () => {
    const v = svc.cookieValue("s1");
    expect(svc.sessionIdFromCookie(v)).toBe("s1");
    expect(svc.sessionIdFromCookie(v.replace("s1", "s2"))).toBeNull();
    expect(svc.sessionIdFromCookie("nodot")).toBeNull();
  });
  it("verifies the CSRF token for its own session only", () => {
    const t = svc.csrfToken("s1");
    expect(svc.verifyCsrf("s1", t)).toBe(true);
    expect(svc.verifyCsrf("s2", t)).toBe(false);
    expect(svc.verifyCsrf("s1", undefined)).toBe(false);
    expect(svc.verifyCsrf("s1", "")).toBe(false);
  });
});

describe("refresh", () => {
  it("rotates the token and the old one stops working", async () => {
    const first = await svc.create({ contractorId: "c1", clientType: "MOBILE_APP", now });
    const second = await svc.refresh(first.refreshToken ?? "", later(60));
    expect(second.refreshToken).toBeTruthy();
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.sessionId).toBe(first.sessionId);
    await expect(svc.refresh(first.refreshToken ?? "", later(120))).rejects.toThrow("Invalid refresh token");
    await expect(svc.refresh(second.refreshToken ?? "", later(120))).resolves.toBeDefined();
  });
  it("rejects unknown, revoked and expired sessions", async () => {
    await expect(svc.refresh("nope", now)).rejects.toThrow("Invalid refresh token");
    const a = await svc.create({ contractorId: "c1", clientType: "MOBILE_APP", now });
    await svc.revoke(a.sessionId, "c1", now);
    await expect(svc.refresh(a.refreshToken ?? "", now)).rejects.toThrow("Invalid refresh token");
    const b = await svc.create({ contractorId: "c1", clientType: "MOBILE_APP", now });
    await expect(svc.refresh(b.refreshToken ?? "", later(91 * 86_400))).rejects.toThrow("Invalid refresh token");
  });
});

describe("resolve, revoke and list", () => {
  it("resolves only live sessions", async () => {
    const a = await svc.create({ contractorId: "c1", clientType: "WEB", now });
    expect(await svc.resolve(a.sessionId, now)).toEqual({ contractorId: "c1", sessionId: a.sessionId });
    expect(await svc.resolve(a.sessionId, later(31 * 86_400))).toBeNull();
    await svc.revoke(a.sessionId, "c1", now);
    expect(await svc.resolve(a.sessionId, now)).toBeNull();
    expect(await svc.resolve("missing", now)).toBeNull();
  });
  it("will not revoke another contractor's session", async () => {
    const a = await svc.create({ contractorId: "c1", clientType: "WEB", now });
    await svc.revoke(a.sessionId, "c2", now);
    expect(await svc.resolve(a.sessionId, now)).not.toBeNull();
  });
  it("lists live sessions and flags the current one", async () => {
    const a = await svc.create({ contractorId: "c1", clientType: "WEB", now });
    const b = await svc.create({ contractorId: "c1", clientType: "MOBILE_APP", now });
    await svc.create({ contractorId: "c2", clientType: "WEB", now });
    await svc.revoke(b.sessionId, "c1", now);
    const items = await svc.list("c1", a.sessionId, now);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: a.sessionId, clientType: "WEB", current: true });
  });
});
