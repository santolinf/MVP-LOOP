import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  version: z.string().optional(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
