import { prisma } from "@loop/db";

const KEY = "admin.rewards";

/**
 * Four-eyes threshold in pence (ReminderConfig row `admin.rewards`, field `fourEyesThresholdPence`).
 * TODO(spec): the threshold is undecided; 0 means the person who recorded a reward's evidence can never approve it.
 */
export async function loadFourEyesThresholdPence(): Promise<number> {
  const row = await prisma.reminderConfig.findUnique({ where: { key: KEY } });
  const v = row && typeof row.value === "object" && row.value !== null && !Array.isArray(row.value) ? (row.value as Record<string, unknown>).fourEyesThresholdPence : undefined;
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0;
}
