import { beforeEach, describe, expect, it, vi } from "vitest";

interface Row {
  id: string;
  emailHash: string;
  purpose: string;
  codeHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
  requestIp?: string;
  createdAt: Date;
}

const h = vi.hoisted(() => ({
  clock: { now: new Date("2026-10-17T12:00:00Z") },
  rows: [] as Row[],
  contractors: [] as { id: string; email: string; phone: string; firstAppSignInAt: Date | null }[],
  sessionCreate: vi.fn(),
}));

vi.mock("@loop/db", () => {
  class PrismaClientKnownRequestError extends Error {
    constructor(
      message: string,
      readonly opts: { code: string },
    ) {
      super(message);
    }
    get code(): string {
      return this.opts.code;
    }
  }
  type Where = Partial<Row> & { createdAt?: { gte: Date } };
  const match = (r: Row, w: Where): boolean =>
    (w.id === undefined || r.id === w.id) &&
    (w.emailHash === undefined || r.emailHash === w.emailHash) &&
    (w.purpose === undefined || r.purpose === w.purpose) &&
    (w.requestIp === undefined || r.requestIp === w.requestIp) &&
    (w.consumedAt === undefined || r.consumedAt === w.consumedAt) &&
    (w.createdAt === undefined || r.createdAt >= w.createdAt.gte);
  return {
    Prisma: { PrismaClientKnownRequestError },
    prisma: {
      reminderConfig: { findUnique: vi.fn().mockResolvedValue(null) },
      session: { create: h.sessionCreate },
      emailOtp: {
        findFirst: vi.fn(async ({ where }: { where: Where }) =>
          [...h.rows].filter((r) => match(r, where)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
        ),
        count: vi.fn(async ({ where }: { where: Where }) => h.rows.filter((r) => match(r, where)).length),
        create: vi.fn(async ({ data }: { data: Omit<Row, "id" | "consumedAt" | "attempts" | "createdAt"> }) => {
          h.rows.push({ ...data, id: `otp${h.rows.length + 1}`, consumedAt: null, attempts: 0, createdAt: h.clock.now });
          return {};
        }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: { attempts: { increment: number } } }) => {
          const r = h.rows.find((x) => x.id === where.id);
          if (!r) throw new Error("missing");
          r.attempts += data.attempts.increment;
          return { attempts: r.attempts };
        }),
        updateMany: vi.fn(async ({ where, data }: { where: Where; data: { consumedAt: Date } }) => {
          const hit = h.rows.filter((r) => match(r, where));
          hit.forEach((r) => (r.consumedAt = data.consumedAt));
          return { count: hit.length };
        }),
      },
      contractor: {
        findUnique: vi.fn(async ({ where }: { where: { email: string } }) => h.contractors.find((c) => c.email === where.email) ?? null),
        create: vi.fn(async ({ data }: { data: { email: string; phone: string } }) => {
          if (h.contractors.some((c) => c.phone === data.phone)) {
            const { Prisma } = await import("@loop/db");
            throw new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" } as never);
          }
          const c = { id: `c${h.contractors.length + 1}`, email: data.email, phone: data.phone, firstAppSignInAt: null };
          h.contractors.push(c);
          return c;
        }),
        updateMany: vi.fn(async ({ where, data }: { where: { id: string }; data: { firstAppSignInAt: Date } }) => {
          const c = h.contractors.find((x) => x.id === where.id && x.firstAppSignInAt === null);
          if (c) c.firstAppSignInAt = data.firstAppSignInAt;
          return { count: c ? 1 : 0 };
        }),
      },
    },
  };
});

import { OtpRateLimitedException, OtpService } from "../otp.service.js";
import { SessionService } from "../session.service.js";

const settings = { sessionSecret: "s".repeat(32), jwtSecret: "j".repeat(32), production: false };
const reg = { firstName: "Sam", lastName: "Lee", mobile: "07700 900001", termsAccepted: true, marketingOptIn: false } as never;

