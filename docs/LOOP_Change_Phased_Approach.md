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
