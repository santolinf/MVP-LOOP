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
 * Thresholds are supplied by config (ReminderConfig `freshness.thresholds.<status>`).
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

/**
 * Defaults aligned to the V33 app-spec reminder cadences: Available now 7 days,
 * Ending soon 14 (prompts at 28/14/7 before end), In contract 30, Permanent 60.
 * `currentDays` follows the spec; `needsConfirmationDays` (grace before UNCONFIRMED) is not
 * defined by the spec and is an assumption of 2x. Runtime values come from ReminderConfig.
 */
export const DEFAULT_FRESHNESS_THRESHOLDS: FreshnessThresholds = {
  AVAILABLE_NOW: { currentDays: 7, needsConfirmationDays: 14 },
  ENDING_SOON: { currentDays: 14, needsConfirmationDays: 28 },
  IN_CONTRACT: { currentDays: 30, needsConfirmationDays: 60 },
  PERMANENT: { currentDays: 60, needsConfirmationDays: 120 },
};
