import { londonDaysBetween } from "../time/index.js";

export type AvailabilityColour = "LIME" | "ORANGE" | "RED" | "BLUE" | "GREY";
export type EmploymentSituation = "CONTRACTING" | "PERMANENT" | "BETWEEN_CONTRACTS";

/** Underlying availability status (plan §3.1). Colour and freshness are derived separately. */
export type UnderlyingStatus =
  | "PERMANENT"
  | "AVAILABLE_NOW"
  | "ENDING_SOON"
  | "IN_CONTRACT"
  | "END_DATE_REACHED"
  | "UNCONFIRMED";

export interface AvailabilityFacts {
  employment: EmploymentSituation;
  /** End of the current contract (date-only); null when unknown. */
  contractEndDate: Date | null;
  /** Start date for a contractor who is not working but starts in future (Q2); null otherwise. */
  availableFrom: Date | null;
  /** True only when the contractor has explicitly confirmed "available now". Dates never imply it. */
  availableNowConfirmed: boolean;
  /** Date of last meaningful confirmation (B2: freshness is a separate dimension). */
  lastConfirmedAt: Date | null;
}

export interface AvailabilityOptions {
  /** Q2: map a not-working contractor with a future start to orange (<=28d) / red (>28d). */
  futureStartMapping: boolean;
}

export const DEFAULT_AVAILABILITY_OPTIONS: AvailabilityOptions = { futureStartMapping: true };

/** Contract-end window that makes a contract "ending soon" (B3). */
export const ENDING_SOON_WINDOW_DAYS = 28;

/**
 * Derive the underlying status. Lime (AVAILABLE_NOW) is produced only by an explicit
 * contractor confirmation; no date arithmetic can create it (B3, plan §3.1).
 */
export function deriveUnderlyingStatus(
  facts: AvailabilityFacts,
  now: Date,
  options: AvailabilityOptions = DEFAULT_AVAILABILITY_OPTIONS,
): UnderlyingStatus {
  if (facts.employment === "PERMANENT") return "PERMANENT";
  if (!facts.lastConfirmedAt) return "UNCONFIRMED";
  if (facts.employment === "CONTRACTING") {
    if (!facts.contractEndDate) return "UNCONFIRMED";
    const days = londonDaysBetween(now, facts.contractEndDate);
    if (days <= 0) return "END_DATE_REACHED";
    return days <= ENDING_SOON_WINDOW_DAYS ? "ENDING_SOON" : "IN_CONTRACT";
  }
  // BETWEEN_CONTRACTS
  if (facts.availableNowConfirmed) return "AVAILABLE_NOW";
  if (options.futureStartMapping && facts.availableFrom) {
    const days = londonDaysBetween(now, facts.availableFrom);
    if (days > 0) return days <= ENDING_SOON_WINDOW_DAYS ? "ENDING_SOON" : "IN_CONTRACT";
  }
  return "UNCONFIRMED";
}

const COLOUR_BY_STATUS: Record<UnderlyingStatus, AvailabilityColour> = {
  PERMANENT: "BLUE",
  AVAILABLE_NOW: "LIME",
  ENDING_SOON: "ORANGE",
  IN_CONTRACT: "RED",
  END_DATE_REACHED: "GREY",
  UNCONFIRMED: "GREY",
};

export function colourForStatus(status: UnderlyingStatus): AvailabilityColour {
  return COLOUR_BY_STATUS[status];
}
