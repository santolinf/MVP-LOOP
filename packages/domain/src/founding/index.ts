export const FOUNDING_CAP = 50_000;
export const FOUNDING_REQUIRED_REFERRALS = 5;

export interface FoundingCandidate {
  uniqueRegisteredDirectReferrals: number;
  isCurrent: boolean;
}

/** Eligibility only; allocation against the cap is transactional in the DB (B6). */
export function isFoundingEligible(c: FoundingCandidate): boolean {
  return c.isCurrent && c.uniqueRegisteredDirectReferrals >= FOUNDING_REQUIRED_REFERRALS;
}
