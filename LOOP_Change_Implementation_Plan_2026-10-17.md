# LOOP Contractor MVP — Change Implementation Plan (17 October 2026)

**Audience:** coding agent working in the LOOP monorepo.
**Purpose:** implement the approved requirement changes that arrived after the original V2.0 handover.
**Baseline:** *LOOP Contractor MVP V2.0 Master Developer Handover* (11 Oct 2026), the *System Architecture and Build Plan* doc, and `CLAUDE.md`.
**New source:** `LOOP_Contractor_User_Journey_Frank_APPROVED_Reminders_Web_17_Oct_2026.pdf`. It contains the unaltered V2.0 pages plus five approved changes:

| Ref | Document | Date |
| --- | --- | --- |
| **E** | Screen 00 — UK Eligibility Check (inserted first page) | 15 Oct 2026 |
| **J** | Addendum: Jev AI, passwordless access, contractor app | 15 Oct 2026 |
| **R** | Amendment: Referral attribution | 15 Oct 2026 |
| **P** | Amendment: Profile & Living CV | 16 Oct 2026 |
| **M** | Contractor reminders & profile updates (supersedes earlier reminder and website-login addendum) | 17 Oct 2026 |

Section references such as `M§2` mean "document M, section 2". `B4` and similar refer to the original V2.0 handover.

---

## 0. How to use this plan

1. Read this whole file before writing code. Then read `CLAUDE.md` and the module you are changing.
2. **Precedence:** the newer document wins where documents conflict. The order is M > P > R > J > E > V2.0. Section 2 lists every rule that is now superseded. **Do not implement superseded rules.** If they already exist in code, remove or replace them.
3. Work through the work packages (WP) in section 5 in order, unless a dependency note says otherwise. Each WP ends with acceptance checks that must pass.
4. Anything listed in section 8 (Open questions) must **not** be guessed:
   - Implement it behind configuration or a feature flag.
   - Leave a `TODO(spec): Q<n>` comment that names the question.
   - Mention it in the PR description.
5. Keep PRs small: one WP, or part of one, per PR. Reference the change ID (e.g. `CH-07`) in the title.
6. If part of the baseline build plan has not been built yet, build it directly in its new form. Do not build the old version first and then refactor it.

---

## 1. Change register

| ID | Source | Change | Replaces / affects |
| --- | --- | --- | --- |
| CH-01 | E | New **Screen 00 UK Eligibility Check**, after "Join LOOP" and before CV upload. Two mandatory YES/NO questions: UK based, and right to work in the UK. A NO stops the journey with fixed copy. Enforced on the front end **and** the server. A NO must prevent CV upload, AI processing and account creation. The answers are self-declarations. | A1 journey order; A3 (CV upload is no longer the first step) |
| CH-02 | J§1 | **Jev AI** is the intended AI engine for CV-to-profile extraction now, and for matching and ranking later. Frank must establish whether Jev handles PDF/Word extraction itself or needs a document-extraction step first. The contractor-confirmation step is unchanged. | AI provider choice (the stack doc assumed a generic LLM API) |
| CH-03 | J§2, M§12 | **Passwordless email one-time-code (OTP) authentication** for registration and sign-in, on web and app. There are no passwords and no password screens. Frank sets code expiry, resend limits, rate limiting, abuse prevention and remembered app sessions. The mobile number stays mandatory. | Replaces the SMS OTP and magic-link login in the stack doc |
| CH-04 | J§3–4 | **Contractors complete the journey on the web, then move to the app.** The journey through to GO LIVE stays in a mobile-friendly browser. After GO LIVE comes a new **Welcome to LOOP / Get the App** screen: a QR code and store links on desktop, a device-specific button on mobile, and an emailed link as a fallback. The links must only appear once the app is published. Installing the app is not required to be LIVE. | A10/A11 post-activation destination |
| CH-05 | J§3, M§3, M§10, M§13 | The **contractor mobile app is now in scope.** Its focus is availability confirmation, profile updates, introductions, rewards, Founding progress, messages, push notifications and deep links. | The stack doc said mobile was "later" |
| CH-06 | J§5–6 | **Founding qualification gains a fourth condition: the first verified sign-in to the contractor app.** Clicking a download link or a reported install does not count. Store a `firstAppSignInAt` timestamp and show a distinct flag in Founding progress. The contractor-facing steps are Join LOOP → Introduce 5 → Get the App → Stay Current. Status remains permanent once awarded. | B6 qualification rules; A15 |
| CH-07 | R | **Referral attribution is confirmed by the contractor at registration.** Ask "Did someone introduce you to LOOP?". A referral link preselects an introducer, which the contractor confirms or corrects. Verbal introductions are found through a privacy-safe member search. The confirmed choice wins over the link. The record is audited and **locked at registration**; only an audited admin process can correct it afterwards. Unmatched names are kept as an unverified recommendation with no credit. | B5 (link attribution was automatic and final); A6 "captured automatically" |
| CH-08 | P§1 | Optional **LinkedIn URL** on Profile Review and in Edit Profile. AI may suggest it only if the URL appears explicitly in the CV. No LinkedIn login or scraping. Not visible to recruiters before identity-reveal rules are agreed. | Profile data |
| CH-09 | P§2 | Optional **profile photo**: JPG, PNG or WebP, with a 3 MB prototype limit. The contractor can preview, replace and remove it. The default avatar is the LOOP logo. It appears in the profile, My LOOP and the app. It is never required. | Profile data, storage |
| CH-10 | P§4A, M§3–4 | **One-step contract end-date edits** (extension, early finish). When the end date is reached, ask for the actual status. **Never auto-mark Available Now.** | A11 editing; B3 rule reinforced |
| CH-11 | P§4B, M§7 | **Add latest assignment** without a CV: client or company, verbatim original title, dates, responsibilities, technologies and skills. AI may polish the wording; the contractor approves the final record. **Smart prompts** offer this when an assignment starts or finishes. | Work history |
| CH-12 | P§4C, M§6 | **Replacement CV with review-before-apply.** AI compares the new CV against the structured profile and proposes changes, which apply only after contractor approval. **Earlier CV versions are kept.** A CV review suggestion is sent every 180 days; replacing the CV is optional and never required to stay visible. | A5 re-upload behaviour (now specified in full) |
| CH-13 | P§4D, M§5 | **Confirm profile is current**: a one-click confirmation that stores and shows a **Last verified** date. There is a combined **profile review every 90 days**. Its timer resets **only** when the contractor explicitly confirms the whole profile, not after a minor edit or a CV upload. | New |
| CH-14 | M§2 | **New availability status definitions and reminder cadence** (section 3.1). Green only on explicit confirmation, every 7 days. Orange means contracting with an end date within 28 days, with prompts at 28, 14 and 7 days. Red means the end date is more than 28 days away, every 30 days. Blue every 60 days. On the end date, ask, then follow up after 3 and 7 days. | **Replaces A8 and B4 cadences** (14 days, 3 months then every 4 weeks, 12 weeks, the proposed 8 weeks) and the B3 orange definition |
| CH-15 | M§2, M§8 | **Status and freshness are separate.** Freshness states are Current, Needs Confirmation and Unconfirmed/Stale, with thresholds per status that are **configurable**. Staleness may lower ranking or visibility. Do not overwrite employment circumstances just to signal staleness. | B2/B3 grey handling; B4 "grey after 3 months" |
| CH-16 | M§10 | **Notification channels:** app push (preferred once the app exists, with deep links), email (essential, with a secure direct link), and **My LOOP Messages** (in-app inbox). **SMS is not used for routine MVP reminders.** Safeguards: no duplicates across channels, combine prompts, cancel obsolete follow-ups, no late-night sends, record deliveries and responses, and manageable non-essential preferences. | **Replaces A12 / B4 "SMS is the primary method"**; replaces the SMS one-tap flow |
| CH-17 | M§9 | **Introductions and Founding communications:** welcome at registration; **one** nudge after 14 days with no introductions; occasional progress updates for 1–4 introductions; congratulations at 5; Founding confirmation; reward-payable notice. | New |
| CH-18 | M§11 | **Admin reminder controls:** change intervals without a deployment, pause automated reminders, see totals of current, overdue and unconfirmed contractors, view delivery and response history, and send individual or group messages. **Rules-based scheduling, not an AI engine.** | B11 admin scope |
| CH-19 | M§3, M§12 | **Availability-first UX:** opening the app shows the current status and last-confirmed date with two actions, **STILL CORRECT** and **UPDATE AVAILABILITY**. Updates never require a CV. **Website login with full profile editing** has the same capabilities as the app, on the same account and data. | A11/A12 UX |

