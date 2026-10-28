export const FOUNDING_CAP = 50_000;
export const FOUNDING_REQUIRED_REFERRALS = 5;

export interface FoundingCandidate {
  uniqueRegisteredDirectReferrals: number;
  isCurrent: boolean;
  /** Only consulted when `requireAppSignIn` is set. */
  hasVerifiedAppSignIn?: boolean;
  /**
   * TODO(spec): Open Question 11. The app spec makes a verified first app sign-in a condition, but the app is
   * deferred, so it is off by default and awards are made without it.
   */
  requireAppSignIn?: boolean;
}

/** Eligibility only; allocation against the cap is transactional in the DB (B6). */
export function isFoundingEligible(c: FoundingCandidate): boolean {
  if (c.requireAppSignIn && !c.hasVerifiedAppSignIn) return false;
  return c.isCurrent && c.uniqueRegisteredDirectReferrals >= FOUNDING_REQUIRED_REFERRALS;
}

/** Counts only; never names. */
export function foundingPlacesLeft(allocated: number, cap: number = FOUNDING_CAP): number {
  return Math.max(0, cap - allocated);
}
