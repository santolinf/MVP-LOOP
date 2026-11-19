// Contractor profile photograph rules. Pure: no I/O.

export type PhotoFileType = "JPEG" | "PNG" | "WEBP";

export const PHOTO_MIME_TYPES: Record<PhotoFileType, string> = {
  JPEG: "image/jpeg",
  PNG: "image/png",
  WEBP: "image/webp",
};

export const PHOTO_ALLOWED_MIMES: readonly string[] = Object.values(PHOTO_MIME_TYPES);

/** Matches the limit the profile form already shows ("maximum 3 MB"). */
export const PHOTO_MAX_BYTES = 3 * 1024 * 1024;

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0): boolean =>
  bytes.length >= offset + sig.length && sig.every((b, i) => bytes[offset + i] === b);

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP = [0x57, 0x45, 0x42, 0x50]; // "WEBP" at byte 8

/** Detects the real image type from leading bytes, ignoring the declared MIME. SVG and everything else is rejected. */
export function detectPhotoType(head: Uint8Array): PhotoFileType | null {
  if (startsWith(head, JPEG_MAGIC)) return "JPEG";
  if (startsWith(head, PNG_MAGIC)) return "PNG";
  if (startsWith(head, RIFF) && startsWith(head, WEBP, 8)) return "WEBP";
  return null;
}

export type PhotoDeclarationCheck = { ok: true } | { ok: false; reason: "UNSUPPORTED_TYPE" | "EMPTY" | "TOO_LARGE" };

/** Pre-upload check of what the client declares; the stored object is re-verified after upload. */
export function checkPhotoDeclaration(mime: string, sizeBytes: number, maxBytes: number = PHOTO_MAX_BYTES): PhotoDeclarationCheck {
  if (!PHOTO_ALLOWED_MIMES.includes(mime)) return { ok: false, reason: "UNSUPPORTED_TYPE" };
  if (sizeBytes <= 0) return { ok: false, reason: "EMPTY" };
  if (sizeBytes > maxBytes) return { ok: false, reason: "TOO_LARGE" };
  return { ok: true };
}

/** The detected content must agree with the declared MIME. */
export function detectedPhotoMatchesDeclared(detected: PhotoFileType, declaredMime: string): boolean {
  return PHOTO_MIME_TYPES[detected] === declaredMime;
}

/** Objects are namespaced by owner, so a key is only ever accepted for the contractor it was issued to. */
export const photoKeyPrefix = (contractorId: string): string => `photos/${contractorId}/`;
export const isPhotoKeyOwnedBy = (key: string, contractorId: string): boolean =>
  key.startsWith(photoKeyPrefix(contractorId)) && !key.slice(photoKeyPrefix(contractorId).length).includes("/") && key.length > photoKeyPrefix(contractorId).length;
