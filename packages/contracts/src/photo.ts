import { z } from "zod";

export const PhotoPresignRequestSchema = z
  .object({
    mimeType: z.string().min(1).max(128),
    sizeBytes: z.number().int().min(1),
  })
  .strict();
export type PhotoPresignRequest = z.infer<typeof PhotoPresignRequestSchema>;

export const PhotoPresignResponseSchema = z.object({
  objectKey: z.string(),
  uploadUrl: z.string(),
  method: z.literal("PUT"),
  headers: z.record(z.string(), z.string()),
  expiresInSeconds: z.number().int(),
  maxBytes: z.number().int(),
});
export type PhotoPresignResponse = z.infer<typeof PhotoPresignResponseSchema>;

export const PhotoCompleteRequestSchema = z.object({ objectKey: z.string().min(1).max(256) }).strict();
export type PhotoCompleteRequest = z.infer<typeof PhotoCompleteRequestSchema>;

/** The contractor's own photograph: a short-lived presigned URL, or null when none has been added. */
export const PhotoSchema = z.object({
  url: z.string().nullable().meta({ type: "string", nullable: true } as never),
  expiresInSeconds: z.number().int(),
});
export type Photo = z.infer<typeof PhotoSchema>;
