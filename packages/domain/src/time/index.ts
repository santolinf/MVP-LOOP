const LONDON = "Europe/London";

/** Returns the calendar date (YYYY-MM-DD) of an instant in Europe/London. */
export function londonDate(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LONDON,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Whole days from `from` to `to` (date-only, London). Negative if `to` is earlier. */
export function londonDaysBetween(from: Date, to: Date): number {
  const a = Date.parse(`${londonDate(from)}T00:00:00Z`);
  const b = Date.parse(`${londonDate(to)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}