describe("OtpService", () => {
  const sender = { send: vi.fn() };
  const audit = { record: vi.fn() };
  const drafts = { adopt: vi.fn().mockResolvedValue(false) };
  let svc: OtpService;

  const advance = (s: number) => (h.clock.now = new Date(h.clock.now.getTime() + s * 1000));
  const sentCode = (): string => {
    const body = (sender.send.mock.calls.at(-1)?.[1] as { text: string }).text;
    const m = /\b(\d{6})\b/.exec(body);
    if (!m) throw new Error("no code in email");
    return m[1] as string;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    h.rows.length = 0;
    h.contractors.length = 0;
    h.clock.now = new Date("2026-10-17T12:00:00Z");
    h.sessionCreate.mockImplementation(async ({ data }: { data: { contractorId: string } }) => ({ id: "sess1", ...data }));
    svc = new OtpService(settings, sender as never, new SessionService(settings), audit as never, drafts as never);
  });

  const request = (email: string, purpose: "SIGN_IN" | "REGISTER" = "SIGN_IN", ip = "1.1.1.1") =>
    svc.request({ email, purpose, clientType: "WEB" }, ip, h.clock.now);

  describe("request", () => {
    it("answers identically for known and unknown emails", async () => {
      h.contractors.push({ id: "c0", email: "known@example.com", phone: "+447700900009", firstAppSignInAt: null });
      const a = await request("known@example.com");
      const b = await request("unknown@example.com");
      expect(a).toEqual(b);
      expect(a.accepted).toBe(true);
    });

    it("sends no email for an unknown sign-in but still records a row", async () => {
      await request("unknown@example.com");
      expect(sender.send).not.toHaveBeenCalled();
      expect(h.rows).toHaveLength(1);
    });

    it("sends a registration code for an unknown email and a sign-in code for a known one", async () => {
      await request("new@example.com", "REGISTER");
      expect(sender.send).toHaveBeenCalledTimes(1);
      h.contractors.push({ id: "c0", email: "known@example.com", phone: "+447700900009", firstAppSignInAt: null });
      await request("known@example.com", "REGISTER");
      expect(sender.send).toHaveBeenCalledTimes(2);
    });

    it("does not store the code or the email in plain text", async () => {
      h.contractors.push({ id: "c0", email: "known@example.com", phone: "+447700900009", firstAppSignInAt: null });
      await request("known@example.com");
      const code = sentCode();
      const stored = JSON.stringify(h.rows);
      expect(stored).not.toContain(code);
      expect(stored).not.toContain("known@example.com");
    });

    it("normalises the email before hashing", async () => {
      await request("  Sam@Example.com ");
      advance(61);
      await request("sam@example.com");
      expect(new Set(h.rows.map((r) => r.emailHash)).size).toBe(1);
    });

    it("enforces the resend cooldown with retryAfterSeconds", async () => {
      await request("a@example.com");
      advance(10);
      const err = await request("a@example.com").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(OtpRateLimitedException);
      expect((err as OtpRateLimitedException).retryAfterSeconds).toBe(50);
      expect((err as OtpRateLimitedException).getStatus()).toBe(429);
    });

    it("limits requests per email per hour, even for unknown addresses", async () => {
      for (let i = 0; i < 5; i++) {
        await request("a@example.com");
        advance(61);
      }
      await expect(request("a@example.com")).rejects.toBeInstanceOf(OtpRateLimitedException);
    });

    it("limits requests per IP per hour across emails", async () => {
      for (let i = 0; i < 20; i++) await request(`user${i}@example.com`, "SIGN_IN", "9.9.9.9");
      await expect(request("another@example.com", "SIGN_IN", "9.9.9.9")).rejects.toBeInstanceOf(OtpRateLimitedException);
      await expect(request("another@example.com", "SIGN_IN", "8.8.8.8")).resolves.toMatchObject({ accepted: true });
    });

    it("frees the limit once the hour has passed", async () => {
      for (let i = 0; i < 5; i++) {
        await request("a@example.com");
        advance(61);
      }
      advance(3600);
      await expect(request("a@example.com")).resolves.toMatchObject({ accepted: true });
    });

    it("does not change the response when delivery fails", async () => {
      h.contractors.push({ id: "c0", email: "known@example.com", phone: "+447700900009", firstAppSignInAt: null });
      sender.send.mockRejectedValueOnce(new Error("smtp down"));
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      await expect(request("known@example.com")).resolves.toMatchObject({ accepted: true });
    });
  });

  describe("verify", () => {
    const verify = (email: string, code: string, extra: Record<string, unknown> = {}) =>
      svc.verify({ email, code, purpose: "SIGN_IN", clientType: "WEB", ...extra } as never, h.clock.now);

    const known = () => h.contractors.push({ id: "c0", email: "known@example.com", phone: "+447700900009", firstAppSignInAt: null });

    it("signs a known contractor in with the emailed code", async () => {
      known();
      await request("known@example.com");
      const res = await verify("known@example.com", sentCode());
      expect(res.contractorId).toBe("c0");
      expect(res.csrfToken).toBeTruthy();
    });

    it("is single use", async () => {
      known();
      await request("known@example.com");
      const code = sentCode();
      await verify("known@example.com", code);
      await expect(verify("known@example.com", code)).rejects.toThrow("Invalid or expired code");
    });

    it("rejects an expired code", async () => {
      known();
      await request("known@example.com");
      const code = sentCode();
      advance(11 * 60);
      await expect(verify("known@example.com", code)).rejects.toThrow("Invalid or expired code");
    });

    it("locks out after too many wrong attempts, even for the right code", async () => {
      known();
      await request("known@example.com");
      const code = sentCode();
      const wrong = code === "000000" ? "111111" : "000000";
      for (let i = 0; i < 5; i++) await expect(verify("known@example.com", wrong)).rejects.toThrow("Invalid or expired code");
      await expect(verify("known@example.com", code)).rejects.toThrow("Invalid or expired code");
    });

    it("gives the same failure for unknown emails, wrong codes and missing codes", async () => {
      known();
      await request("known@example.com");
      const msgs = await Promise.all(
        [verify("unknown@example.com", "123456"), verify("known@example.com", "000000"), verify("never@example.com", "000000")].map((p) =>
          p.catch((e: Error) => `${e.constructor.name}:${e.message}`),
        ),
      );
      expect(new Set(msgs).size).toBe(1);
      expect(msgs[0]).toContain("UnauthorizedException");
    });

    it("audits every sign-in without the code or any token", async () => {
      known();
      await request("known@example.com");
      const code = sentCode();
      const res = await verify("known@example.com", code);
      const call = audit.record.mock.calls.find((c) => (c[0] as { action: string }).action === "SIGNED_IN")?.[0] as Record<string, unknown>;
      expect(call).toMatchObject({ entityType: "Contractor", entityId: "c0", after: { clientType: "WEB", purpose: "SIGN_IN", sessionId: res.sessionId } });
      const dump = JSON.stringify(call);
      expect(dump).not.toContain(code);
      expect(dump).not.toContain(res.csrfToken ?? "x");
    });

    it("resolves a signed return token to a fixed route", async () => {
      known();
      await request("known@example.com");
      const token = new SessionService(settings).signReturnToken("INTRODUCE", h.clock.now);
      const res = await verify("known@example.com", sentCode(), { returnToken: token });
      expect(res.returnTo).toBe("/introduce");
    });

    it.each(["garbage", "a.b", ""])("ignores a bad return token %j", async (returnToken) => {
      known();
      await request("known@example.com");
      const res = await verify("known@example.com", sentCode(), { returnToken });
      expect(res.returnTo).toBeUndefined();
      expect(res.contractorId).toBe("c0");
    });

    it("lets a provisional contractor resume from a second device only after OTP", async () => {
      known();
      await request("known@example.com");
      const first = await verify("known@example.com", sentCode());
      advance(61);
      await request("known@example.com");
      const second = await verify("known@example.com", sentCode());
      expect(second.contractorId).toBe(first.contractorId);
      expect(h.sessionCreate).toHaveBeenCalledTimes(2);
    });

    it("never creates an account on SIGN_IN", async () => {
      await request("unknown@example.com");
      await expect(verify("unknown@example.com", "123456")).rejects.toThrow();
      expect(h.contractors).toHaveLength(0);
    });

    it("a code for one purpose cannot be used for another", async () => {
      await request("new@example.com", "REGISTER");
      await expect(verify("new@example.com", sentCode())).rejects.toThrow("Invalid or expired code");
    });
  });

  describe("register", () => {
    const verifyReg = (email: string, code: string, registration: unknown = reg) =>
      svc.verify({ email, code, purpose: "REGISTER", clientType: "WEB", registration } as never, h.clock.now);

    it("creates the account on verify and writes an audit event", async () => {
      await request("new@example.com", "REGISTER");
      const res = await verifyReg("new@example.com", sentCode());
      expect(h.contractors).toHaveLength(1);
      expect(h.contractors[0]).toMatchObject({ email: "new@example.com", phone: "+447700900001" });
      expect(res.contractorId).toBe(h.contractors[0]?.id);
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "REGISTERED", entityType: "Contractor" }));
    });

    it("requires registration details", async () => {
      await request("new@example.com", "REGISTER");
      await expect(verifyReg("new@example.com", sentCode(), null)).rejects.toThrow("Registration details are required");
      expect(h.contractors).toHaveLength(0);
    });

    it("rejects a non-UK or landline number", async () => {
      await request("new@example.com", "REGISTER");
      const code = sentCode();
      await expect(verifyReg("new@example.com", code, { ...(reg as object), mobile: "020 7946 0000" })).rejects.toThrow("UK mobile");
      await expect(verifyReg("new@example.com", code, { ...(reg as object), mobile: "+1 415 555 0100" })).rejects.toThrow("UK mobile");
      expect(h.contractors).toHaveLength(0);
    });

    it("refuses a clashing mobile without revealing the owner", async () => {
      h.contractors.push({ id: "c0", email: "other@example.com", phone: "+447700900001", firstAppSignInAt: null });
      await request("new@example.com", "REGISTER");
      await expect(verifyReg("new@example.com", sentCode())).rejects.toThrow("Could not complete registration");
    });
  });

  describe("upload draft adoption", () => {
    const signIn = async (extra: Record<string, unknown>) => {
      h.contractors.push({ id: "c0", email: "known@example.com", phone: "+447700900009", firstAppSignInAt: null });
      await request("known@example.com");
      return svc.verify({ email: "known@example.com", code: sentCode(), purpose: "SIGN_IN", clientType: "WEB", ...extra } as never, h.clock.now);
    };

    it("adopts the draft and audits it when a draft token is supplied", async () => {
      drafts.adopt.mockResolvedValue(true);
      await signIn({ draftToken: "tok" });
      expect(drafts.adopt).toHaveBeenCalledWith("tok", "c0", h.clock.now);
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "UPLOAD_DRAFT_ADOPTED", entityId: "c0" }));
      expect(JSON.stringify(audit.record.mock.calls)).not.toContain("tok");
    });

    it("does not audit when nothing was adopted, and skips adoption without a token", async () => {
      drafts.adopt.mockResolvedValue(false);
      await signIn({ draftToken: "stale" });
      expect(audit.record).not.toHaveBeenCalledWith(expect.objectContaining({ action: "UPLOAD_DRAFT_ADOPTED" }));
      drafts.adopt.mockClear();
      advance(61);
      await request("known@example.com");
      await svc.verify({ email: "known@example.com", code: sentCode(), purpose: "SIGN_IN", clientType: "WEB" } as never, h.clock.now);
      expect(drafts.adopt).not.toHaveBeenCalled();
    });

    it("never blocks sign-in when adoption throws", async () => {
      drafts.adopt.mockRejectedValue(new Error("db down"));
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const res = await signIn({ draftToken: "tok" });
      expect(res.contractorId).toBe("c0");
    });
  });

  describe("first app sign-in (CH-06 columns)", () => {
    it("records firstAppSignInAt once, only for MOBILE_APP", async () => {
      h.contractors.push({ id: "c0", email: "known@example.com", phone: "+447700900009", firstAppSignInAt: null });
      const app = async () => {
        await svc.request({ email: "known@example.com", purpose: "SIGN_IN", clientType: "MOBILE_APP" }, "1.1.1.1", h.clock.now);
        const code = sentCode();
        advance(61);
        return svc.verify({ email: "known@example.com", code, purpose: "SIGN_IN", clientType: "MOBILE_APP" } as never, h.clock.now);
      };

      await svc.request({ email: "known@example.com", purpose: "SIGN_IN", clientType: "WEB" }, "1.1.1.1", h.clock.now);
      const webCode = sentCode();
      await svc.verify({ email: "known@example.com", code: webCode, purpose: "SIGN_IN", clientType: "WEB" } as never, h.clock.now);
      expect(h.contractors[0]?.firstAppSignInAt).toBeNull();

      advance(61);
      const res = await app();
      expect(res.accessToken).toBeTruthy();
      expect(res.refreshToken).toBeTruthy();
      const first = h.contractors[0]?.firstAppSignInAt;
      expect(first).toBeInstanceOf(Date);

      advance(61);
      await app();
      expect(h.contractors[0]?.firstAppSignInAt).toBe(first);
    });
  });
});