---

## 2. Superseded rules — remove or do not build

| Old rule (source) | Status | New rule |
| --- | --- | --- |
| CV upload is the first journey step (A1, A3) | Superseded | Screen 00 eligibility comes first (CH-01) |
| SMS is the primary method for keeping availability accurate (A12, B4) | Superseded | Push, email and in-app Messages; no routine SMS (CH-16) |
| Signed SMS one-tap links and SMS keyword replies (stack doc) | Remove from the MVP | One-tap confirmation by push deep link, email link, the app and the web (CH-19) |
| Available Now reconfirmed every 14 days (A8, B4, C2) | Superseded | Every 7 days, with no 3-day follow-up (CH-14) |
| Orange = confirmed start within 28 days; reconfirm on entering the window and on the date (A8, B3, B4) | Superseded | Orange = contracting with end date ≤ 28 days; prompts at 28, 14 and 7 days (CH-14). See Q2 for non-contractors |
| Red reminders from 3 months before end, then every 4 weeks (A8, B4) | Superseded | Every 30 days while the end date is > 28 days away (CH-14) |
| Blue every 12 weeks (A8, B4) | Superseded | Every 60 days (CH-14) |
| "Not working, available later: every 8 weeks" (B4, proposed) | Withdrawn | Not covered by M. See Q2 |
| Grey after 3 months without confirmation for non-contractors (B4) | Superseded | Configurable freshness thresholds per status (CH-15) |
| Login by SMS OTP or email magic link (stack doc) | Remove | Email OTP only (CH-03) |
| Referral link attribution is automatic and final (A6, B5) | Superseded | Contractor-confirmed attribution, locked at registration (CH-07) |
| My LOOP web dashboard as the main post-activation destination (A10, A11) | Changed | Get the App screen after GO LIVE; the app is the main ongoing surface, and the web keeps full editing (CH-04, CH-19) |
| Hard-coded reminder intervals in `packages/domain` | Superseded | Intervals come from admin-editable configuration (CH-18) |
| C2: "Available Now confirmation → next check 14 days later" | Replaced | Next check 7 days later |
| C2: "SMS disabled → routine availability texts suppressed" | Obsolete | Replaced by channel and preference checks (section 7) |

Everything else in V2.0 still stands. That includes rewards, verification, umbrella administration, profit-sharing records, the 50,000 cap, transactional allocation, audit, and the rule that the end date never turns a contractor green.

---

## 3. Domain rules (implement in `packages/domain`)

All intervals below are **defaults** read from configuration (section 4.3). They are never constants in code.

### 3.1 Availability status derivation

Input: the confirmed facts (employment situation, explicit immediate-availability confirmation, expected contract end date, availability date, notice period) and `today` in Europe/London.

| Condition | Underlying status | Display |
| --- | --- | --- |
| Permanently employed, open to contracting | `PERMANENT` | Blue suitcase (always, whatever the notice length) |
| The contractor has **explicitly confirmed** immediate availability | `AVAILABLE_NOW` | Lime green |
| Contracting, end date in 1–28 days | `ENDING_SOON` | Orange, with the end date |
| Contracting, end date > 28 days away | `IN_CONTRACT` | Red, with the end date |
| Contracting, end date reached or passed, status not yet confirmed | `END_DATE_REACHED` | Grey (pending confirmation). **Never** green |
| Not working, with a future start date | `TODO(spec): Q2` | Provisional: orange if ≤ 28 days, red if > 28 days (original B3 mapping), behind config |
| Nothing confirmed | `UNCONFIRMED` | Grey |

- Green is reachable **only** through an explicit confirmation event (`source = contractor`). No date arithmetic may produce green.
- Colour is derived. It is never stored as the source of truth and never chosen by hand.

### 3.2 Freshness (separate from status)

