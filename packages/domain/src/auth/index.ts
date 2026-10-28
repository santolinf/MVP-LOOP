// CH-03 passwordless email OTP rules. Pure: no I/O, randomness is injected.

// TODO(spec): defaults are proposals (plan line 335); runtime-editable via ReminderConfig key `auth.otp`.
export interface OtpConfig {
  codeLength: number;
  ttlMinutes: number;
  maxAttempts: number;
  resendCooldownSeconds: number;
  maxSendsPerHourPerEmail: number;
  maxSendsPerHourPerIp: number;
}

export const DEFAULT_OTP_CONFIG: OtpConfig = {
  codeLength: 6,
  ttlMinutes: 10,
  maxAttempts: 5,
  resendCooldownSeconds: 60,
  maxSendsPerHourPerEmail: 5,
  maxSendsPerHourPerIp: 20,
};

export function normaliseEmail(input: string): string {
  return input.trim().toLowerCase();
}

/** Uniform numeric code, zero padded. `randomInt(n)` must return a uniform integer in [0, n). */
export function generateOtpCode(randomInt: (max: number) => number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += String(randomInt(10));
  return out;
}

export type OtpSendDecision =
  | { allowed: true }
  | { allowed: false; reason: "COOLDOWN" | "EMAIL_LIMIT" | "IP_LIMIT"; retryAfterSeconds: number };

export interface OtpSendContext {
  now: Date;
  lastSentAt: Date | null;
  sentLastHourForEmail: number;
  sentLastHourForIp: number;
}

export function decideOtpSend(ctx: OtpSendContext, cfg: OtpConfig): OtpSendDecision {
  if (ctx.lastSentAt) {
    const wait = cfg.resendCooldownSeconds - Math.floor((ctx.now.getTime() - ctx.lastSentAt.getTime()) / 1000);
    if (wait > 0) return { allowed: false, reason: "COOLDOWN", retryAfterSeconds: wait };
  }
  // Upper bound: the oldest send in the window may expire sooner.
  if (ctx.sentLastHourForEmail >= cfg.maxSendsPerHourPerEmail)
    return { allowed: false, reason: "EMAIL_LIMIT", retryAfterSeconds: 3600 };
  if (ctx.sentLastHourForIp >= cfg.maxSendsPerHourPerIp)
    return { allowed: false, reason: "IP_LIMIT", retryAfterSeconds: 3600 };
  return { allowed: true };
}

export type OtpUsability = "USABLE" | "CONSUMED" | "EXPIRED" | "TOO_MANY_ATTEMPTS";

export function checkOtpUsable(
  otp: { expiresAt: Date; consumedAt: Date | null; attempts: number },
  now: Date,
  cfg: OtpConfig,
): OtpUsability {
  if (otp.consumedAt) return "CONSUMED";
  if (otp.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  if (otp.attempts >= cfg.maxAttempts) return "TOO_MANY_ATTEMPTS";
  return "USABLE";
}

/** Returns canonical E.164 for a UK mobile (07xxx, +447xxx, 00447xxx), else null. Ownership check is Q1. */
export function normaliseUkMobile(input: string): string | null {
  let n = input.replace(/[\s\-().]/g, "");
  if (n.startsWith("00")) n = `+${n.slice(2)}`;
  if (n.startsWith("07")) n = `+44${n.slice(1)}`;
  // "+44 (0)7700 ..." writes the trunk zero in brackets; it is not part of the international number.
  if (n.startsWith("+440")) n = `+44${n.slice(4)}`;
  return /^\+447[1-57-9]\d{8}$/.test(n) ? n : null;
}
export * from "./return-target.js";
