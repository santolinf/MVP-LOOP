export interface ReferralAttempt {
  referrerId: string;
  refereeId: string;
  refereeAlreadyAttributed: boolean;
}

/** A referral is valid when not self-referral and the referee has no prior attribution. */
export function isReferralValid(r: ReferralAttempt): boolean {
  return r.referrerId !== r.refereeId && !r.refereeAlreadyAttributed;
}