- `freshnessState ∈ { CURRENT, NEEDS_CONFIRMATION, UNCONFIRMED }` is computed from `lastConfirmedAt`, the underlying status, and the configured thresholds **for that status**.
- Freshness never changes the employment situation or the underlying status.
- Display rule: when freshness is `UNCONFIRMED`, the UI shows grey ("Availability unknown"). The underlying status is kept and shown to admins. *(Interpretation; see Q4.)*
- Effects on search ranking and visibility go behind the flag `freshness.visibilityEffects`, **off** until the thresholds are confirmed (Q3).
- Earned Founding status is never affected by freshness.

### 3.3 Reminder schedule rules (rules-based, not AI)

| Rule key | Default | Trigger and behaviour |
| --- | --- | --- |
| `availableNow.intervalDays` | 7 | Repeats every 7 days from the last confirmation. **No** extra 3-day follow-up. Continues until the status changes. A confirmation resets the timer. |
| `contractEnd.promptDaysBefore` | [28, 14, 7] | One prompt at each offset before the expected end date. An end-date change cancels and reschedules them. |
| `contractEnd.onEndDate` | true | Ask whether the assignment finished, was extended, or a new one started. |
| `contractEnd.followUpDaysAfter` | [3, 7] | Follow-ups after the end date if unanswered. A response cancels the rest. |
| `inContract.intervalDays` | 30 | While the end date is > 28 days away. |
| `permanent.intervalDays` | 60 | |
| `profileReview.intervalDays` | 90 | One **combined** review. Resets **only** on explicit whole-profile confirmation. |
| `cvReview.intervalDays` | 180 | "Is your CV still up to date?" Optional action. *(Start point: Q9.)* |
| `introductions.nudgeAfterDays` | 14 | **One** nudge if there are 0 successful introductions; never repeated. |
| `introductions.progressUpdates` | occasional | Sent when a new successful introduction (1–4) occurs, throttled by `introductions.progressMinGapDays` (Q10). |
| Event: 5 successful introductions | — | Congratulations and next steps (once). |
| Event: Founding awarded | — | Confirmation (once). |
| Event: reward payable | — | Notification. |
| Event: assignment started or finished | — | Smart prompt: "Add latest assignment / Not now". |

General rules:

- A status change cancels every pending reminder that no longer applies (acceptance check M-3).
- A one-tap confirmation records `{timestamp, source, channel}` and resets the timer for **that** reminder type only.
- `profileReview` does not reset on field edits, CV upload or availability confirmation.
- A global switch `reminders.paused` stops all automated sends. Scheduling continues, but sends are held.

### 3.4 Founding eligibility (updated)

A contractor qualifies when **all** of these are true:

1. Availability is current (freshness `CURRENT`; see Q5).
2. They have ≥ 5 unique, successfully registered direct introductions whose attribution has been **confirmed and locked**.
3. `firstAppSignInAt` is set from a **verified** app sign-in (section 5, WP10).
4. Fewer than 50,000 contractors have already qualified. Allocation stays transactional (unchanged).

Re-run the eligibility check on: a registration completing with a confirmed introducer; an availability confirmation; the first verified app sign-in; and a freshness state change. Never award a place before every condition holds. An award is permanent: uninstalling the app or the profile going stale does not revoke it.

---

## 4. Architecture deltas

### 4.1 Stack changes

| Area | Before | After |
| --- | --- | --- |
| AI extraction | Generic LLM API behind the `extraction` module | `ExtractionProvider` interface with a **`JevAiProvider`** (primary, once WP4 confirms its capabilities). Keep the unpdf/mammoth text-extraction step if Jev cannot take PDF/Word directly. Keep a dev/test fake provider. |
| Login | SMS OTP via Twilio Verify, plus email magic link | **Email OTP** issued and verified by LOOP (hashed codes in Postgres), sent through the email provider |
| Reminders | SMS (Twilio) | **Email** (MVP essential) + **push** (once the app ships) + **in-app Messages**. Twilio leaves the MVP critical path (see Q1 for mobile verification). |
| Email | Transactional only | Primary channel. Delivery and bounce webhooks are required (Postmark or SES with SNS). |
| Mobile | Later | **`apps/mobile` (Expo / React Native) is in scope.** Push via Expo Notifications (APNs and FCM). Universal and app links. |
| Images | — | `sharp` for photo validation, re-encoding and metadata stripping |
| QR codes | — | `qrcode` package for the Get the App screen |

### 4.2 Data model changes (Prisma)

Add or modify the following. Field names are guidance; follow the existing naming conventions.

