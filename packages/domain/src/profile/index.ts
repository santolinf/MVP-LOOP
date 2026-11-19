export * from "./join-profile.js";

// Phase 7 app-spec profile fields. Pure: no I/O.
export const SECURITY_CLEARANCE = ["YES", "NO"] as const;
export const IR35_STATUS = ["INSIDE", "OUTSIDE", "EITHER", "UNSURE"] as const;
export const WORK_PATTERN = ["FULL_TIME", "PART_TIME", "FLEXIBLE"] as const;

export type SecurityClearance = (typeof SECURITY_CLEARANCE)[number];
export type Ir35Status = (typeof IR35_STATUS)[number];
export type WorkPattern = (typeof WORK_PATTERN)[number];

export interface DateRange {
  startDate: string;
  endDate: string | null;
}

/** Date-only strings (YYYY-MM-DD) compare correctly as text. An open-ended assignment is ongoing. */
export function validateAssignmentDates(r: DateRange, today: string): string | null {
  if (r.startDate > today) return "startDate: cannot be in the future";
  if (r.endDate !== null && r.endDate < r.startDate) return "endDate: cannot be before the start date";
  return null;
}
export * from "./work-match.js";
