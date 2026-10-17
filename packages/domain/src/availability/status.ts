import { RECONFIRM_INTERVAL_DAYS } from "../freshness/index.js";
import { deriveAvailabilityColour, type AvailabilityColour, type AvailabilityFacts } from "./index.js";

export const AVAILABILITY_LABELS: Record<AvailabilityColour, string> = {
  LIME: "Available now",
  ORANGE: "Available soon",
  RED: "Unavailable",
  BLUE: "Permanent, open to contract",
  GREY: "Unconfirmed",
};

export interface AvailabilityStatusResult {
  colour: AvailabilityColour;
  label: string;
  lastConfirmedAt: Date | null;
  /** Next scheduled reconfirmation; null when the schedule is event-driven or nothing is confirmed. */
  nextCheckAt: Date | null;
}

/** Computed status returned to every client (rule 13): colour, label and next check. */
export function describeAvailability(facts: AvailabilityFacts, now: Date): AvailabilityStatusResult {
  const colour = deriveAvailabilityColour(facts, now);
  const interval = RECONFIRM_INTERVAL_DAYS[colour];
  const nextCheckAt =
    facts.lastConfirmedAt && interval !== null
      ? new Date(facts.lastConfirmedAt.getTime() + interval * 86_400_000)
      : null;
  return { colour, label: AVAILABILITY_LABELS[colour], lastConfirmedAt: facts.lastConfirmedAt, nextCheckAt };
}