```prisma
// CH-01
model EligibilityDeclaration {
  id          String   @id
  draftId     String   @unique
  ukBased     Boolean  // must be true to exist
  rightToWork Boolean  // must be true to exist
  declaredAt  DateTime
}
// Do NOT persist personal data for NO answers. Optionally increment an anonymous counter for reporting.

// CH-03
model EmailOtp {
  id          String   @id
  emailHash   String   // lookup key; do not store a plaintext email here
  purpose     OtpPurpose // REGISTER | SIGN_IN
  codeHash    String
  expiresAt   DateTime
  attempts    Int      @default(0)
  consumedAt  DateTime?
  createdAt   DateTime @default(now())
  clientType  ClientType // WEB | MOBILE_APP
}
// Session (existing): add clientType, appPlatform (IOS | ANDROID), attestationVerified Boolean

// CH-06
// Contractor: add firstAppSignInAt DateTime?, firstAppSignInSessionId String?

// CH-07 (replaces the simple Referral.referredById-only model)
model ReferralAttribution {
  id                    String   @id
  registrantId          String   @unique   // one direct introducer per registrant
  introducedAnswer      Boolean            // "Did someone introduce you?"
  linkCode              String?            // original link code, if any
  linkIntroducerId      String?
  source                AttributionSource  // LINK_CONFIRMED | LINK_CORRECTED | VERBAL_SEARCH | NONE | UNVERIFIED
  confirmedIntroducerId String?
  contractorConfirmedAt DateTime?
  lockedAt              DateTime           // = registration completion
  createdAt             DateTime @default(now())
}
model UnverifiedRecommendation {
  id            String   @id
  registrantId  String
  providedName  String
  providedEmail String?
  status        ReviewStatus // PENDING | MATCHED | REJECTED
  resolvedIntroducerId String?
  reviewedBy    String?
  reviewedAt    DateTime?
}
model AttributionCorrection { // admin-only, audited
  id String @id
  attributionId String
  fromIntroducerId String?
  toIntroducerId String?
  reason String
  actorId String
  createdAt DateTime @default(now())
}

// CH-08, CH-09, CH-13
// Contractor/Profile: add linkedinUrl String?, linkedinSource (CV_SUGGESTED | CONTRACTOR),
//   photoKey String?, photoUpdatedAt DateTime?, profileLastVerifiedAt DateTime?

// CH-11
// WorkHistory: add source (CV_AI | CONTRACTOR_MANUAL | ADMIN), verbatimTitle, responsibilities,
//   technologies String[], aiPolishedDraft String?, approvedAt DateTime?

// CH-12
model CvVersion {
  id          String   @id
  contractorId String
  cvFileId    String
  version     Int
  uploadedAt  DateTime
  isCurrent   Boolean
  @@unique([contractorId, version])
}
model ProfileChangeSuggestion {
  id           String @id
  contractorId String
  cvVersionId  String?
  field        String
  currentValue Json?
  suggestedValue Json
  evidence     String?
  status       SuggestionStatus // PENDING | ACCEPTED | REJECTED
  decidedAt    DateTime?
}

// CH-14, CH-15, CH-18
model ReminderConfig {      // admin-editable, versioned
  key       String   @id    // e.g. "availableNow.intervalDays"
  value     Json
  updatedBy String
  updatedAt DateTime
}
model ScheduledReminder {
  id           String   @id
  contractorId String
  type         ReminderType   // AVAILABLE_NOW | CONTRACT_END_PROMPT | CONTRACT_END_DAY | CONTRACT_END_FOLLOWUP | IN_CONTRACT | PERMANENT | PROFILE_REVIEW | CV_REVIEW | INTRO_NUDGE | INTRO_PROGRESS | SMART_ASSIGNMENT | ...
  dueAt        DateTime
  status       ReminderStatus // SCHEDULED | SENT | CANCELLED | ANSWERED | HELD
  cancelReason String?
  dedupeKey    String   @unique
  sentAt       DateTime?
  channel      Channel?        // PUSH | EMAIL | IN_APP
}
// Availability: replace any single "colour/status" column with: underlyingStatus (derived, cached),
//   freshnessState (derived, cached), lastConfirmedAt, confirmationSource, confirmationChannel

// CH-16
model Message {             // My LOOP Messages inbox
  id String @id
  contractorId String
  kind MessageKind          // ADMIN | REMINDER | SYSTEM
  title String
  body String
  actionUrl String?
  createdAt DateTime @default(now())
  readAt DateTime?
  sentBy String?
}
model DeliveryLog {         // replaces SMS MessageLog
  id String @id
  contractorId String
  reminderId String?
  messageId String?
  channel Channel
  provider String
  providerRef String?
  status DeliveryStatus     // QUEUED | SENT | DELIVERED | BOUNCED | FAILED | OPENED | ACTIONED
  at DateTime
}
model DeviceToken {
  id String @id
  contractorId String
  platform AppPlatform
  token String @unique
  createdAt DateTime @default(now())
  lastSeenAt DateTime
  revokedAt DateTime?
}
// CommunicationPreference: replace operationalSms/marketingSms with
//   pushEnabled, emailNonEssential, marketingEmail (operational reminders: see Q6)
```

Migration notes:

- If SMS-specific tables or columns exist, migrate them to `DeliveryLog` and the new preferences. Do not drop data without an explicit migration step.
- Backfill `ReferralAttribution` for any existing registrations: `source = LINK_CONFIRMED`, `lockedAt = registration time`, plus an audit note.

### 4.3 Configuration and flags

| Key | Purpose | Default |
| --- | --- | --- |
| `ReminderConfig.*` | All intervals in section 3.3 | As listed |
| `freshness.thresholds.<status>` | Days to `NEEDS_CONFIRMATION` and to `UNCONFIRMED` | **Placeholder; Q3** |
| `freshness.visibilityEffects` (flag) | Apply ranking and visibility penalties | off |
| `reminders.paused` (flag) | Global pause | off |
| `notifications.sendWindow` | Quiet hours (Europe/London) | Placeholder 08:00–20:00; **Q7** |
| `notifications.combineWindowMinutes` | Merge reminders due close together | Placeholder; Q7 |
| `app.storeLinksPublished` (flag) | Show real store links and the QR code | off |
| `app.iosStoreUrl`, `app.androidStoreUrl` | Real destinations | empty |
| `auth.otp.*` | `codeLength` 6, `ttlMinutes` 10, `maxAttempts` 5, `resendCooldownSeconds` 60, `maxSendsPerHourPerEmail` 5, per-IP limits | Proposed defaults; Frank may adjust |
| `auth.appAttestation.required` (flag) | Require App Attest / Play Integrity for a "verified" app sign-in | off until the app is ready; **Q8** |
| `profilePhoto.maxBytes` | Upload limit | 3 MB (prototype); **Q11** |

Admin must be able to edit `ReminderConfig` and the flags in the UI **without a deployment** (M acceptance check 7). Every change writes an `AuditEvent`.

### 4.4 API changes (`/api/v1`)

