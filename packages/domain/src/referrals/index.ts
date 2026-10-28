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

export type ReferralSource = "LINK" | "CODE" | "VERBAL";
export type ReferralFlagReason = "SAME_DEVICE" | "SELF_IDENTITY";
export type ReferralFlagStatus = "OPEN" | "CLEARED" | "CONFIRMED";

/**
 * Phase 9: an introduction counts (towards the lifetime count and Founding) only once attribution is
 * locked at completed registration (GO LIVE) and no review flag is open or confirmed.
 */
export function introductionCounts(i: { locked: boolean; flagStatuses: readonly ReferralFlagStatus[] }): boolean {
  return i.locked && !i.flagStatuses.some((s) => s === "OPEN" || s === "CONFIRMED");
}

/** "Sam Jones" -> "S*** J." so a verbal lookup can be confirmed without exposing the member. */
export function maskName(firstName: string | null, lastName: string | null): string {
  const first = firstName?.trim() ?? "";
  const last = lastName?.trim() ?? "";
  const f = first ? `${first[0]?.toUpperCase()}***` : "";
  const l = last ? `${last[0]?.toUpperCase()}.` : "";
  return [f, l].filter(Boolean).join(" ") || "A LOOP member";
}

/** Folds plus-tags and (for Gmail) dots so alias addresses compare equal. */
export function normaliseEmailIdentity(email: string): string {
  const [rawLocal = "", rawDomain = ""] = email.trim().toLowerCase().split("@");
  const domain = rawDomain === "googlemail.com" ? "gmail.com" : rawDomain;
  let local = rawLocal.split("+")[0] ?? "";
  if (domain === "gmail.com") local = local.replaceAll(".", "");
  return `${local}@${domain}`;
}

/** Referees of one introducer who registered from the same device form a cluster needing review. */
export function sameDeviceClusters(items: ReadonlyArray<{ referralId: string; deviceHash: string | null }>): string[][] {
  const byDevice = new Map<string, string[]>();
  for (const i of items) {
    if (!i.deviceHash) continue;
    byDevice.set(i.deviceHash, [...(byDevice.get(i.deviceHash) ?? []), i.referralId]);
  }
  return [...byDevice.values()].filter((ids) => ids.length > 1);
}
