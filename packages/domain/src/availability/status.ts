import {
  colourForStatus,
  deriveUnderlyingStatus,
  type AvailabilityColour,
  type AvailabilityFacts,
  type AvailabilityOptions,
  type UnderlyingStatus,
  DEFAULT_AVAILABILITY_OPTIONS,
} from "./index.js";
import { deriveFreshness, isFreshnessGrey, type FreshnessState, type FreshnessThresholds } from "../freshness/index.js";

export const AVAILABILITY_LABELS: Record<AvailabilityColour, string> = {
  LIME: "Available Now",
  ORANGE: "Available soon",
  RED: "Unavailable",
  BLUE: "Permanently Employed",
  GREY: "Unconfirmed",
};

export interface AvailabilityStatusResult {
  /** Colour to display (grey when freshness is UNCONFIRMED). */
  colour: AvailabilityColour;
  label: string;
  underlyingStatus: UnderlyingStatus;
  freshnessState: FreshnessState;
  lastConfirmedAt: Date | null;
}

/** Computed status returned to every client (rule 13). Reminder scheduling lives in `reminders`. */
export function describeAvailability(
  facts: AvailabilityFacts,
  thresholds: FreshnessThresholds,
  now: Date,
  options: AvailabilityOptions = DEFAULT_AVAILABILITY_OPTIONS,
): AvailabilityStatusResult {
  const underlyingStatus = deriveUnderlyingStatus(facts, now, options);
  const freshnessState = deriveFreshness(underlyingStatus, facts.lastConfirmedAt, thresholds, now);
  const colour = isFreshnessGrey(freshnessState) ? "GREY" : colourForStatus(underlyingStatus);
  return { colour, label: AVAILABILITY_LABELS[colour], underlyingStatus, freshnessState, lastConfirmedAt: facts.lastConfirmedAt };
}