| Change | Endpoint(s) |
| --- | --- |
| CH-01 | `POST /eligibility` → `{ukBased, rightToWork}`. Returns `201 {draftToken}` only if both are true. Otherwise returns `422 ELIGIBILITY_NOT_MET {reason}` and creates **no** draft. Every draft, upload-URL, extraction and registration endpoint must check for a valid `EligibilityDeclaration` server-side. |
| CH-03 | `POST /auth/otp/request {email, purpose, clientType}` · `POST /auth/otp/verify {email, code, clientType, attestation?}`. Responses are identical whether or not the email exists. **Delete** `/auth/magic-link/*` and any SMS-OTP login endpoint. Keep `/auth/token/refresh`, `/auth/logout` and `/auth/sessions`. |
| CH-06 | First successful `otp/verify` with `clientType = MOBILE_APP` (plus attestation if the flag is on) sets `firstAppSignInAt` if it is empty, and enqueues a founding check. |
| CH-07 | `GET /members/search?q=` (draft token required, rate-limited, min. 3 characters for names, **exact match only** for emails) → `[{memberRef, displayName, hint, avatarUrl}]`, with no contact details. `GET /drafts/:id/introducer` (preselected from the link). `PUT /drafts/:id/introducer {introducedAnswer, memberRef? , unverified?: {name, email?}}`. Admin: `POST /admin/attributions/:id/corrections`, `GET/PATCH /admin/unverified-recommendations`. |
| CH-08/09 | `PUT /me/profile/linkedin` · `POST /me/photo/upload-url` · `POST /me/photo/confirm` · `DELETE /me/photo` (draft equivalents for Profile Review) |
| CH-10 | `PUT /me/employment/end-date` · `POST /me/availability/end-date-response {outcome: FINISHED \| EXTENDED \| NEW_CONTRACT, ...}` |
| CH-11 | `POST /me/assignments` · `POST /me/assignments/:id/polish` (AI suggestion only) · `POST /me/assignments/:id/approve` |
| CH-12 | `POST /me/cv` (creates a `CvVersion` and analysis) · `GET /me/profile/suggestions` · `POST /me/profile/suggestions/:id/{accept,reject}` · `GET /me/cv-versions` |
| CH-13 | `POST /me/profile/confirm-current` (sets `profileLastVerifiedAt`, resets `PROFILE_REVIEW`) |
| CH-16 | `GET /me/messages` · `POST /me/messages/:id/read` · `POST /me/devices` · `DELETE /me/devices/:id` · `GET /a/:token` (signed action link from email or push → confirm or open the update screen) · `POST /webhooks/email` (delivery and bounce) |
| CH-18 | `GET/PUT /admin/reminder-config` · `POST /admin/reminders/pause` · `GET /admin/reminders/summary` (current, overdue and unconfirmed totals) · `GET /admin/contractors/:id/deliveries` · `POST /admin/messages` (individual or group) |
| CH-19 | `POST /me/availability/confirm` (Still Correct) remains. It must return the new status, the last-confirmed date and the next reminder date. |
| Removed | `/webhooks/twilio/*` (unless Q1 keeps SMS verification), `/confirm/:token` for SMS (replaced by `/a/:token`) |

---

## 5. Work packages

Dependencies: WP1 → (WP2, WP7, WP8, WP11); WP2 → (WP3, WP6, WP10); WP4 → WP5; WP7 → WP10 (push).

### WP1 — Configuration and domain rule rewrite (CH-14, CH-15, CH-18 foundations)

1. Add the `ReminderConfig` model, a seed with the defaults from section 3.3, and a typed `ReminderConfigService`.
2. Rewrite `packages/domain/availability` to section 3.1, and add `packages/domain/freshness` to section 3.2. All functions take the config as a parameter.
3. Add `packages/domain/reminders`: `planReminders(state, config, today) → ReminderPlan[]` and `onEvent(event, state, config) → {schedule[], cancel[]}`. The events are confirmation, status change, end-date change, profile confirm, CV upload, assignment start/finish, introduction registered, founding awarded and reward payable.
4. Write table-driven Vitest tests for every row in section 3.1 and every rule in section 3.3. Include "end date passes → never AVAILABLE_NOW" and "Available Now ignored → next reminder +7 days, no +3".
5. Remove the old B4 constants and their tests.

**Acceptance:** the domain tests cover M acceptance checks 1–5; there are no hard-coded intervals outside the seed.

### WP2 — Passwordless email OTP (CH-03)

1. Build the `EmailOtp` model and service: generate the code with a CSPRNG, store an Argon2 or HMAC hash, compare in constant time, single use, expiry, attempt counting, resend cooldown, per-email and per-IP limits, and generic responses to prevent account enumeration.
2. Registration flow: eligible draft → profile review → registration form (name, email, mobile, terms, marketing opt-in) → email OTP verification → account created. Capture the mobile number and validate it as a UK number (see Q1 for verification).
3. Sign-in flow (web): email → code → cookie session. Sign-in flow (app): email → code → access token plus rotating refresh token ("remembered app session").
4. Remove the magic-link and SMS-OTP code paths, their UI, tests and config. Make sure no password field, route or column exists.
5. Email templates for registration and sign-in codes.

**Acceptance:** J§7 a–b. No password screen exists. The same account signs in on the web and the app (app side verified in WP10). Rate limits are covered by integration tests.

### WP3 — Screen 00 UK eligibility (CH-01)

1. Web: add a `/join` route with question 1, then question 2 (shown only after YES). Use the exact stop-page copy from document E. Add a route guard so that `/upload` and later routes are unreachable without a valid eligibility-backed draft token.
2. API: `POST /eligibility`. Server-side guards on every onboarding endpoint. A NO creates no draft, no file and no AI call.
3. Pre-fill the preferences "Right to work" declaration from the eligibility answer, read-only, with a note that it is a self-declaration.
4. Landing page "Join LOOP" / "Upload Your CV — Free" now goes to `/join`. Referral `?ref=` capture must survive Screen 00.

**Acceptance:** both questions are required; either NO stops the journey with the correct copy; direct API calls without a declaration are rejected; the referral code is preserved.

### WP4 — Jev AI extraction provider (CH-02)

1. **Spike (time-boxed; the output is a short ADR in `docs/adr/`):**
   - the Jev AI API and its authentication;
   - whether it parses PDF/Word directly;
   - structured-output support;
   - per-field evidence and confidence;
   - limits, pricing and latency;
   - data processing location and a DPA (UK GDPR);
   - whether it suits future matching and ranking.
2. Define `ExtractionProvider` in the `extraction` module: `extractProfile(input: {text?: string; file?: FileRef}) → ExtractionResult`, plus `polishAssignmentText(...)` and `compareCvToProfile(...)` (used by WP5).
3. Implement `JevAiProvider` according to the ADR. Keep the document-text step (unpdf/mammoth) if Jev needs text. Keep the anti-invention rules: evidence for every field, drop unsupported fields, record confidence.
4. Keep a `FakeExtractionProvider` for tests and local development. Choose the provider by configuration.

**Acceptance:** the extraction contract tests pass with the fake provider; the Jev provider passes the same contract against a sandbox; no field without evidence reaches the verify screen. *(If Jev access is not yet available, ship the interface and fake provider, and mark `TODO(spec): Q12`.)*

