import { z } from "zod";

/** Returned once; the client keeps it in memory/sessionStorage and sends it as `x-draft-token`. */
export const CvDraftSchema = z.object({
  draftToken: z.string(),
  expiresAt: z.string().datetime(),
});
export type CvDraft = z.infer<typeof CvDraftSchema>;

export const CvPresignRequestSchema = z
  .object({
    mimeType: z.string().min(1).max(128),
    sizeBytes: z.number().int().min(1),
  })
  .strict();
export type CvPresignRequest = z.infer<typeof CvPresignRequestSchema>;

export const CvPresignResponseSchema = z.object({
  uploadId: z.string(),
  uploadUrl: z.string(),
  method: z.literal("PUT"),
  headers: z.record(z.string(), z.string()),
  expiresInSeconds: z.number().int(),
  maxBytes: z.number().int(),
});
export type CvPresignResponse = z.infer<typeof CvPresignResponseSchema>;

export const CvUploadStatusSchema = z.object({
  uploadId: z.string(),
  status: z.enum(["PENDING", "SCANNING", "READY", "REJECTED"]),
  /** Generic, user-safe message. Never reveals scan detail. */
  message: z.string().nullable().meta({ type: "string", nullable: true } as never),
});
export type CvUploadStatus = z.infer<typeof CvUploadStatusSchema>;

export const CvDownloadSchema = z.object({
  url: z.string(),
  expiresInSeconds: z.number().int(),
  /** True when the URL opens in the browser (a PDF requested inline); false when it will download. Additive, so older clients are unaffected. */
  inline: z.boolean(),
});
export type CvDownload = z.infer<typeof CvDownloadSchema>;
