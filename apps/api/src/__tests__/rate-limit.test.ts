import { describe, expect, it } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { RateLimitGuard, RateLimitStore, RateLimitedException, hashKey, windowStartFor } from "../common/rate-limit.js";

class MemoryStore extends RateLimitStore {
  counts = new Map<string, number>();
  override async hit(scope: string, key: string): Promise<number> {
    const k = `${scope}:${key}`;
    const n = (this.counts.get(k) ?? 0) + 1;
    this.counts.set(k, n);
    return n;
  }
}

const ctx = (req: object) => ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

describe("RateLimitGuard", () => {
  it("allows up to the IP budget then throws 429 with a retry delay", async () => {
    const guard = new RateLimitGuard(new MemoryStore(), { ip: 2, account: 3, device: 2 });
    const req = { ip: "203.0.113.9", path: "/api/v1/me", headers: {} };
    await guard.canActivate(ctx(req));
    await guard.canActivate(ctx(req));
    const err = await guard.canActivate(ctx(req)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitedException);
    expect((err as RateLimitedException).retryAfterSeconds).toBeGreaterThan(0);
  });

  it("limits per account and per device independently of IP", async () => {
    const acct = new RateLimitGuard(new MemoryStore(), { ip: 100, account: 1, device: 100 });
    await acct.canActivate(ctx({ ip: "1.1.1.1", contractorId: "c1", headers: {} }));
    await expect(acct.canActivate(ctx({ ip: "2.2.2.2", contractorId: "c1", headers: {} }))).rejects.toBeInstanceOf(
      RateLimitedException,
    );
    const dev = new RateLimitGuard(new MemoryStore(), { ip: 100, account: 100, device: 1 });
    const headers = { "x-device-id": "d1" };
    await dev.canActivate(ctx({ ip: "1.1.1.1", headers }));
    await expect(dev.canActivate(ctx({ ip: "2.2.2.2", headers }))).rejects.toBeInstanceOf(RateLimitedException);
  });

  it("skips health checks and fails open when the store errors", async () => {
    const broken = new (class extends RateLimitStore {
      override async hit(): Promise<number> {
        throw new Error("db down");
      }
    })();
    const guard = new RateLimitGuard(broken, { ip: 1, account: 1, device: 1 });
    await expect(guard.canActivate(ctx({ ip: "1.1.1.1", path: "/api/v1/me", headers: {} }))).resolves.toBe(true);
    const zero = new RateLimitGuard(new MemoryStore(), { ip: 0, account: 0, device: 0 });
    await expect(zero.canActivate(ctx({ ip: "x", path: "/api/v1/health", headers: {} }))).resolves.toBe(true);
  });
});

describe("helpers", () => {
  it("hashes keys opaquely and aligns windows to the minute", () => {
    expect(hashKey("203.0.113.9")).not.toContain("203");
    expect(windowStartFor(new Date("2026-10-19T10:00:45Z")).toISOString()).toBe("2026-10-19T10:00:00.000Z");
  });
});