### WP5 — Profile and Living CV (CH-08, CH-09, CH-10, CH-11, CH-12, CH-13)

1. **LinkedIn:**
   - Add an optional field on Profile Review and Edit Profile.
   - Validate it as an `https://(www.)linkedin.com/in/...` URL.
   - AI may suggest it only if the URL appears explicitly in the CV text (`source = CV_SUGGESTED`); the contractor confirms or edits it.
   - Never include it in any agency-facing output (Q13).
2. **Photo:**
   - Presigned upload to quarantine.
   - Check magic bytes for JPG, PNG or WebP only, and enforce `maxBytes`.
   - Malware scan.
   - Re-encode with `sharp` to WebP, strip EXIF and GPS data, and generate the sizes needed.
   - Preview, replace and remove.
   - Default avatar is the existing LOOP logo asset.
   - Show it in the web profile, My LOOP and the app.
3. **End date:** one-step edit. End-date-reached flow (finished, extended or new contract) wired to the domain events. Never green without an explicit confirmation.
4. **Latest assignment:**
   - Form fields: client or company, verbatim title, start and end dates, responsibilities, technologies and skills.
   - Optional AI polish, shown as a suggestion.
   - The contractor approves before saving.
   - No CV needed.
5. **Replacement CV:**
   - Each upload creates a new `CvVersion`; all earlier versions are retained.
   - Run `compareCvToProfile` and store the results as `ProfileChangeSuggestion` rows.
   - Show a review-before-apply screen. Nothing changes without acceptance.
   - Uploading does **not** reset the profile-review timer.
6. **Confirm profile current:**
   - A one-click whole-profile confirmation.
   - Show the Last verified date on web and app.
   - This is the only action that resets the 90-day review timer.
7. Add an `AuditEvent` for every accepted suggestion, approved assignment, photo change and LinkedIn change.

**Acceptance (P checks):** optional LinkedIn and photo never block joining; the logo shows when there is no photo; the photo can be replaced and removed; a CV update shows a review step before applying; a latest assignment can be added without a CV; the end date can be changed; Last verified is recorded.

### WP6 — Referral attribution confirmation (CH-07)

1. Registration step:
   - Ask "Did someone introduce you to LOOP?" Yes / No.
   - If a link was used, show "You were invited by [name]. Is that correct?" Yes / No, someone else.
   - Otherwise, or on correction, show the member search.
   - If no match is found, offer "I can't find them" to capture the name and an optional email as an `UnverifiedRecommendation`.
2. Member search:
   - Searches only registered contractors.
   - Name search needs at least 3 characters; email search is **exact match only**.
   - Results never include an email address, phone number, or any contact detail.
   - Returns a display name plus a privacy-safe hint (Q14) and the avatar.
   - Rate-limited per draft and per IP.
   - Excludes the registrant's own identity: same email or mobile means no self-referral.
3. On registration completion:
   - Write `ReferralAttribution` with the link source, the confirmed introducer, the confirmation timestamp and `lockedAt`.
   - Contractor endpoints for changing it are removed after this point.
4. Enforce **one** introducer per registrant (unique key). Existing contractors can never be counted again. No multi-level credit.
5. Admin:
   - Unverified recommendation review queue: match or reject.
   - Audited correction process with a mandatory reason.
   - Credit applies only once a valid introducer is confirmed.
6. Founding counts and referral rewards read only locked, confirmed attributions.

**Acceptance (R checks 1–5):** a link preselects an introducer but can be corrected; a verbal recommendation is credited without a link; multiple invitations create only one credit; attribution is locked and audited; the search reveals no contact details.

### WP7 — Notification engine and channels (CH-15, CH-16, CH-17, CH-18)

1. **Reminder scheduler job** (pg-boss singleton, runs at least hourly):
   - Materialise due `ScheduledReminder` rows from `planReminders`.
   - Respect `reminders.paused` (mark them `HELD`) and the send window.
   - Combine reminders for the same contractor that fall within `combineWindowMinutes` into one message.
   - Use dedupe keys so the same reminder is never sent twice.
2. **Channel router:**
   - Push if the contractor has an active device token and push enabled; otherwise email.
   - Never both channels for the same reminder at the same time.
   - Admin and important communications always create a `Message` (inbox) entry.
   - SMS is **not** a routine channel.
3. **Email:**
   - Templates for each reminder type, with a signed, single-use, time-limited action link (`/a/:token`).
   - "Still correct" applies directly; "Update" opens the relevant screen.
   - If a session is required, use the email OTP flow.
   - Delivery and bounce webhooks feed `DeliveryLog`.
4. **Cancellation:** on any confirmation or status change, cancel obsolete `SCHEDULED` reminders (`cancelReason` recorded).
5. **Introductions and Founding comms** (section 3.3): welcome, single 14-day nudge, throttled progress, congratulations at 5, Founding confirmation, reward payable.
6. **Preferences:** contractors manage non-essential notifications (Q6 decides whether availability reminders can be switched off).
7. **Freshness sweep job** (daily): recompute `freshnessState` and the cached display status; when `visibilityEffects` is on, apply the ranking and visibility rules.
8. **Admin UI:**
   - Reminder-config editor with validation and an audit trail.
   - Global pause.
   - Summary tiles for current, overdue and unconfirmed contractors.
   - Per-contractor delivery and response history.
   - Individual and group message composer (groups by status, freshness, or filter).
   - The existing grey follow-up queue stays (Q4).

**Acceptance (M checks 1–3, 7):** one tap resets the correct timer; Available Now recurs every 7 days with no 3-day nudge; a status change cancels obsolete reminders; admin changes an interval and the new value takes effect without a deployment; there are no duplicate sends across channels; nothing is sent outside the send window.

### WP8 — Availability-first web UX and full web editing (CH-19, CH-10)

1. My LOOP (web) top section: the current colour status with label and icon, the last-confirmed date, and **STILL CORRECT** and **UPDATE AVAILABILITY** buttons.
2. The update flow covers each situation in M§3:
   - contract extended;
   - finishing early;
   - contract finished;
   - started a new contract;
   - permanently employed (notice period, earliest availability);
   - Available Now.
   None of these may require a CV or unnecessary fields.
