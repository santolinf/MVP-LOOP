// V33 registration rules (issue #18): what a contractor must have supplied before GO LIVE. Pure: no I/O.

/** Spec A5/V33: at least five relevant skills; ten or more is encouraged. */
export const MIN_SKILLS = 5;
export const MAX_PREFERRED_ROLES = 3;

export const WORK_LOCATIONS = [
  "ANYWHERE",
  "LONDON",
  "SOUTH_EAST",
  "SOUTH_WEST",
  "MIDLANDS",
  "NORTH_WEST",
  "NORTH_EAST",
  "YORKSHIRE",
  "SCOTLAND",
  "WALES",
  "NORTHERN_IRELAND",
] as const;
export const LONDON_AREAS = ["ANYWHERE_LONDON", "CENTRAL", "NORTH", "SOUTH", "EAST", "WEST"] as const;
export const WORK_PATTERNS = ["REMOTE", "HYBRID", "ONSITE"] as const;
export const MAX_HYBRID_DAYS = 4;

export type WorkLocation = (typeof WORK_LOCATIONS)[number];
export type LondonArea = (typeof LONDON_AREAS)[number];
export type WorkPatternChoice = (typeof WORK_PATTERNS)[number];

export interface ProfileFacts {
  title: string | null;
  skillCount: number;
  location: string | null;
  locationConfirmed: boolean;
}

export type ProfileGap = "TITLE" | "SKILLS" | "LOCATION" | "LOCATION_CONFIRMATION";

/** Everything the Profile review step requires. Empty means complete. */
export function profileGaps(f: ProfileFacts): ProfileGap[] {
  const gaps: ProfileGap[] = [];
  if (!f.title?.trim()) gaps.push("TITLE");
  if (f.skillCount < MIN_SKILLS) gaps.push("SKILLS");
  if (!f.location?.trim()) gaps.push("LOCATION");
  else if (!f.locationConfirmed) gaps.push("LOCATION_CONFIRMATION");
  return gaps;
}

export interface PreferenceFacts {
  targetDayRatePence: number | null;
  minDayRatePence: number | null;
  /** From the profile details: INSIDE | OUTSIDE | EITHER | UNSURE. */
  ir35Status: string | null;
  usesUmbrella: boolean | null;
  umbrellaProvider: string | null;
  workLocations: readonly string[];
  otherLocations: string | null;
  workLocationsConfirmed: boolean;
  /** YES | NO */
  securityClearance: string | null;
  workPatterns: readonly string[];
  /** Hybrid on-site days per week (1-4). Required only when hybrid work is accepted. */
  hybridDays?: number | null;
  /** UK-wide fully remote answer; Yes must agree with accepting remote work. */
  remoteUk?: boolean | null;
}

export type PreferenceGap =
  | "TARGET_RATE"
  | "MIN_RATE"
  | "RATE_ORDER"
  | "IR35"
  | "UMBRELLA"
  | "UMBRELLA_PROVIDER"
  | "WORK_LOCATIONS"
  | "WORK_LOCATIONS_CONFIRMATION"
  | "SECURITY_CLEARANCE"
  | "WORK_PATTERN"
  | "HYBRID_DAYS"
  | "REMOTE_CONFLICT";

/** Everything the Preferences step requires. Empty means complete. */
export function preferenceGaps(f: PreferenceFacts): PreferenceGap[] {
  const gaps: PreferenceGap[] = [];
  if (!f.targetDayRatePence) gaps.push("TARGET_RATE");
  if (!f.minDayRatePence) gaps.push("MIN_RATE");
  if (f.targetDayRatePence && f.minDayRatePence && f.minDayRatePence > f.targetDayRatePence) gaps.push("RATE_ORDER");
  if (!f.ir35Status) gaps.push("IR35");
  if (f.usesUmbrella === null) gaps.push("UMBRELLA");
  else if (f.usesUmbrella && !f.umbrellaProvider?.trim()) gaps.push("UMBRELLA_PROVIDER");
  if (f.workLocations.length === 0 && !f.otherLocations?.trim()) gaps.push("WORK_LOCATIONS");
  else if (!f.workLocationsConfirmed) gaps.push("WORK_LOCATIONS_CONFIRMATION");
  if (!f.securityClearance) gaps.push("SECURITY_CLEARANCE");
  if (f.workPatterns.length === 0) gaps.push("WORK_PATTERN");
  // The hybrid-day limit belongs to hybrid roles only; it is not asked, or enforced, for fully on-site work.
  if (f.workPatterns.includes("HYBRID") && !(f.hybridDays && f.hybridDays >= 1 && f.hybridDays <= MAX_HYBRID_DAYS)) gaps.push("HYBRID_DAYS");
  // Saying yes to UK-wide remote work while not accepting remote work is contradictory and must be resolved.
  if (f.remoteUk === true && f.workPatterns.length > 0 && !f.workPatterns.includes("REMOTE")) gaps.push("REMOTE_CONFLICT");
  return gaps;
}
