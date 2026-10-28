import { UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthController } from "../auth.controller.js";
import { SESSION_COOKIE, type AuthSettings } from "../session.service.js";

const settings: AuthSettings = { sessionSecret: "s", jwtSecret: "j", production: true };

function setup() {
  const otp = { request: vi.fn(), verify: vi.fn() };
  const sessions = {
    revoke: vi.fn().mockResolvedValue(undefined),
    revokeAll: vi.fn().mockResolvedValue(3),
    signReturnToken: vi.fn().mockReturnValue("signed.token"),
    cookieValue: vi.fn(),
    refresh: vi.fn(),
    list: vi.fn(),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const res = { setHeader: vi.fn(), cookie: vi.fn(), clearCookie: vi.fn() };
  // The controller only touches the members mocked above.
  const controller = new AuthController(
    otp as never,
    sessions as never,
    settings,
    audit as never,
  );
  return { controller, otp, sessions, audit, res };
}

describe("AuthController", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  describe("logout", () => {
    it("revokes the session, clears the cookie and audits SIGNED_OUT", async () => {
      const result = await ctx.controller.logout({ contractorId: "c1", sessionId: "s1" }, ctx.res);
      expect(result).toEqual({ ok: true });
      expect(ctx.sessions.revoke).toHaveBeenCalledWith("s1", "c1");
      expect(ctx.res.clearCookie).toHaveBeenCalledWith(
        SESSION_COOKIE,
        expect.objectContaining({ httpOnly: true, sameSite: "lax", secure: true }),
      );
      expect(ctx.audit.record).toHaveBeenCalledWith({
        actorId: "c1",
        entityType: "Contractor",
        entityId: "c1",
        action: "SIGNED_OUT",
        after: { sessionId: "s1" },
      });
    });

    it.each([{}, { contractorId: "c1" }, { sessionId: "s1" }])("rejects an unauthenticated request %j", async (req) => {
      await expect(ctx.controller.logout(req, ctx.res)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(ctx.sessions.revoke).not.toHaveBeenCalled();
      expect(ctx.audit.record).not.toHaveBeenCalled();
    });
  });

  describe("logoutAll", () => {
    it("revokes every session, clears the cookie, returns the count and audits SIGNED_OUT_ALL", async () => {
      const result = await ctx.controller.logoutAll({ contractorId: "c1" }, ctx.res);
      expect(result).toEqual({ ok: true, revoked: 3 });
      expect(ctx.sessions.revokeAll).toHaveBeenCalledWith("c1");
      expect(ctx.res.clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, expect.any(Object));
      expect(ctx.audit.record).toHaveBeenCalledWith({
        actorId: "c1",
        entityType: "Contractor",
        entityId: "c1",
        action: "SIGNED_OUT_ALL",
        after: { revoked: 3 },
      });
    });

    it("rejects an unauthenticated request", async () => {
      await expect(ctx.controller.logoutAll({}, ctx.res)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(ctx.sessions.revokeAll).not.toHaveBeenCalled();
      expect(ctx.audit.record).not.toHaveBeenCalled();
    });
  });

  describe("verify", () => {
    const body = { clientType: "WEB" } as never;

    it("sets the httpOnly session cookie and a readable csrf cookie for web", async () => {
      ctx.otp.verify.mockResolvedValue({ contractorId: "c1", sessionId: "s1", csrfToken: "tok" });
      await ctx.controller.verify(body, ctx.res as never);
      expect(ctx.res.cookie).toHaveBeenCalledWith(SESSION_COOKIE, undefined, expect.objectContaining({ httpOnly: true }));
      expect(ctx.res.cookie).toHaveBeenCalledWith("csrf", "tok", expect.objectContaining({ httpOnly: false, sameSite: "lax", path: "/" }));
    });

    it("sets no cookies for the mobile app", async () => {
      ctx.otp.verify.mockResolvedValue({ contractorId: "c1", sessionId: "s1", accessToken: "a" });
      await ctx.controller.verify({ clientType: "MOBILE_APP" } as never, ctx.res as never);
      expect(ctx.res.cookie).not.toHaveBeenCalled();
    });
  });

  describe("returnTarget", () => {
    it("signs the allow-listed target id and returns only the token", () => {
      const result = ctx.controller.returnTarget({ target: "MY_LOOP" });
      expect(ctx.sessions.signReturnToken).toHaveBeenCalledWith("MY_LOOP");
      expect(result).toEqual({ token: "signed.token" });
    });

    it("does not set a session cookie", () => {
      ctx.controller.returnTarget({ target: "JOIN_CV" });
      expect(ctx.res.cookie).not.toHaveBeenCalled();
    });
  });
});