3. Website login (WP2) gives full editing of:
   - profile, availability and end date, assignments, CV versions;
   - skills, rates, location, work preferences, IR35 and clearance;
   - photo and LinkedIn;
   - introductions, Founding progress and Messages.
4. Founding progress panel: the four steps (Join LOOP → Introduce 5 → Get the App → Stay Current), the valid-introduction count, and a distinct "First app sign-in verified" flag.

**Acceptance:** M check 6 (web and app edits appear in the same account, verified with WP10); M check 4 (an end date passing never turns the status green).

### WP9 — Welcome to LOOP / Get the App (CH-04)

1. After GO LIVE, route to `/welcome`.
2. **Desktop:** a QR code pointing to `/get-app` (a server redirect by user agent to the App Store or Play Store) plus both store badges.
3. **Mobile browser:** a single "Get the LOOP App" button for the detected platform.
4. An "Email me the link" fallback, sent through the email channel.
5. When `app.storeLinksPublished` is off, show "The LOOP app is coming soon" with the email option. **No** placeholder QR code or badges presented as live.
6. A "Continue to My LOOP" link on the web. The app is never required to be LIVE.

**Acceptance (J checks c–d):** GO LIVE completes without the app; the QR code and store links go to the right destinations once published; placeholders are never presented as live links.

### WP10 — Contractor mobile app (CH-05, CH-06, CH-16)

1. Scaffold `apps/mobile` (Expo, Expo Router, TypeScript) in the workspace. It reuses `packages/contracts`, `packages/api-client` (React Native-compatible fetcher) and `packages/domain` (display helpers only).
2. Sign-in by email OTP with `clientType = MOBILE_APP`. Store the refresh token in `expo-secure-store` and the access token in memory.
3. Home screen per M§3: status, last-confirmed date, **STILL CORRECT** and **UPDATE AVAILABILITY**.
4. Screens for profile updates (incl. end date, latest assignment, photo, LinkedIn, CV upload), introductions (share sheet: WhatsApp, SMS, LinkedIn, email), rewards, Founding progress and Messages.
5. Push:
   - Register the device token (`POST /me/devices`).
   - Each notification deep-links to the exact confirm or update screen.
   - Handle universal and app links. Serve `apple-app-site-association` and `assetlinks.json` from the API image.
6. First verified app sign-in:
   - On the first successful mobile OTP verification, the server sets `firstAppSignInAt`.
   - When `auth.appAttestation.required` is on, it does so only with a valid App Attest (iOS) or Play Integrity (Android) result (Q8).
   - The founding check then runs.
   - Clicking a download link or an install event alone never sets it.
7. In-app account deletion (App Store requirement) calls the existing erasure endpoint.
8. Builds and submissions through EAS (configuration only; publishing is a LOOP decision).

**Acceptance (J checks b, e, f; M check 6):** the same account works on the web and the app; a download alone does not satisfy Founding; the first verified app sign-in does; edits made in the app appear on the web.

### WP11 — Founding rule update (CH-06)

1. Update `packages/domain/founding` to section 3.4, and add the tests:
   - an app sign-in alone is insufficient;
   - five confirmed introductions plus current availability plus an app sign-in qualifies when places remain;
   - an award is permanent after uninstall or staleness.
2. Trigger eligibility checks on the new events.
3. The concurrency test (cap of 50,000) still passes.

**Acceptance (J checks e–h):** an app download alone does not satisfy qualification; the first verified app sign-in does; five valid introductions, current availability and available places are still required; awarded status stays permanent.

### WP12 — Admin additions (CH-07, CH-12, CH-18)

1. Unverified recommendations queue; attribution correction with reason and audit.
2. Contractor detail page shows:
   - CV versions;
   - pending suggestions;
   - Last verified date;
   - `firstAppSignInAt`;
   - underlying status and freshness state;
   - delivery history;
   - messages.
3. Reminder controls (WP7 step 8).
4. Reports: totals by status and freshness; reminder response rates.

### WP13 — Tests, docs and cleanup

1. Update the `apps/e2e` acceptance suite (section 7).
2. Update `CLAUDE.md`:
   - **Stack and integrations:** Jev AI, email OTP, push, Expo; Twilio removed from routine paths.
   - **Rules 4–5 and the glossary:** the new colours and cadences.
   - **New rules:**
     - Status and freshness are separate.
     - Profile review resets only on whole-profile confirmation.
     - Attribution is locked at registration.
     - There are no password fields anywhere.
     - Intervals come from `ReminderConfig`.
3. Update `.env.example` (remove the Twilio keys unless Q1 keeps them; add the Jev, push and store-URL keys).
4. Delete dead code: SMS reminder handlers, SMS one-tap links and magic-link auth.

---

## 6. Where this lands in the baseline build plan

| Baseline step | Additions from this plan |
| --- | --- |
| Step 0 Foundations | `ReminderConfig` model, email-OTP auth skeleton (no magic link or SMS OTP), `ExtractionProvider` interface, `apps/mobile` scaffold placeholder |
| Step 1 Core onboarding | WP3 (Screen 00), WP2 (email OTP registration), WP4 (Jev provider), WP5 steps 1–2 (LinkedIn and photo on Profile Review), WP6 (attribution step), WP9 (Get the App screen) |
| Step 2 Availability and freshness | WP1, WP7, WP8, WP5 steps 3 and 6 — **email, push and inbox instead of SMS** |
| Step 3 Network growth | WP6 admin parts, WP11, introductions comms (WP7 step 5) |
| Step 4 Rewards and verification | Reward-payable notification through the new channels; otherwise unchanged |
| Step 5 Future readiness | WP5 steps 4–5 (living CV); outbox events now also on CV versions and assignments |
| New: Mobile app | WP10 (can start once WP2 and WP7 are done) |
| Step 6 Hardening | Jev DPA and data residency, photo privacy review, notification deliverability (SPF, DKIM, DMARC), App Store and Play review |

---

## 7. Updated acceptance test matrix

