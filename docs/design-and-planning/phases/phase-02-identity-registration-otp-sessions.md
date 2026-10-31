> Part of the [LOOP V33 Phased Implementation Plan](../LOOP_V33_Phased_Implementation_Plan.md) (§3 Phase detail). Source of truth is the master plan; this file is an extract.

### Phase 2 — Identity: registration, OTP, sessions
See §4.2–4.3 for reasoning.

- **Account creation** at the "Create account" step: email + mobile + name, with a hashed one-time code sent by email. No passwords anywhere (V33 is passwordless; this removes credential stuffing, reuse and reset-flow attacks).
- OTP: 6 digits, 10-minute life, single use, stored as hash, max 5 attempts per code, per-identifier and per-IP throttles, constant-time compare, uniform responses (no "this email exists").
- **Session model**: `Session(clientType, revokedAt)` with `clientType` an enum that starts as `WEB` only. Keep `Contractor.firstAppSignInAt` (already in the schema) untouched and unused.
  - Web: httpOnly, Secure, `SameSite=Lax` cookie + CSRF token; short idle timeout, absolute max lifetime.
  - **Deferred (mobile app, later):** JWT access token, rotating refresh token with reuse detection, `deviceId`. Not built now; the enum and session table are shaped so adding `APP` later is additive. See "Deferred: Contractor App".
- **Passwordless return and deep-link resume:** a reminder or email link carries a signed, single-purpose target (e.g. `confirm-availability`). If the contractor is not signed in, they pass OTP sign-in and are then returned to that exact action. Return targets are an allow-list of in-site routes, never an arbitrary URL (prevents open redirect).
- Sign-out and "sign out everywhere"; every sign-in writes an `AuditEvent` (not the code, not the token).
- Provisional contractors (pre-LIVE) can resume an in-progress registration from a different device only after OTP.
