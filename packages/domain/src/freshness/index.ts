import type { AvailabilityColour } from "../availability/index.js";

/** Reconfirmation interval in days per colour (B4). Null = event-driven schedule. */
export const RECONFIRM_INTERVAL_DAYS: Record<AvailabilityColour, number | null> = {
  LIME: 14,
  ORANGE: null,
  RED: 28,
  BLUE: 84,
  GREY: null,
};

export function isReconfirmationDue(colour: AvailabilityColour, lastConfirmedAt: Date | null, now: Date): boolean {
  if (!lastConfirmedAt) return true;
  const interval = RECONFIRM_INTERVAL_DAYS[colour];
  if (interval === null) return false;
  return now.getTime() - lastConfirmedAt.getTime() >= interval * 86_400_000;
}
