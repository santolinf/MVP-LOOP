import { z } from "zod";
import { AvailabilityColourSchema } from "./common.js";

/** Computed status returned to clients; clients never derive colour themselves. */
export const UnderlyingStatusSchema = z.enum([
  "PERMANENT",
  "AVAILABLE_NOW",
  "ENDING_SOON",
  "IN_CONTRACT",
  "END_DATE_REACHED",
  "UNCONFIRMED",
]);
export const FreshnessStateSchema = z.enum(["CURRENT", "NEEDS_CONFIRMATION", "UNCONFIRMED"]);

export const AvailabilityStatusSchema = z.object({
  colour: AvailabilityColourSchema,
  label: z.string(),
  lastConfirmedAt: z.string().datetime().nullable(),
  underlyingStatus: UnderlyingStatusSchema,
  freshnessState: FreshnessStateSchema,
});
export type AvailabilityStatus = z.infer<typeof AvailabilityStatusSchema>;

export const EmploymentSituationSchema = z.enum(["CONTRACTING", "PERMANENT", "BETWEEN_CONTRACTS"]);
export type EmploymentSituation = z.infer<typeof EmploymentSituationSchema>;

export const MeSchema = z.object({
  id: z.string(),
  firstName: z.string().nullable().meta({ type: "string", nullable: true } as never), // OpenAPI 3.0 form; keeps Orval from emitting string[]
  lastName: z.string().nullable().meta({ type: "string", nullable: true } as never),
  live: z.boolean(),
  paused: z.boolean(),
  employment: EmploymentSituationSchema.nullable(),
  /** Confirmed start date (YYYY-MM-DD, Europe/London) or null. */
  availableFrom: z.string().date().nullable(),
  availability: AvailabilityStatusSchema,
});
export type Me = z.infer<typeof MeSchema>;

/** confirmationSource is set to WEB by the server; clients never choose it. */
export const ConfirmAvailabilityRequestSchema = z.object({
  employment: EmploymentSituationSchema,
  availableFrom: z.string().date().nullable(),
});
export type ConfirmAvailabilityRequest = z.infer<typeof ConfirmAvailabilityRequestSchema>;
