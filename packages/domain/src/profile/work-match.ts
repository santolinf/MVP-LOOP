// Jév matching semantics for location and work pattern (handover 06, section 6). Pure: no I/O.
// Two separate outcomes: CONFIRMED needs the contractor's explicit choices to satisfy the requirement; POTENTIAL is plausible
// but unconfirmed and goes to a human, never treated as consent. Distance or radius is never used to assume willingness.

import type { WorkLocation, WorkPatternChoice } from "./join-profile.js";

export interface WorkPreferences {
  workLocations: readonly string[];
  /** Individually chosen towns/cities (display names). */
  places: readonly string[];
  workPatterns: readonly string[];
  /** Maximum on-site days for hybrid roles only. */
  hybridDays: number | null;
  remoteUk: boolean | null;
  occasionalTravel: "YES" | "NO" | "DEPENDS" | null;
}

export interface WorkRequirement {
  pattern: WorkPatternChoice;
  /** Region of the workplace (hybrid / on-site). */
  region?: WorkLocation;
  /** Named town or city of the workplace, if the agency gave one. */
  place?: string;
  /** Days on site per week for a hybrid role. */
  hybridDaysRequired?: number;
}

export type WorkMatch = "CONFIRMED" | "POTENTIAL" | "NO_MATCH";

const norm = (s: string) => s.trim().toLowerCase();

/** True only when the contractor explicitly chose this region (or "anywhere in the UK") or this town/city. */
export function isExplicitLocation(p: WorkPreferences, region?: string, place?: string): boolean {
  if (p.workLocations.includes("ANYWHERE")) return true;
  if (region && p.workLocations.includes(region)) return true;
  return !!place && p.places.some((x) => norm(x) === norm(place));
}

export function assessWorkMatch(p: WorkPreferences, r: WorkRequirement): WorkMatch {
  if (!p.workPatterns.includes(r.pattern)) return "NO_MATCH";
  if (r.pattern === "REMOTE") return "CONFIRMED"; // remote acceptance says nothing about attending an office
  const located = isExplicitLocation(p, r.region, r.place);
  if (r.pattern === "HYBRID" && r.hybridDaysRequired !== undefined && (p.hybridDays === null || r.hybridDaysRequired > p.hybridDays))
    return located ? "POTENTIAL" : "NO_MATCH";
  return located ? "CONFIRMED" : "POTENTIAL";
}
