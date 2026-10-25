import { describe, expect, it, vi } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { AuthGuard } from "../../../common/auth.guard.js";
import { SessionService } from "../session.service.js";

vi.mock("@loop/db", () => ({ prisma: {} }));

const settings = { sessionSecret: "s".repeat(32), jwtSecret: "j".repeat(32), production: false };
const sessions = new SessionService(settings);
const live = new Map<string, string>([["s1", "c1"]]);
vi.spyOn(sessions, "resolve").mockImplementation(async (id: string) => {
  const contractorId = live.get(id);
  return contractorId ? { contractorId, sessionId: id } : null;
});
const guard = new AuthGuard(sessions);

interface Req {
  method: string;
  url: string;
  headers: Record<string, string>;
  contractorId?: string;
  sessionId?: string;
}
const ctx = (req: Req) => ({ getType: () => "http", switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;
const run = (over: Partial<Req>) => {
  const req: Req = { method: "GET", url: "/api/v1/me", headers: {}, ...over };
  return { req, result: guard.canActivate(ctx(req)) };
};
const cookie = (sid = "s1") => `loop_session=${encodeURIComponent(sessions.cookieValue(sid))}`;

describe("bearer", () => {
  it("accepts a valid token and sets the caller", async () => {
    const { req, result } = run({ headers: { authorization: `Bearer ${sessions.signAccessToken("c1", "s1")}` } });
    await expect(result).resolves.toBe(true);
    expect(req).toMatchObject({ contractorId: "c1", sessionId: "s1" });
  });
  it("rejects an invalid token", async () => {
    await expect(run({ headers: { authorization: "Bearer junk" } }).result).rejects.toThrow("Invalid or expired token");
  });
  it("rejects a token whose session is gone or belongs to someone else", async () => {
    await expect(run({ headers: { authorization: `Bearer ${sessions.signAccessToken("c1", "gone")}` } }).result).rejects.toThrow();
    await expect(run({ headers: { authorization: `Bearer ${sessions.signAccessToken("c2", "s1")}` } }).result).rejects.toThrow();
  });
});

describe("staff realm", () => {
  it("ignores a contractor session cookie on admin routes (no contractor CSRF demanded)", async () => {
    const r = run({ method: "POST", url: "/api/v1/admin/auth/otp/verify", headers: { cookie: cookie() } });
    await expect(r.result).resolves.toBe(true);
    expect(r.req.contractorId).toBeUndefined();
  });
});

describe("cookie", () => {
  it("passes through with no cookie or a stale one", async () => {
    const none = run({});
    await expect(none.result).resolves.toBe(true);
    expect(none.req.contractorId).toBeUndefined();
    const stale = run({ headers: { cookie: cookie("old") } });
    await expect(stale.result).resolves.toBe(true);
    expect(stale.req.contractorId).toBeUndefined();
    await expect(run({ headers: { cookie: "loop_session=forged.sig" } }).result).resolves.toBe(true);
  });
  it("authenticates safe requests without CSRF", async () => {
    const { req, result } = run({ headers: { cookie: cookie() } });
    await expect(result).resolves.toBe(true);
    expect(req).toMatchObject({ contractorId: "c1", sessionId: "s1" });
  });
  it.each(["POST", "PUT", "PATCH", "DELETE"])("requires CSRF on %s", async (method) => {
    await expect(run({ method, headers: { cookie: cookie() } }).result).rejects.toThrow("CSRF");
    await expect(run({ method, headers: { cookie: cookie(), "x-csrf-token": "bad" } }).result).rejects.toThrow("CSRF");
    const ok = run({ method, headers: { cookie: cookie(), "x-csrf-token": sessions.csrfToken("s1") } });
    await expect(ok.result).resolves.toBe(true);
    expect(ok.req.contractorId).toBe("c1");
  });
  it.each(["/api/v1/auth/otp/request", "/api/v1/auth/otp/verify", "/api/v1/auth/token/refresh", "/api/v1/auth/return-target"])("exempts %s from CSRF", async (url) => {
    await expect(run({ method: "POST", url, headers: { cookie: cookie() } }).result).resolves.toBe(true);
  });
  it.each(["/api/v1/auth/logout", "/api/v1/auth/logout-all"])("does not exempt %s", async (url) => {
    await expect(run({ method: "POST", url, headers: { cookie: cookie() } }).result).rejects.toThrow("CSRF");
  });
});
