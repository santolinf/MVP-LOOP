export const QUALIFYING_SERVICE_MONTHS = 3;
/** Money is integer pence. Each beneficiary earns this once; it is a fixed reward, not a profit share (B10). */
export const PLACEMENT_REWARD_PENCE = 5_000;

export type RewardType = "CONTRACTOR_PLACEMENT" | "INTRODUCER_PLACEMENT";
export type RewardStatus = "PENDING" | "UNDER_VERIFICATION" | "APPROVED" | "PAID";

export interface QualifyingContract {
  agencyVerified: boolean;
  paidServiceMonths: number;
}

/** B7: no agency verification, no reward approval. */
export function isRewardApprovable(c: QualifyingContract): boolean {
  return c.agencyVerified && c.paidServiceMonths >= QUALIFYING_SERVICE_MONTHS;
}

const NEXT: Record<RewardStatus, RewardStatus | null> = {
  PENDING: "UNDER_VERIFICATION",
  UNDER_VERIFICATION: "APPROVED",
  APPROVED: "PAID",
  PAID: null,
};

/** Statuses only move forward one step: pending, under verification, approved, paid. */
export function canTransitionReward(from: RewardStatus, to: RewardStatus): boolean {
  return NEXT[from] === to;
}

/** Radar contracts are excluded; a reward is for the contractor's first qualifying placement only. */
export function isPlacementRewardEligible(p: { isRadar: boolean; hasEarlierPlacementReward: boolean }): boolean {
  return !p.isRadar && !p.hasEarlierPlacementReward;
}

/** Whole months of service between two date-only values; a part month does not count. */
export function wholeMonthsBetween(start: Date, end: Date): number {
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
  if (end.getUTCDate() < start.getUTCDate()) months -= 1;
  return Math.max(0, months);
}
