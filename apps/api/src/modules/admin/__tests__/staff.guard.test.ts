import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

vi.mock("@loop/db", () => ({ prisma: {}, Prisma: { PrismaClientKnownRequestError: class extends Error {} } }));
const env = vi.hoisted(() => ({ allow: [] as string[] }));
vi.mock("../../../config/index.js", () => ({ loadEnv: () => ({ ADMIN_IP_ALLOWLIST: env.allow }) }));

const { StaffGuard } = await import("../staff.guard.js");
const { StaffSessionService } = await import("../staff-session.service.js");
const access = await import("../staff-access.js");
const { RequirePermission, StaffAuthenticated, StaffController, StaffPendingMfa, StaffPublic } = access;

@StaffController("things")
class Things {
  @RequirePermission("contractors.read") read() {}
  @RequirePermission("rewards.approve") approve() {}
  @StaffAuthenticated() any() {}
  @StaffPendingMfa() second() {}
  @StaffPublic() open() {}
  undeclared() {}
}
class NotStaff {
  undeclared() {}
}

const sessions = new StaffSessionService({ sessionSecret: "s".repeat(32), jwtSecret: "j".repeat(32), production: false });
const live = new Map<string, { mfaVerified: boolean; role: "READ_ONLY" | "OPERATOR" | "ADMIN" }>();
vi.spyOn(sessions, "resolve").mockImplementation(async (id: string) => {
  const s = live.get(id);
  return s ? { sessionId: id, mfaVerified: s.mfaVerified, staff: { id: `staff-${id}`, email: "s@loop.test", name: null, role: s.role } } : null;
});

interface Req {
  method: string;
  url: string;
  ip?: string;
  params: Record<string, string>;
  query: Record<string, unknown>;
  headers: Record<string, string>;
  staff?: { id: string };
  staffPendingId?: string;
}
const ctx = (cls: new () => object, handler: string, req: Req) =>
  ({
    getType: () => "http",
    getClass: () => cls,
    getHandler: () => (cls.prototype as Record<string, () => void>)[handler],
    switchToHttp: () => ({ getRequest: () => req }),
  }) as unknown as ExecutionContext;
const make = (over: Partial<Req> = {}): Req => ({ method: "GET", url: "/api/v1/admin/things", params: {}, query: {}, headers: {}, ...over });
const guard = () => new StaffGuard(new Reflector(), sessions);
const cookie = (id: string) => `loop_staff=${encodeURIComponent(sessions.cookieValue(id))}`;
const run = (handler: string, req: Req, cls: new () => object = Things) => guard().canActivate(ctx(cls, handler, req));

