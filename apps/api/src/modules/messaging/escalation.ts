import type { FreshnessState } from "@loop/domain";

interface EscalationState {
  unconfirmedSince: Date | null;
  escalationStage: string | null;
  searchSuppressed: boolean;
}

/**
 * Keeps `unconfirmedSince` and the escalation marker in step with the contractor's freshness. Becoming grey starts the
 * clock; leaving grey (a confirmation, or thresholds that now count them current) stops it, clears the marker and lifts
 * a suppression that escalation itself applied. Never touches the colour: that stays derived (B3).
 */
export function escalationPatch(current: EscalationState, freshness: FreshnessState, now: Date): Partial<EscalationState> {
  if (freshness === "UNCONFIRMED") {
    return current.unconfirmedSince ? {} : { unconfirmedSince: now };
  }
  if (!current.unconfirmedSince && !current.escalationStage) return {};
  return {
    unconfirmedSince: null,
    escalationStage: null,
    ...(current.escalationStage === "SUPPRESS" ? { searchSuppressed: false } : {}),
  };
}
