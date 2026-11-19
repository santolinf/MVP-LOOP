import { completeMyPhoto, presignMyPhoto } from "@loop/api-client";

/** Mirrors the API's rules (packages/domain photo): JPG, PNG or WebP, up to 3 MB. The server re-verifies the stored object. */
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PHOTO_MAX_BYTES = 3 * 1024 * 1024;
export const PHOTO_HELP = "JPG, PNG or WebP, maximum 3 MB.";
export const PHOTO_REJECTED = "Please choose a JPG, PNG or WebP image under 3 MB.";

export function photoProblem(file: File): string | null {
  return PHOTO_TYPES.includes(file.type) && file.size > 0 && file.size <= PHOTO_MAX_BYTES ? null : PHOTO_REJECTED;
}

/** Uploads straight to the object store through a presigned URL, then asks the API to verify, scan and attach it. */
export async function uploadPhoto(file: File): Promise<void> {
  const signed = await presignMyPhoto({ mimeType: file.type, sizeBytes: file.size });
  if (signed.status !== 200) throw new Error("presign");
  const put = await fetch(signed.data.uploadUrl, { method: signed.data.method, headers: signed.data.headers, body: file });
  if (!put.ok) throw new Error("upload");
  const done = await completeMyPhoto({ objectKey: signed.data.objectKey });
  if (done.status !== 200) throw new Error("complete");
}

// A photograph chosen before an account exists is held in memory (it survives in-app navigation, not a reload) and
// uploaded as soon as registration creates the session.
let pending: File | null = null;

export const getPendingPhoto = (): File | null => pending;
export const setPendingPhoto = (file: File | null): void => {
  pending = file;
};

/** Returns false only when there was a photograph and it could not be saved. */
export async function uploadPendingPhoto(): Promise<boolean> {
  const file = pending;
  if (!file) return true;
  try {
    await uploadPhoto(file);
    pending = null;
    return true;
  } catch {
    return false;
  }
}
