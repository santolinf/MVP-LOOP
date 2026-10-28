import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

// RFC 6238 TOTP (SHA-1, 30 s step, 6 digits) with no dependency, plus at-rest encryption of the shared secret.

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text.replace(/=+$/, "").toUpperCase()) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const generateTotpSecret = (): string => base32Encode(randomBytes(20));

export const totpStep = (now: Date): number => Math.floor(now.getTime() / 1000 / TOTP_STEP_SECONDS);

export function totpCode(secret: string, step: number, digits = TOTP_DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = (h[h.length - 1] ?? 0) & 15;
  const bin = (((h[offset] ?? 0) & 0x7f) << 24) | ((h[offset + 1] ?? 0) << 16) | ((h[offset + 2] ?? 0) << 8) | (h[offset + 3] ?? 0);
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/**
 * Accepts the current step and one either side (clock drift). Returns the matched step, or null. A step at or before
 * `lastStep` is refused, so a captured code cannot be replayed.
 */
export function verifyTotp(secret: string, code: string, now: Date, lastStep: number | null): number | null {
  const current = totpStep(now);
  let match: number | null = null;
  for (const step of [current - 1, current, current + 1]) {
    const expected = Buffer.from(totpCode(secret, step));
    const given = Buffer.from(code);
    // Evaluate every candidate so timing does not reveal which step matched.
    if (expected.length === given.length && timingSafeEqual(expected, given) && (lastStep === null || step > lastStep)) match = step;
  }
  return match;
}

export function otpauthUrl(email: string, secret: string, issuer = "LOOP Admin"): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}

const key = (sessionSecret: string): Buffer => Buffer.from(hkdfSync("sha256", sessionSecret, "loop-staff", "totp-secret-v1", 32));

/** AES-256-GCM; output `iv.tag.ciphertext` (base64url). The key is derived from SESSION_SECRET, never stored. */
export function encryptSecret(plain: string, sessionSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(sessionSecret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decryptSecret(stored: string, sessionSecret: string): string {
  const [iv, tag, data] = stored.split(".").map((p) => Buffer.from(p, "base64url"));
  if (!iv || !tag || !data) throw new Error("Malformed secret");
  const decipher = createDecipheriv("aes-256-gcm", key(sessionSecret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
