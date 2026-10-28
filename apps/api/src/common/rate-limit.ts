import { createHash } from "node:crypto";
import { type CanActivate, type ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { prisma } from "@loop/db";
import { logger } from "./logger.js";

export const RATE_LIMITS = Symbol("RATE_LIMITS");
export type RateLimits = { ip: number; account: number; device: number };

export const WINDOW_SECONDS = 60;

/** 429 carrying the delay for the Retry-After header (mapped by ProblemFilter). */
export class RateLimitedException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many requests. Try again later.", HttpStatus.TOO_MANY_REQUESTS);
  }
}

export function windowStartFor(now: Date): Date {
  return new Date(Math.floor(now.getTime() / (WINDOW_SECONDS * 1000)) * WINDOW_SECONDS * 1000);
}

/** Opaque key: identifiers (IP, account id, device id) are never stored in clear. */
export function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Postgres-backed fixed-window counter (no Redis). Returns the count after this hit. */
@Injectable()
export class RateLimitStore {
  async hit(scope: string, key: string, now: Date): Promise<number> {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimitBucket" ("scope", "keyHash", "windowStart", "count")
      VALUES (${scope}, ${hashKey(key)}, ${windowStartFor(now)}, 1)
      ON CONFLICT ("scope", "keyHash", "windowStart")
      DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
      RETURNING "count"`;
    return rows[0]?.count ?? 1;
  }

  async purge(olderThan: Date): Promise<number> {
    const res = await prisma.rateLimitBucket.deleteMany({ where: { windowStart: { lt: olderThan } } });
    return res.count;
  }
}

type Req = {
  ip?: string;
  path?: string;
  contractorId?: string;
  headers: Record<string, string | string[] | undefined>;
};

/** Global limiter per IP, per authenticated account and per device. Must be registered after AuthGuard. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(RateLimitStore) private readonly store: RateLimitStore,
    @Inject(RATE_LIMITS) private readonly limits: RateLimits,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Req>();
    if (req.path?.endsWith("/health")) return true;
    const now = new Date();
    const device = req.headers["x-device-id"];
    const checks: Array<[string, string | undefined, number]> = [
      ["ip", req.ip, this.limits.ip],
      ["account", req.contractorId, this.limits.account],
      ["device", typeof device === "string" && device.length <= 128 ? device : undefined, this.limits.device],
    ];
    for (const [scope, key, limit] of checks) {
      if (!key) continue;
      let count: number;
      try {
        count = await this.store.hit(scope, key, now);
      } catch {
        // Fail open: a limiter outage must not take the API down; OTP-specific limits still apply.
        logger.error("rate-limit store unavailable");
        return true;
      }
      if (count > limit) {
        const elapsed = Math.floor((now.getTime() - windowStartFor(now).getTime()) / 1000);
        throw new RateLimitedException(Math.max(1, WINDOW_SECONDS - elapsed));
      }
    }
    return true;
  }
}
