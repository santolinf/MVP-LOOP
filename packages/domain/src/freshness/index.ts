import type { UnderlyingStatus } from "../availability/index.js";

export type FreshnessState = "CURRENT" | "NEEDS_CONFIRMATION" | "UNCONFIRMED";

/** Days since last confirmation: <= currentDays is CURRENT, <= needsConfirmationDays is NEEDS_CONFIRMATION, else UNCONFIRMED. */
export interface FreshnessThreshold {
  currentDays: number;
  needsConfirmationDays: number;
}

export type FreshnessThresholds = Partial<Record<UnderlyingStatus, FreshnessThreshold>>;

/**
 * Freshness is computed from lastConfirmedAt, the underlying status and configured
 * thresholds. It never changes the underlying status (plan §3.2).
 * TODO(spec): Q3 — threshold values are placeholders supplied by config.
 */
export function deriveFreshness(
  status: UnderlyingStatus,
  lastConfirmedAt: Date | null,
  thresholds: FreshnessThresholds,
  now: Date,
): FreshnessState {
  const t = thresholds[status];
  if (!lastConfirmedAt || !t) return "UNCONFIRMED";
  const days = (now.getTime() - lastConfirmedAt.getTime()) / 86_400_000;
  if (days <= t.currentDays) return "CURRENT";
  if (days <= t.needsConfirmationDays) return "NEEDS_CONFIRMATION";
  return "UNCONFIRMED";
}

/**
 * Colour shown to the public: grey whenever freshness is UNCONFIRMED (Q4), otherwise the
 * status colour. Admins also receive the underlying status.
 */
export function isFreshnessGrey(freshness: FreshnessState): boolean {
  return freshness === "UNCONFIRMED";
}

/** TODO(spec): Q3 — placeholder thresholds; runtime values come from ReminderConfig `freshness.thresholds.<status>`. */
export const DEFAULT_FRESHNESS_THRESHOLDS: FreshnessThresholds = {
  AVAILABLE_NOW: { currentDays: 7, needsConfirmationDays: 14 },
  ENDING_SOON: { currentDays: 14, needsConfirmationDays: 28 },
  IN_CONTRACT: { currentDays: 30, needsConfirmationDays: 60 },
  PERMANENT: { currentDays: 60, needsConfirmationDays: 120 },
};
