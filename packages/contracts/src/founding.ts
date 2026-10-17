import { z } from "zod";

export const FoundingStatusSchema = z.object({
  required: z.number().int(),
  registeredReferrals: z.number().int(),
  isCurrentProfile: z.boolean(),
  eligible: z.boolean(),
  /** Allocated place number once the contractor has qualified; null before. */
  place: z.number().int().nullable().meta({ type: "integer", nullable: true } as never),
});
export type FoundingStatus = z.infer<typeof FoundingStatusSchema>;
