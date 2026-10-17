import { prisma } from "@loop/db";
import { DEFAULT_FRESHNESS_THRESHOLDS, type FreshnessThreshold, type FreshnessThresholds } from "@loop/domain";

const PREFIX = "freshness.thresholds.";

function isThreshold(v: unknown): v is FreshnessThreshold {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Record<string, unknown>;
  return typeof t.currentDays === "number" && typeof t.needsConfirmationDays === "number";
}

/** Thresholds from ReminderConfig rows `freshness.thresholds.<status>`, falling back to domain defaults. */
export async function loadFreshnessThresholds(): Promise<FreshnessThresholds> {
  const rows = await prisma.reminderConfig.findMany({ where: { key: { startsWith: PREFIX } } });
  const out: Record<string, FreshnessThreshold> = { ...DEFAULT_FRESHNESS_THRESHOLDS } as Record<string, FreshnessThreshold>;
  for (const r of rows) {
    if (isThreshold(r.value)) out[r.key.slice(PREFIX.length)] = r.value;
  }
  return out as FreshnessThresholds;
}
