# LOOP change set — phased approach

Source: `LOOP_Change_Implementation_Plan_2026-10-17.md` (precedence M > P > R > J > E > V2.0).
Rules for every phase: nothing is committed during this change set; new Prisma migrations only (never edit applied ones);
`pnpm api:generate` after API changes; `pnpm lint && pnpm typecheck && pnpm test` green at the end of each phase;
open questions Q1–Q15 are implemented behind config/flags with a `TODO(spec): Qn` marker; no new runtime dependency
(sharp, qrcode, expo, …) is added without being flagged; payouts/profit-sharing/agency flags stay off.

| Phase | Plan WP | Scope | Depends on |
| --- | --- | --- | --- |
| 1 | WP1 | `ReminderConfig` model + seed defaults; domain rewrite: availability (underlying status → colour), freshness, `reminders` (`planReminders`, `onEvent`); remove old B4 constants/tests; adapt API consumers | — |
| 2 | WP2 | Email OTP (EmailOtp, Session additions), remove magic-link/SMS-OTP | 1 |
| 3 | WP3 | Screen 00 `/join`, `POST /eligibility`, `EligibilityDeclaration`, server-side guards | 2 |
| 4 | WP4 | `ExtractionProvider` interface, `JevAiProvider`, `FakeExtractionProvider`, ADR (Q12) | — |
| 5 | WP6 | Referral attribution confirmation, member search, unverified recommendations | 2 |
| 6 | WP11 | Founding rule per §3.4 (+ `firstAppSignInAt`), transactional allocation kept | 1, 5 |
| 7 | WP7 | Notification engine: scheduler, channel router, email, DeliveryLog, Messages, freshness sweep | 1 |
| 8 | WP5 | Profile: LinkedIn, photo, assignments, CV versions, suggestions, confirm-current | 4 |
| 9 | WP8 | Availability-first web UX and full web editing | 1, 2, 7 |
| 10 | WP9 | Welcome / Get the App | 7 |
| 11 | WP10 | `apps/mobile` Expo scaffold, device tokens, app links | 2, 7 |
| 12 | WP12 | Admin additions | 5, 7 |
| 13 | WP13 | e2e matrix (§7), CLAUDE.md, `.env.example`, dead-code removal | all |

## Phase 1 detail (WP1)
1. Prisma: `ReminderConfig(key, value Json, updatedBy, updatedAt)`; migration `add_reminder_config`; seed §3.3 defaults + §4.3 flags (all off).
2. `packages/domain/availability`: `UnderlyingStatus` = PERMANENT | AVAILABLE_NOW | ENDING_SOON | IN_CONTRACT | END_DATE_REACHED | UNCONFIRMED (+ Q2 not-working future start, config-gated).
   Lime only from an explicit contractor confirmation; no date arithmetic yields green.
3. `packages/domain/freshness`: `CURRENT | NEEDS_CONFIRMATION | UNCONFIRMED` from `lastConfirmedAt` + status + configured thresholds (Q3 placeholders). Freshness never alters underlying status; UNCONFIRMED displays grey (Q4).
4. `packages/domain/reminders`: `planReminders(state, config, today)` and `onEvent(event, state, config)`.
5. Table-driven tests for every §3.1 row and §3.3 rule; delete old B4 constants.

## Phase 2 detail (WP2)
1. Prisma (migration `add_email_otp_and_session`): `EmailOtp` (HMAC email hash, HMAC code hash, purpose, expiry, attempts, consumedAt, ip hash), `Session` (WEB | MOBILE_APP, hashed refresh token, expiry, revokedAt), `Contractor.firstAppSignInAt` / `firstAppSignInSessionId` (columns only, CH-06). No password column anywhere.
2. `packages/domain/auth`: pure rules — `decideOtpSend` (cooldown, per-email and per-IP hourly limits), `checkOtpUsable` (single use, expiry, attempts), `generateOtpCode`, `normaliseEmail`, `normaliseUkMobile`; table-driven tests.
3. API `modules/auth`: `OtpService` (CSPRNG codes, hashed storage, constant-time compare, enumeration-safe responses), `SessionService` (30-day web cookie + CSRF; 15-min JWT + rotating hashed refresh token on app, 90 days), `AuthController`: `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/token/refresh`, `POST /auth/logout`, `GET /auth/sessions`. Registration account is created on verify; mobile verification is Q1.
4. Email templates for registration and sign-in codes; `EmailSender` abstraction (production provider is a TODO(spec)).
5. `AuthGuard` resolves Bearer or cookie sessions; non-production `LOOP_DEV_CONTRACTOR_ID` fallback retained. Magic-link and SMS-OTP (Twilio Verify) paths removed.
6. Open questions: Q1 (mobile ownership verification), Q8 (`auth.attestation` flag stays off), default OTP limits, CH-06 first-app-sign-in behaviour, operational SMS consent at registration.
