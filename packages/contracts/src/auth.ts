import { z } from "zod";

// CH-03 passwordless email OTP. There is no password anywhere in these contracts.

export const OtpPurposeSchema = z.enum(["REGISTER", "SIGN_IN"]);
export type OtpPurposeValue = z.infer<typeof OtpPurposeSchema>;

export const ClientTypeSchema = z.enum(["WEB", "MOBILE_APP"]);
export type ClientTypeValue = z.infer<typeof ClientTypeSchema>;

export const OtpRequestSchema = z.object({
  email: z.string().trim().email().max(254),
  purpose: OtpPurposeSchema,
  clientType: ClientTypeSchema,
});
export type OtpRequest = z.infer<typeof OtpRequestSchema>;

/** Identical for every request, whether or not the email exists or a send was suppressed. */
export const OtpRequestResultSchema = z.object({
  accepted: z.literal(true),
  /** Hint for clients; not a signal of whether an email was sent. */
  resendAfterSeconds: z.number().int(),
});
export type OtpRequestResult = z.infer<typeof OtpRequestResultSchema>;

/** Registration details, required when verifying a REGISTER code. */
export const RegistrationDetailsSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  /** UK mobile; any common format, stored as E.164. Ownership verification is Q1. */
  mobile: z.string().trim().min(10).max(20),
  termsAccepted: z.literal(true),
  marketingOptIn: z.boolean(),
});
export type RegistrationDetails = z.infer<typeof RegistrationDetailsSchema>;

export const OtpAttestationSchema = z.object({
  platform: z.enum(["IOS", "ANDROID"]),
  token: z.string().min(1).max(8192),
});
export type OtpAttestation = z.infer<typeof OtpAttestationSchema>;

export const OtpVerifySchema = z.object({
  email: z.string().trim().email().max(254),
  code: z.string().regex(/^\d{4,10}$/),
  clientType: ClientTypeSchema,
  purpose: OtpPurposeSchema.default("SIGN_IN"),
  registration: RegistrationDetailsSchema.optional(),
  /** Supported but ignored while the `auth.attestation` flag is off (Q8). */
  attestation: OtpAttestationSchema.optional(),
});
export type OtpVerify = z.infer<typeof OtpVerifySchema>;

export const AuthResultSchema = z.object({
  contractorId: z.string(),
  sessionId: z.string(),
  /** WEB: double-submit CSRF token to echo in `x-csrf-token`. The session itself is an httpOnly cookie. */
  csrfToken: z.string().optional(),
  /** MOBILE_APP: bearer JWT (15 minutes) and rotating opaque refresh token. */
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresInSeconds: z.number().int().optional(),
});
export type AuthResult = z.infer<typeof AuthResultSchema>;

export const RefreshRequestSchema = z.object({ refreshToken: z.string().min(1).max(256) });
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const SessionItemSchema = z.object({
  id: z.string(),
  clientType: ClientTypeSchema,
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime().nullable().meta({ type: "string", nullable: true } as never),
  current: z.boolean(),
});
export type SessionItem = z.infer<typeof SessionItemSchema>;

export const SessionListSchema = z.object({ items: z.array(SessionItemSchema) });
export type SessionList = z.infer<typeof SessionListSchema>;

export const LogoutResultSchema = z.object({ ok: z.literal(true) });
export type LogoutResult = z.infer<typeof LogoutResultSchema>;
