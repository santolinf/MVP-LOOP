// Phase 6 GO LIVE rule. The UI shows readiness; only this function decides it.

import { type ConsentPurpose, missingRequiredConsents } from "../consent/index.js";

export type GoLiveBlocker =
  | "NAME_MISSING"
  | "ELIGIBILITY_MISSING"
  | "AVAILABILITY_NOT_CONFIRMED"
  | "PROFILE_FIELD_MISSING"
  | "PROFILE_INCOMPLETE"
  | "PREFERENCES_INCOMPLETE"
  | "CONSENT_PROFILE_VISIBILITY"
  | "CONSENT_OPERATIONAL_EMAIL";

export interface GoLiveInput {
  firstName: string | null;
  lastName: string | null;
  /** A UK-based + right-to-work declaration exists for this contractor. */
  eligibilityDeclared: boolean;
  /** An employment situation is stored and the contractor has confirmed it (lastConfirmedAt set). */
  availabilityConfirmed: boolean;
  /** Count of contractor-confirmed profile fields of a kind that identifies them (see GO_LIVE_PROFILE_FIELD_KEYS). */
  confirmedProfileFields: number;
  /** Title, at least five skills and a confirmed location (profileGaps is empty). */
  profileComplete: boolean;
  /** Rates, IR35, umbrella, work locations, clearance and work pattern (preferenceGaps is empty). */
  preferencesComplete: boolean;
  activeConsents: ReadonlySet<ConsentPurpose>;
}

export type GoLiveDecision = { allowed: true } | { allowed: false; blockers: GoLiveBlocker[] };

const CONSENT_BLOCKER: Partial<Record<ConsentPurpose, GoLiveBlocker>> = {
  PROFILE_VISIBILITY: "CONSENT_PROFILE_VISIBILITY",
  OPERATIONAL_EMAIL: "CONSENT_OPERATIONAL_EMAIL",
};

/** Profile fields that count towards the "one confirmed CV field" requirement. */
export const GO_LIVE_PROFILE_FIELD_KEYS: readonly string[] = ["headline", "skill"];

export function decideGoLive(input: GoLiveInput): GoLiveDecision {
  const blockers: GoLiveBlocker[] = [];
  if (!input.firstName?.trim() || !input.lastName?.trim()) blockers.push("NAME_MISSING");
  if (!input.eligibilityDeclared) blockers.push("ELIGIBILITY_MISSING");
  if (!input.availabilityConfirmed) blockers.push("AVAILABILITY_NOT_CONFIRMED");
  if (input.confirmedProfileFields < 1) blockers.push("PROFILE_FIELD_MISSING");
  if (!input.profileComplete) blockers.push("PROFILE_INCOMPLETE");
  if (!input.preferencesComplete) blockers.push("PREFERENCES_INCOMPLETE");
  for (const p of missingRequiredConsents(input.activeConsents)) {
    const b = CONSENT_BLOCKER[p];
    if (b) blockers.push(b);
  }
  return blockers.length === 0 ? { allowed: true } : { allowed: false, blockers };
}

/** A LIVE profile must come off LIVE if a required consent is withdrawn. */
export function mustLeaveLive(active: ReadonlySet<ConsentPurpose>): boolean {
  return missingRequiredConsents(active).length > 0;
}
