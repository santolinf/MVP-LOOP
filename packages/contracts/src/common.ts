import { z } from "zod";

export const AvailabilityColourSchema = z.enum(["LIME", "ORANGE", "RED", "BLUE", "GREY"]);
export type AvailabilityColour = z.infer<typeof AvailabilityColourSchema>;

/** RFC 9457 problem details. */
export const ProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  code: z.string().optional(),
});
export type Problem = z.infer<typeof ProblemSchema>;
