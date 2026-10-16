import { londonDaysBetween } from "../time/index.js";

export type AvailabilityColour = "LIME" | "ORANGE" | "RED" | "BLUE" | "GREY";
export type EmploymentSituation = "CONTRACTING" | "PERMANENT" | "BETWEEN_ROLES";

export interface AvailabilityFacts {
  employment: EmploymentSituation;
  /** Confirmed date the contractor can start; null when unconfirmed. */
  availableFrom: Date | null;
  /** Date of last meaningful confirmation (B2: freshness is a separate dimension). */
  lastConfirmedAt: Date | null;
}

export const ORANGE_WINDOW_DAYS = 28;

/**
 * Derive the availability colour (B3). Never auto-promotes to green:
 * unconfirmed facts resolve to GREY. Permanent employees are always BLUE.
 */
export function deriveAvailabilityColour(facts: AvailabilityFacts, now: Date): AvailabilityColour {
  if (facts.employment === "PERMANENT") return "BLUE";
  if (!facts.lastConfirmedAt || !facts.availableFrom) return "GREY";
  const days = londonDaysBetween(now, facts.availableFrom);
  if (days <= 0) return "LIME";
  if (days <= ORANGE_WINDOW_DAYS) return "ORANGE";
  return "RED";
}
