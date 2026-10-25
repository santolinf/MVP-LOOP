// Phase 3 CV intake rules. Pure: no I/O.

export type CvFileType = "PDF" | "DOC" | "DOCX";

export const CV_MIME_TYPES: Record<CvFileType, string> = {
  PDF: "application/pdf",
  DOC: "application/msword",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export const CV_UPLOAD_ALLOWED_MIMES: readonly string[] = Object.values(CV_MIME_TYPES);

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0): boolean =>
  bytes.length >= offset + sig.length && sig.every((b, i) => bytes[offset + i] === b);

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // legacy DOC (OLE2)
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // DOCX (OOXML zip)

/**
 * Detects the real type from leading bytes, ignoring the declared MIME. A DOCX is a zip whose first
 * entry name is within the first bytes ("[Content_Types].xml" or "word/"); other zips are rejected.
 */
export function detectCvType(head: Uint8Array): CvFileType | null {
  if (startsWith(head, PDF_MAGIC)) return "PDF";
  if (startsWith(head, OLE_MAGIC)) return "DOC";
  if (startsWith(head, ZIP_MAGIC)) {
    const text = Buffer.from(head.subarray(0, 512)).toString("latin1");
    if (text.includes("[Content_Types].xml") || text.includes("word/") || text.includes("_rels/")) return "DOCX";
  }
  return null;
}

export type CvDeclarationCheck =
  | { ok: true }
  | { ok: false; reason: "UNSUPPORTED_TYPE" | "EMPTY" | "TOO_LARGE" };

/** Pre-upload check of what the client declares; the stored object is re-verified after upload. */
export function checkCvDeclaration(mime: string, sizeBytes: number, maxBytes: number): CvDeclarationCheck {
  if (!CV_UPLOAD_ALLOWED_MIMES.includes(mime)) return { ok: false, reason: "UNSUPPORTED_TYPE" };
  if (sizeBytes <= 0) return { ok: false, reason: "EMPTY" };
  if (sizeBytes > maxBytes) return { ok: false, reason: "TOO_LARGE" };
  return { ok: true };
}

/** The detected content must agree with the declared MIME. */
export function detectedMatchesDeclared(detected: CvFileType, declaredMime: string): boolean {
  return CV_MIME_TYPES[detected] === declaredMime;
}

export type UploadQuotaDecision =
  | { allowed: true }
  | { allowed: false; reason: "IP_QUOTA" | "GLOBAL_QUOTA" };

export interface UploadQuotaContext {
  authenticated: boolean;
  uploadsLastHourForIp: number;
  anonUploadsLastHourGlobal: number;
}

/** Anonymous quotas only; signed-in contractors are covered by the global rate limiter. */
export function decideAnonymousUpload(
  ctx: UploadQuotaContext,
  limits: { perIpPerHour: number; globalPerHour: number },
): UploadQuotaDecision {
  if (ctx.authenticated) return { allowed: true };
  if (ctx.uploadsLastHourForIp >= limits.perIpPerHour) return { allowed: false, reason: "IP_QUOTA" };
  if (ctx.anonUploadsLastHourGlobal >= limits.globalPerHour) return { allowed: false, reason: "GLOBAL_QUOTA" };
  return { allowed: true };
}

export const ELIGIBILITY_WORDING_VERSION = "v1";