describe("StaffGuard", () => {
  it("ignores controllers outside the staff realm", async () => {
    await expect(run("undeclared", make(), NotStaff)).resolves.toBe(true);
  });

  it("denies a staff handler that declares no access (deny by default)", async () => {
    live.set("s1", { mfaVerified: true, role: "ADMIN" });
    await expect(run("undeclared", make({ headers: { cookie: cookie("s1") } }))).rejects.toThrow("no declared permission");
  });

  it("lets public routes through without a session", async () => {
    await expect(run("open", make())).resolves.toBe(true);
  });

  it("requires a valid, signed session cookie", async () => {
    await expect(run("read", make())).rejects.toThrow("Sign in required");
    live.set("s1", { mfaVerified: true, role: "ADMIN" });
    await expect(run("read", make({ headers: { cookie: "loop_staff=s1.forged" } }))).rejects.toThrow("Sign in required");
    await expect(run("read", make({ headers: { cookie: cookie("gone") } }))).rejects.toThrow("Sign in required");
  });

  it("does not accept a contractor session cookie", async () => {
    await expect(run("read", make({ headers: { cookie: `loop_session=${encodeURIComponent(sessions.cookieValue("s1"))}` } }))).rejects.toThrow("Sign in required");
  });

  it("needs the second factor for anything but the MFA endpoints", async () => {
    live.set("p1", { mfaVerified: false, role: "ADMIN" });
    await expect(run("read", make({ headers: { cookie: cookie("p1") } }))).rejects.toThrow("Second factor required");
    await expect(run("any", make({ headers: { cookie: cookie("p1") } }))).rejects.toThrow("Second factor required");
    const req = make({ headers: { cookie: cookie("p1") } });
    await expect(run("second", req)).resolves.toBe(true);
    expect(req.staffPendingId).toBe("staff-p1");
  });

  it("refuses the MFA endpoints once the second factor is done", async () => {
    live.set("s1", { mfaVerified: true, role: "ADMIN" });
    await expect(run("second", make({ headers: { cookie: cookie("s1") } }))).rejects.toThrow("already completed");
  });

  it("checks the role's permission on every request", async () => {
    live.set("ro", { mfaVerified: true, role: "READ_ONLY" });
    live.set("op", { mfaVerified: true, role: "OPERATOR" });
    live.set("ad", { mfaVerified: true, role: "ADMIN" });
    const get = (id: string, handler: string) => run(handler, make({ headers: { cookie: cookie(id) } }));
    await expect(get("ro", "read")).resolves.toBe(true);
    await expect(get("ro", "approve")).rejects.toThrow("role does not allow");
    await expect(get("op", "approve")).rejects.toThrow("role does not allow");
    await expect(get("ad", "approve")).resolves.toBe(true);
    await expect(get("ro", "any")).resolves.toBe(true);
  });

  it("requires the CSRF token on writes", async () => {
    live.set("s1", { mfaVerified: true, role: "ADMIN" });
    const post = (token?: string) =>
      run("approve", make({ method: "POST", headers: { cookie: cookie("s1"), ...(token ? { "x-csrf-token": token } : {}) } }));
    await expect(post()).rejects.toThrow("CSRF");
    await expect(post("wrong")).rejects.toThrow("CSRF");
    await expect(post(sessions.csrfToken("s1"))).resolves.toBe(true);
  });

  it("applies the IP allow-list before anything else", async () => {
    env.allow = ["10.0.0.0/8"];
    const g = guard();
    await expect(g.canActivate(ctx(Things, "open", make({ ip: "8.8.8.8" })))).rejects.toThrow("network");
    await expect(g.canActivate(ctx(Things, "open", make({ ip: "10.1.2.3" })))).resolves.toBe(true);
    await expect(g.canActivate(ctx(Things, "open", make()))).rejects.toThrow("network");
    env.allow = [];
  });
});

describe("every admin controller handler declares its access", () => {
  it("has an explicit permission or marker on all handlers, and an audit marker on permission-gated reads", async () => {
    const mods = [
      await import("../staff-auth.controller.js"),
      await import("../admin-contractors.controller.js"),
      await import("../admin-ops.controller.js"),
    ];
    const reflector = new Reflector();
    const missing: string[] = [];
    const unauditedReads: string[] = [];
    let handlers = 0;
    for (const mod of mods) {
      for (const exported of Object.values(mod)) {
        if (typeof exported !== "function") continue;
        const cls = exported as Function & { prototype: Record<string, unknown> }; // eslint-disable-line @typescript-eslint/no-unsafe-function-type
        if (!reflector.get(access.STAFF_REALM, cls)) continue;
        for (const name of Object.getOwnPropertyNames(cls.prototype)) {
          const fn = cls.prototype[name];
          // Only route handlers carry the HTTP path metadata; private helpers are skipped.
          if (name === "constructor" || typeof fn !== "function" || Reflect.getMetadata("path", fn) === undefined) continue;
          handlers++;
          const a = reflector.get<{ kind: string } | undefined>(access.STAFF_ACCESS, fn as () => void);
          if (!a) missing.push(`${cls.name}.${name}`);
          const isGet = Reflect.getMetadata("method", fn) === 0; // RequestMethod.GET
          const audited = reflector.get(access.STAFF_AUDIT, fn as () => void);
          // Reads of personal data are audited. The overview (aggregate counts), template and config reads hold none.
          const exempt = ["AdminOverviewController", "AdminCommsController", "StaffAuthController"].includes(cls.name);
          if (isGet && a?.kind === "permission" && !audited && !exempt) unauditedReads.push(`${cls.name}.${name}`);
        }
      }
    }
    expect(handlers).toBeGreaterThan(20);
    expect(missing).toEqual([]);
    expect(unauditedReads).toEqual([]);
  });
});
