import { z } from "zod";

export const PublicConfigSchema = z.object({
  flags: z.object({
    payoutsLive: z.boolean(),
    agencyAccess: z.boolean(),
    profitShare: z.boolean(),
  }),
  founding: z.object({ cap: z.number().int(), claimed: z.number().int(), placesLeft: z.number().int() }),
});
export type PublicConfig = z.infer<typeof PublicConfigSchema>;
