import type { PgBoss } from "pg-boss";
import { prisma } from "@loop/db";
import { describeAvailability } from "@loop/domain";
import { loadFreshnessThresholds } from "../common/freshness-config.js";
import { factsFor } from "../modules/me/me.service.js";

export const FRESHNESS_SWEEP = "freshness-sweep";
const BATCH = 500;

/** B4: recompute cached underlyingStatus, freshnessState and searchColour. Idempotent; only writes changes. */
export async function runFreshnessSweep(now = new Date()): Promise<number> {
  const thresholds = await loadFreshnessThresholds();
  let updated = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.contractor.findMany({
      take: BATCH,
      orderBy: { id: "asc" },
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;
    for (const c of rows) {
      const a = describeAvailability(factsFor(c, now), thresholds, now);
      if (c.underlyingStatus === a.underlyingStatus && c.freshnessState === a.freshnessState && c.searchColour === a.colour) continue;
      await prisma.contractor.update({
        where: { id: c.id },
        data: { underlyingStatus: a.underlyingStatus, freshnessState: a.freshnessState, searchColour: a.colour },
      });
      updated++;
    }
    cursor = rows[rows.length - 1]?.id;
    if (rows.length < BATCH) break;
  }
  return updated;
}

/** Idempotent; scheduled with a singleton key so only one runs at a time. */
export async function registerJobs(boss: PgBoss): Promise<void> {
  await boss.createQueue(FRESHNESS_SWEEP);
  await boss.work(FRESHNESS_SWEEP, async () => {
    await runFreshnessSweep();
  });
  await boss.schedule(FRESHNESS_SWEEP, "0 * * * *", {}, { singletonKey: FRESHNESS_SWEEP });
}
