import { z } from "zod";

// TODO(spec): "contractor intent" is not captured as a stored field yet; the gate asks two questions.
export const EligibilityDeclarationRequestSchema = z
  .object({
    ukBased: z.literal(true),
    rightToWork: z.literal(true),
    wordingVersion: z.string().min(1).max(32),
  })
  .strict();
export type EligibilityDeclarationRequest = z.infer<typeof EligibilityDeclarationRequestSchema>;

export const EligibilityDeclarationResultSchema = z.object({
  recorded: z.boolean(),
  wordingVersion: z.string(),
  recordedAt: z.string().datetime(),
});
export type EligibilityDeclarationResult = z.infer<typeof EligibilityDeclarationResultSchema>;