| # | Test | Expected | Source |
| --- | --- | --- | --- |
| 1 | Visitor answers NO to UK based | Stopped with the UK-only copy; no draft, upload or AI call | E |
| 2 | Visitor answers NO to right to work | Stopped with the right-to-work copy; nothing created | E |
| 3 | API called without an eligibility declaration | Rejected | E |
| 4 | CV uploaded without an account (after eligibility) | AI preview generated | C2 |
| 5 | Contractor reviews the CV profile | Corrections saved on registration | C2 |
| 6 | No CV supplied | Registration cannot complete | C2 |
| 7 | No password screen exists anywhere | True | J a |
| 8 | Email OTP verifies the contractor on web and app | Same account | J b, M 6 |
| 9 | Joins via link, confirms the introducer | Introducer recorded and locked | R 1, 4 |
| 10 | Joins via link, selects someone else | The selected member is credited, not the link owner | R 1 |
| 11 | Verbal introduction, no link | Credited via search | R 2 |
| 12 | Several invitations to one registrant | One credit only | R 3 |
| 13 | Member search results | No contact details shown | R 5 |
| 14 | Unmatched introducer name | Unverified record; no credit | R |
| 15 | LinkedIn and photo skipped | Joining is not blocked; logo avatar shown | P |
| 16 | Photo replaced or removed | Works on web and app | P |
| 17 | Replacement CV uploaded | Review step before applying; old version kept | P, M§6 |
| 18 | Latest assignment added without a CV | Saved after approval | P |
| 19 | Explicitly confirmed Available Now | Lime green; next reminder +7 days | M 1, 2 |
| 20 | Available Now reminder ignored | Next reminder +7 days; no +3 nudge | M 2 |
| 21 | Contracting, end date in 20 days | Orange, end date visible; prompts at 14 and 7 days still scheduled | M§2 |
| 22 | Contracting, end date in 90 days | Red, end date visible; reminder every 30 days | M§2 |
| 23 | Permanent employee | Blue suitcase, notice and rate visible; reminder every 60 days | M§2, C2 |
| 24 | End date reached, no answer | Asked on the day; follow-ups +3 and +7 days; **never green** | M 4 |
| 25 | Status changed | Obsolete reminders cancelled | M 3 |
| 26 | Minor edit or CV upload only | 90-day review timer **not** reset | M 5 |
| 27 | Whole profile confirmed | Timer reset; Last verified updated | M 5, P |
| 28 | Admin changes an interval | Takes effect without a deployment | M 7 |
| 29 | Reminders paused globally | No automated sends | M§11 |
| 30 | Push and email both possible | Only one channel used per reminder | M§10 |
| 31 | GO LIVE without the app | Completes; Get the App screen shown | J c |
| 32 | Store links not yet published | No live-looking QR code or badges | J d |
| 33 | App downloaded but never signed in | Founding not satisfied | J e |
| 34 | All conditions met, including the first verified app sign-in | Founding awarded with a sequence number | J f, g |
| 35 | Founding contractor uninstalls the app or goes stale | Status stays | J h, M§8 |
| 36 | Two simultaneous qualifications at the cap | The cap is never exceeded | B6 |
| 37 | Three months of service verified | Eligible rewards created once | C2 |
| 38 | Agency verification missing | Reward cannot be approved automatically | C2 |
| 39 | Umbrella provider searched | Relevant contractor and end-date records returned | C2 |
| 40 | Profile suppressed | Not in agency searches | C2 |

---

## 8. Open questions (do not guess — implement behind config or flags)

| # | Question | Default while open |
| --- | --- | --- |
| Q1 | The mobile number stays mandatory (J§2), but SMS is no longer used for reminders or login. Must the mobile number still be **verified** by SMS code at registration? | Capture and validate the UK format only; SMS verification behind the flag `auth.mobileSmsVerification` (off) |
| Q2 | Contractors who are **not working with a future start date** are not covered by M§2. Which colour and reminder cadence apply? | Original B3 colour mapping; reminders at the configurable `futureStart.promptDaysBefore` (empty by default) |
| Q3 | Freshness thresholds (Needs Confirmation and Unconfirmed) per status are "to be confirmed before implementation" (M§8). | Placeholders in config; `freshness.visibilityEffects` off |
| Q4 | Does grey display whenever freshness is Unconfirmed, while keeping the underlying status? Do the original manual phone follow-up and search suppression (B4) still apply? | Grey on Unconfirmed; keep the admin follow-up queue and manual suppression |
| Q5 | Does "current availability" for Founding mean freshness `CURRENT` only, or also `NEEDS_CONFIRMATION`? | `CURRENT` only |
| Q6 | Can contractors switch off availability reminders (essential) or only non-essential notifications? | Availability reminders treated as essential; non-essential and marketing are toggles |
| Q7 | Quiet hours and the combine window | 08:00–20:00 Europe/London; 60 minutes (placeholders) |
| Q8 | Must a "verified" first app sign-in use App Attest / Play Integrity, or is an OTP sign-in from the app client enough? | Attestation supported, flag off |
| Q9 | When does the 180-day CV review clock start: the last CV upload, the last CV-review response, or registration? | The later of the last CV upload and the last CV-review response |
| Q10 | How often may introduction progress updates go out ("occasional, not repetitive")? | `introductions.progressMinGapDays` = 14 (placeholder) |
| Q11 | Production photo limits and storage requirements (P§2 says 3 MB is a prototype limit) | 3 MB |
| Q12 | Jev AI access, API capabilities, data location and DPA | Interface plus fake provider until confirmed |
| Q13 | Identity-reveal rules for recruiters (LinkedIn, photo, name) | Nothing identity-revealing in any agency-facing output |
| Q14 | Which "privacy-safe distinguishing information" may member search show? | Display name, avatar and town-level home area |
| Q15 | M supersedes an "earlier reminder and website-login addendum" that is not in this pack. Did it contain anything else still in force? | Ignore it; M governs |

---

## 9. Definition of done (for the whole change set)

- Every acceptance test in section 7 passes in CI.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e` pass.
- No superseded behaviour from section 2 remains reachable (check by search: `magic-link`, `twilio` in reminder paths, `14 days` / `12 weeks` constants, password fields).
- `ReminderConfig`, flags and admin controls change behaviour without a redeploy.
- Every open question in section 8 has a `TODO(spec): Qn` marker at its decision point and is listed in the final PR summary.
- `CLAUDE.md`, `.env.example` and the OpenAPI client have been regenerated and committed.
