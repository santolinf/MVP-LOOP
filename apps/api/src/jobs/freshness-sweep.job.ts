import type { PgBoss } from "pg-boss";

export const FRESHNESS_SWEEP = "freshness-sweep";

/** Idempotent; scheduled with a singleton key so only one runs at a time. */
export async function registerJobs(boss: PgBoss): Promise<void> {
  await boss.createQueue(FRESHNESS_SWEEP);
  await boss.work(FRESHNESS_SWEEP, async () => {
    // TODO(spec): recompute colours via @loop/domain and update searchColour.
  });
  await boss.schedule(FRESHNESS_SWEEP, "0 * * * *", {}, { singletonKey: FRESHNESS_SWEEP });
}
