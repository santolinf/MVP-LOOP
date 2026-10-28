import { z } from "zod";

export const ExtractionFieldKeySchema = z.enum([
  "headline",
  "currentRole",
  "skill",
  "location",
  "yearsExperience",
  "summary",
  "roleDates",
  "clearance",
]);
export type ExtractionFieldKey = z.infer<typeof ExtractionFieldKeySchema>;

/** Fixed schema the LLM provider must return (A4). Anything that fails to parse is discarded. */
export const LlmCandidateFieldSchema = z.object({
  key: z.string(),
  value: z.string(),
  sourceExcerpt: z.string(),
  confidence: z.number().min(0).max(1),
});
export const LlmOutputSchema = z.object({ fields: z.array(LlmCandidateFieldSchema) });
export type LlmOutput = z.infer<typeof LlmOutputSchema>;

export const ExtractedFieldSchema = z.object({
  id: z.string(),
  key: ExtractionFieldKeySchema,
  /** AI suggestion, never overwritten. */
  suggestedValue: z.string(),
  sourceExcerpt: z.string(),
  confidence: z.number(),
  /** Contractor-confirmed value; null until they confirm or edit. */
  confirmedValue: z.string().nullable().meta({ type: "string", nullable: true } as never),
});
export type ExtractedField = z.infer<typeof ExtractedFieldSchema>;

export const ExtractionReviewSchema = z.object({
  uploadId: z.string(),
  /** PENDING = still processing; READY = review the fields; COULD_NOT_READ = enter details manually. */
  status: z.enum(["PENDING", "READY", "COULD_NOT_READ"]),
  fields: z.array(ExtractedFieldSchema),
});
export type ExtractionReview = z.infer<typeof ExtractionReviewSchema>;

export const ConfirmExtractedFieldRequestSchema = z
  .object({
    /** Omit to accept the suggestion as-is; supply to edit it. */
    value: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();
export type ConfirmExtractedFieldRequest = z.infer<typeof ConfirmExtractedFieldRequestSchema>;
