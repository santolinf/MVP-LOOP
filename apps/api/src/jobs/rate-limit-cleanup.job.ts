import type { PgBoss } from "pg-boss";
import { RateLimitStore } from "../common/rate-limit.js";

export const RATE_LIMIT_CLEANUP = "rate-limit-cleanup";

/** Deletes counter windows older than an hour. Idempotent. */
export async function runRateLimitCleanup(store = new RateLimitStore(), now = new Date()): Promise<number> {
  return store.purge(new Date(now.getTime() - 3_600_000));
}

export async function registerRateLimitCleanup(boss: PgBoss): Promise<void> {
  await boss.createQueue(RATE_LIMIT_CLEANUP);
  await boss.work(RATE_LIMIT_CLEANUP, async () => {
    await runRateLimitCleanup();
  });
  await boss.schedule(RATE_LIMIT_CLEANUP, "*/15 * * * *", {}, { singletonKey: RATE_LIMIT_CLEANUP });
}
