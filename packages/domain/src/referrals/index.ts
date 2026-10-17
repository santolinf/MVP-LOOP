export interface ReferralAttempt {
  referrerId: string;
  refereeId: string;
  refereeAlreadyAttributed: boolean;
}

/** A referral is valid when not self-referral and the referee has no prior attribution. */
export function isReferralValid(r: ReferralAttempt): boolean {
  return r.referrerId !== r.refereeId && !r.refereeAlreadyAttributed;
}

// No 0/O/1/I/L so codes survive being read aloud or retyped.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const REFERRAL_CODE_LENGTH = 8;

/** `randomInt(n)` must return a uniform integer in [0, n); injected so the rule stays pure. */
export function generateReferralCode(randomInt: (max: number) => number): string {
  let out = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

/** Returns the canonical code, or null when the input cannot be a code. */
export function normaliseReferralCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  if (code.length !== REFERRAL_CODE_LENGTH) return null;
  return [...code].every((ch) => CODE_ALPHABET.includes(ch)) ? code : null;
}
