import { addLondonDays, londonDate } from "../time/index.js";
import type { EmploymentSituation } from "./index.js";

export interface SituationInput {
  employment: EmploymentSituation;
  /** Date-only strings (YYYY-MM-DD, Europe/London) as supplied by the contractor. */
  availableFrom: string | null;
  contractEndDate: string | null;
}

export type SituationIssue = { field: "availableFrom" | "contractEndDate"; message: string };

/** How far ahead a contractor may declare a start or end date. */
export const MAX_FUTURE_DATE_DAYS = 365 * 3;

/**
 * Normalise and validate the situation a contractor declares (B2/B3). Dates that do not apply to the
 * employment situation are cleared, never kept: a permanent employee has no contract end, a contractor
 * has no start date. Passing an end date never produces an available-now state; that needs an explicit
 * confirmation (B3).
 */
export function normaliseSituation(
  input: SituationInput,
  now: Date,
): { value: SituationInput; issues: SituationIssue[] } {
  const issues: SituationIssue[] = [];
  const max = londonDate(addLondonDays(now, MAX_FUTURE_DATE_DAYS));
  const today = londonDate(now);
  const check = (field: SituationIssue["field"], v: string | null, allowPast: boolean) => {
    if (!v) return;
    if (v > max) issues.push({ field, message: "Date is too far in the future" });
    if (!allowPast && v < today) issues.push({ field, message: "Date cannot be in the past" });
  };

  switch (input.employment) {
    case "PERMANENT":
      return { value: { ...input, availableFrom: null, contractEndDate: null }, issues };
    case "CONTRACTING":
      // A contract that has already ended is accepted (it derives grey), so the contractor can say so.
      check("contractEndDate", input.contractEndDate, true);
      return { value: { ...input, availableFrom: null }, issues };
    case "BETWEEN_CONTRACTS":
      check("availableFrom", input.availableFrom, false);
      return { value: { ...input, contractEndDate: null }, issues };
  }
}
