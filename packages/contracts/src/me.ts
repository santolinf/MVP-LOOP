import { z } from "zod";
import { AvailabilityColourSchema } from "./common.js";

/** Computed status returned to clients; clients never derive colour themselves. */
export const AvailabilityStatusSchema = z.object({
  colour: AvailabilityColourSchema,
  label: z.string(),
  lastConfirmedAt: z.string().datetime().nullable(),
  nextCheckAt: z.string().datetime().nullable(),
});
export type AvailabilityStatus = z.infer<typeof AvailabilityStatusSchema>;
