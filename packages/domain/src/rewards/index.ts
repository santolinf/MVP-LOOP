export const QUALIFYING_SERVICE_MONTHS = 3;

export interface QualifyingContract {
  agencyVerified: boolean;
  paidServiceMonths: number;
}

/** B7: no agency verification, no reward approval. */
export function isRewardApprovable(c: QualifyingContract): boolean {
  return c.agencyVerified && c.paidServiceMonths >= QUALIFYING_SERVICE_MONTHS;
}
