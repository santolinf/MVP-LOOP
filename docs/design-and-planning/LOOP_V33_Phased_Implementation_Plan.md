# LOOP V33 — Phased Implementation Plan

**Source of truth:** `requirements/LOOP_Web_V33_Consolidated_Frank_Handover_18_Oct_2026.pdf`
**Look, feel and screens:** `requirements/LOOP_Frank_Frontend_V33` (prototype only; its data is demo state, its copy and flows are the reference)
**Homepage and app-spec handover:** `requirements/LOOP_App_Homepage_Handover_V33` — `01_NEW_HOMEPAGE` (new marketing homepage, in scope) and `03_APP_DEVELOPER_SPECIFICATION.pdf` (in scope only for the shared backend, rules, Admin and web; its app UI parts are out of scope). `02_CONTRACTOR_APP` and every mobile-app deliverable are **deliberately ignored: the app is built later** (see §3 "Deferred: Contractor App").
**Supersedes:** the old 13-phase plan (archived in `requirements/`). Phases 1–2 of that plan are partly reusable; nothing after them is continued.
**Status:** Draft v2 for review by Frank (18 Oct 2026) — updated for the homepage and app-spec handover. No implementation has started.

**Precedence (from the handover README):** V33 website for registration UI; app spec for shared behaviour and cadences; legal programme rules for financial terms.

---

## 1. Shape of the product

LOOP is **one platform with three front doors**, not three systems.

| Door | Who | Delivered in |
| --- | --- | --- |
| Website | Contractors: discover, upload CV, AI profile, register, confirm availability, go LIVE, log back in (My LOOP) | Gates 1–3 |
| Contractor App | Registered contractors: one-tap availability, profile updates, introductions | **Deferred — built later.** The backend stays app-ready (shared API, rules, `Session.clientType`), but no app work is planned here |
| Admin | Internal staff: network, profile/availability checks, reminders, introductions, Founding, rewards, comms | Gate 3 (read/ops) → Gate 4 (full) |

The **marketing homepage** (new design, Phase H) is part of the Website door.

**Architectural consequence (the rule everything below follows):** all three call the same `/api/v1` API, which calls the same `packages/domain` rules against the same Postgres database. No client keeps its own copy of status, colour, freshness or eligibility. An availability change made in the app is a row update in the one database; the website and Admin read that row, so it is "immediate" by construction, not by sync. This is also the main security decision: **one enforcement point** for authorisation, validation and audit, instead of three to keep consistent.

Gates (from the PDF): **G1** web registration → **G2** operational My LOOP → **G3** freshness and growth → **G4** Admin (full) *(app deferred)* → **G5** later commercial (flags off).

---

## 2. Phase map

Each phase is a shippable increment, small enough for one or two PRs per spec area, and ends with a security checkpoint (§4) and green `pnpm lint && pnpm typecheck && pnpm test` (plus `pnpm e2e` when a user journey changes).

| # | Phase | Gate | Outcome |
| --- | --- | --- | --- |
| 0 | Reconcile spec, code and docs | – | Repo matches V33 + app spec; decisions recorded as ADRs |
| H | New marketing homepage | G1 (parallel) | New homepage live from the handover design, concept artefacts removed, referral CTA reflects sign-in state |
| 1 | Security and platform baseline | G1 | Hardened API shell, rate limiting, logging redaction, CI security checks |
| 2 | Identity: registration, OTP, sessions | G1 | Email-OTP sign-up/sign-in; web cookie sessions (app token sessions deferred) |
| 3 | Eligibility and CV intake | G1 | Eligibility declaration, safe file upload, malware scan, staged storage |
| 4 | AI profile extraction and review | G1 | Evidence-backed extraction, review/confirm screens, no invented data |
| 5 | Situation, availability and preferences | G1 | Employment situation, availability facts, preferences, derived colour |
| 6 | Consent, review and GO LIVE | G1 | Consent records, final review, LIVE state, Welcome screen. **Gate 1 complete** |
| 7 | My LOOP parity | G2 | Log back in, edit everything, CV versions, pause/visibility |
| 8 | Messaging engine, reminders and inbox | G3 | Email provider, templates, delivery log, cadence engine, one-touch confirm, LOOP messages vs notifications |
| 9 | Introductions, Founding and £50 rewards | G3 | Introducer at registration, locked attribution, lifetime count, transactional Founding, reward ledger |
| 10 | Admin (operations) | G3→G4 | RBAC, contractor search, availability queue, reminders config, introducer override, reward approval, audited actions |
| 11 | ~~Contractor App support~~ **Deferred** | later | Not planned now; seams kept (see "Deferred: Contractor App") |
| 12 | Admin (full) and comms | G4 | Communications, Founding tracking, review queues |
| 13 | Commercial (flagged off) | G5 | Agency portal, payouts, profit participation, Radar — design only until enabled |

---

## 3. Phase detail

### Phase 0 — Reconcile spec, code and docs (small, do first)
Why first: the existing code and `CLAUDE.md` still encode decisions V33 reverses. Building on them would bake in drift.

- **Remove routine SMS from the MVP.** Reminders are **email only** for now (the app spec's push channel is deferred with the app). Retire the `sms` module path, `operationalSmsConsent` and the Twilio-based "Stay Current" flow; keep the module boundary empty rather than deleting history. Update `CLAUDE.md` (stack, glossary, "Operational SMS" security line, magic-link wording, the stale "lime 14-day" glossary entry).
- **Re-align freshness thresholds** in `packages/domain/src/freshness` to the app spec (current code: AVAILABLE_NOW 7/14, ENDING_SOON 14/28, IN_CONTRACT 30/60, PERMANENT 60/120): 
  - Green: reconfirm every **7 days, continuous, with no automatic +3 follow-up** (see Open Question 10).
  - Red (in contract, end date more than 28 days away): every **30 days**.
  - Orange / Amber (end date within 28 days): prompts at **28, 14 and 7 days** before the end date, then an end-date outcome ask, then **+3 and +7 days** if unanswered.
  - Blue (permanent): every **60 days**.
  - Full profile review every **90 days**; optional CV review at **180 days**; one referral nudge at **14 days** if no introductions.
  - Make them **configuration with defaults**, editable in Admin later, never literals in jobs. Table-driven tests per rule (existing `TODO(spec): Q3` is closed here).
- **Status names:** Green "Available Now" (explicit confirmation only), Amber (end date ≤ 28 days), Red (end date > 28 days), Blue "Permanently Employed", Unconfirmed (grey). Colour stays derived in `packages/domain` and never auto-promotes to green.
- **Clearance** becomes a Yes/No declaration (no vetting levels).
- **Registration identifiers:** capture email and mobile; decide uniqueness (see Open Question 3) before the Prisma schema moves.
- **ADRs** in `docs/design-and-planning/adr/` for each decision in §4 so the "why" survives.

*Done when:* CLAUDE.md, domain constants and docs agree with the PDF and the app spec's shared rules; no code path sends routine SMS.

### Phase H — New marketing homepage (Gate 1, parallel track)
Source: `requirements/LOOP_App_Homepage_Handover_V33/01_NEW_HOMEPAGE/index.html` (single file, inline CSS and a small inline script, two logo PNGs). Per the handover README it is a **marketing design, not a replacement for the V33 registration journey**; every "Join" goes to the existing V33 registration (`/join`). It is independent of Phases 1–9 (static, prerendered), so it can ship early, but its referral CTA links to the Phase 9 introducer flow, so that part is wired last.

**What the concept contains** (in order): sticky header; hero ("One profile. Your availability. Your control." with "Stay current. Stay visible. Stay in the LOOP.") with an illustrative phone mock; `#why` Today vs With LOOP; `#how` three steps (Join / Go live / Stay current); `#radar` LOOP LIVE (launch) vs LOOP RADAR (Phase 2); `#rewards` Founding proposed programme plus the "Bill and Mary" £50 example; network-effect loop; `#join` call to action; footer.

**Repo vs concept (gap table)**

| Area | Current repo | Change |
| --- | --- | --- |
| Hero copy | "Your next contract. Your network. Your share." (`features/marketing/home-sections.tsx`) | Replace with the concept promise and supporting line |
| Sections | Hero, OverviewStrip, FoundingSection, ProfitSharingSection, IntroductionsSection, RadarSection, FinalCta | Rebuild as Hero, TodayVsLoop, HowItWorks, LiveAndRadar, Rewards, NetworkLoop, FinalCta; retire OverviewStrip and ProfitSharingSection (profit share is folded into Rewards as "proposed") |
| Header nav | `Why LOOP`, `Introduce IT Contractors`; no Join button; `TODO(spec)` for Log in | Anchors Why LOOP / How it works / LOOP Radar / Rewards; add Join LOOP button and Log in / My LOOP (session-aware) |
| Palette (`app.css` `@theme`) | V11: bg `#061526`, lime `#b9fb23`, cyan `#16baf0` | Concept uses bg `#090c13`, panel `#121824`, line `#283241`, lime `#c7fb49`, cyan `#55d9f5`. **Decision needed (Open Question 12):** re-theme tokens or keep V11. Either way map to tokens, never inline hex |
| Radar badge | "COMING IN STAGE 2" | "Phase 2"; Radar contracts earn no £50 |
| Referral CTA | Static link to `/introduce` | Session-aware, see below |
| Assets | `public/assets/loop-logo-header.png` and `loop-logo-final-with-tagline.png` already present | Compare with the handover copies; replace only if they differ. Add width/height to every `<img>` |
| Phone mock | – | Static illustrative component, `aria-hidden`, labelled as illustrative; no real data |

**Translation steps**
1. Port markup to React components in `features/marketing/home-sections.tsx` (split into one file per section once it passes ~250 lines), using existing primitives (`Section`, `Card`, `Eyebrow`, `Lead`, `Muted`, `ButtonLink`, `Standout`). Concept CSS becomes Tailwind utilities; the concept's `:root` variables map onto the `@theme` tokens (colour, `--radius-card`, `--container-page`). Keep the 800px breakpoint behaviour via the existing responsive utilities.
2. **Remove concept-only artefacts:** the "HOMEPAGE CONCEPT · NOT V33 REGISTRATION" badge, the footer "Homepage concept v2 · For review", the "Concept preview" `alert()` on the Join button and any "concept / for review" disclaimer copy. Keep the genuine programme disclaimer ("proposed", subject to legal terms).
3. **Do not ship the `?member=1` preview toggle.** The concept flips `.member-cta` text via a query string; production decides from the authenticated session (below).
4. **Referral CTA (per README):** logged-out visitors see "Join LOOP to Invite" linking to V33 registration; logged-in contractors see "Invite a Contractor" linking to My LOOP referral tools. The page stays **prerendered and cacheable**: it ships with the logged-out text and, after hydration, a small client hook reads the session (`/api/v1/me`, no cookie leakage into the static HTML) and swaps the label and target. No flash of wrong content for crawlers; no personalised HTML at the edge. A personal invite link or QR resolves to **V33 web registration**, never to an app store.
5. **Copy guardrails:** no implication of a populated agency network or guaranteed placements; "Founding Contractor" programme described as **proposed**, profit pools as proposed, collective (not per person), with no calculation or payout shown; £50 example states the 3-month agency-verified condition; AI mentioned lightly with disclosure deferred to registration. Strings live in the existing `COPY` module so Legal can review one file.
6. **Mobile-app references are removed:** no store badges, "download the app", or QR-to-app on the homepage. The phone mock is labelled illustrative; its "STILL CORRECT" pattern describes the web one-touch confirm until the app exists.
7. **Accessibility:** headings in order, landmark roles, visible `:focus-visible` (already in `app.css`), colour never the only signal (badge label + icon), contrast check of lime/cyan on the dark panels, `prefers-reduced-motion` respected for the loop animation, skip-link.
8. **Performance and SEO:** prerendered by React Router; logos sized and `fetchpriority` on the hero image; no web-font blocking (Inter with system fallback); `<title>`, meta description, OpenGraph and canonical set in the route `meta`.
9. **Tests:** Vitest/RTL for each section and the CTA swap (logged-out vs logged-in); Playwright smoke: homepage renders, header anchors scroll, "Join" lands on `/join`, signed-in CTA lands in My LOOP, no console errors, no "concept" strings in the built HTML (a grep test in CI).

*Security note:* the page adds no new personal-data surface. The only dynamic call is the existing authenticated `me` read, which is rate-limited and returns nothing to anonymous callers. Third-party scripts, fonts and trackers are **not** added; any analytics requires a consent decision (Open Question 6).

*Done when:* the new homepage is live on the prerendered `/` route, concept artefacts are gone, CTA state follows the session, and lint/typecheck/tests pass.

### Phase 1 — Security and platform baseline
Do this before any new personal-data feature, because retrofitting is how gaps happen.

- Security headers (helmet) and a strict CSP for the served web/admin bundles; CORS limited to known origins; HSTS at the edge.
- Request validation everywhere via Zod (`nestjs-zod`); reject unknown fields.
- Global rate limiting (per IP, per account, per device) with a Postgres-backed store so no Redis is needed.
- Logger redaction list: email, phone, tokens, CV text, OTP codes, names in free text. A test asserts a log line containing a seeded email is redacted.
- RFC 9457 errors that never leak stack traces or whether an account exists.
- CI: dependency audit, secret scanning, `lint`/`typecheck`, license check; Dependabot or equivalent.
- Config validation fails closed at boot; secrets only from env/Secrets Manager.

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

### Phase 3 — Eligibility and CV intake
- Eligibility declaration (right to work / UK-based / contractor intent as specified) stored as an immutable, timestamped record with wording version.
- **Upload pipeline:** presigned upload to S3-compatible storage (private bucket) → quarantine prefix → size/type/magic-byte checks (PDF, DOC/DOCX only) → ClamAV scan → only then promoted and made available to extraction. A failed scan deletes the object and tells the user generically.
- Files are never served from the app origin; downloads use short-lived presigned URLs, `Content-Disposition: attachment`, `nosniff`.
- Unauthenticated users can upload (V33 lets people start before registering). Mitigation: per-IP and global upload quotas, small size cap pre-registration, orphaned-upload TTL cleanup job (pg-boss), and the file is bound to a short-lived anonymous "draft" token, adopted by the account at registration.
- Max size and retention are Open Question 2.

### Phase 4 — AI profile extraction and review
Preserves the existing rules: AI never invents data, every field carries a source excerpt found verbatim in the CV text plus confidence; no evidence → dropped; output stored in `ExtractionRun`, separate from confirmed values.

- pg-boss job `cv.extract` (idempotent, retry-limited). Text extraction first (sandboxed, size/time bounded), then the LLM call.
- **Prompt-injection posture:** CV text is untrusted data. The model gets a fixed schema, tool-less, no network, output validated by Zod; any text in a CV that looks like instructions cannot change behaviour because output is only ever parsed into the schema and shown to the contractor for confirmation.
- Data minimisation to the provider: only the CV text, no email/phone/user ID. Provider must be UK/EU-resident with a no-training contract (Open Question 4).
- Screens: AI profile review, per-field confirm/edit, "we couldn't read this" fallbacks. Nothing becomes the contractor's profile until they confirm (A5).

### Phase 5 — Situation, availability and preferences
- Employment situation, availability facts (start/end dates in `Europe/London`), freshness and visibility stored as **separate dimensions** (B2). Colour derived by `packages/domain` and returned by the API; clients only render `<AvailabilityBadge>`.
- Never auto-green when an end date passes; permanent employees stay blue.
- Preferences (work type, rate band, location/remote, sectors, notice) with server-side enum validation.
- Each confirmation writes `lastConfirmedAt` + `confirmationSource` (`WEB|APP|EMAIL_LINK|ADMIN`) + a `ConfirmationEvent` row for history.

### Phase 6 — Consent, review and GO LIVE (Gate 1 complete)
- `ConsentRecord` per purpose (profile visibility, operational email, LOOP marketing, **separate optional partner-marketing consent**), each with wording version, timestamp, source, and withdrawal; no pre-ticked boxes. Service and security notices are never disabled by a marketing opt-out. (Push consent is added when the app is built.)
- **AI disclosure** shown at registration (plain wording that an AI reads the CV and the contractor confirms every field); lightly echoed in marketing copy.
- Review screen shows exactly what will be visible; GO LIVE sets `live` only if required fields, eligibility and consent exist (domain function, not UI logic).
- Welcome screen: web only. No app download or QR prompts now (mobile app deferred).
- Playwright acceptance journey: CV → profile → register → availability → LIVE.

### Phase 7 — My LOOP parity (Gate 2)
- Log back in (OTP), view and edit every Gate 1 field, same validation as registration.
- **CV versions:** replacing a CV stores a new `CvVersion`, re-runs extraction and compares it with the confirmed profile. Material changes (roles, dates, skills, clearance) need explicit contractor review before anything is overwritten; unreviewed changes never apply. Version history is preserved per retention rule; delete-my-CV works end to end. A periodic CV-review prompt (optional, 180 days) is a Phase 8 cadence.
- **Assignments without a CV:** contractors can add assignment history manually (client/supplying company, role, start and end dates, assignment ID where known). The same records feed the £50 reward evidence in Phase 9.
- **Profile fields added by the app spec:** security clearance (Yes/No), IR35 status, rates and work patterns, validated server-side with enums. Check which already exist in `schema.prisma` and add the rest in one migration.
- Pause/unpause visibility, withdraw profile, export my data, delete my account (through the `privacy` module; erasure job with audit tombstone).

### Phase 8 — Messaging engine and reminders (Gate 3)
- **Channel: email only for now** (no routine SMS; push is added with the app). Provider adapter for email (Postmark or SES, Open Question 4) behind an interface that can later take a push channel; `Message` and `DeliveryLog` tables; bounce/complaint webhooks with signature verification feeding suppression.
- Templates versioned in code, reviewed like code. Merge fields are escaped.
- **Cadence engine** (pg-boss scheduled sweep with singleton key), thresholds from Admin-editable versioned config, defaults from the app spec (Open Question 10 covers the Green follow-up conflict):
  - Green: reconfirm every 7 days, **no automatic +3 follow-up**.
  - Orange: prompts at 28, 14 and 7 days before the end date, then an end-date outcome ask, then +3 and +7 days if unanswered.
  - Red: 30 days. Blue: 60 days. Full profile review: 90 days. CV review: optional, 180 days. Referral nudge: 14 days if no introductions.
- **Reminder controls:** cap of one routine reminder per contractor per day (highest priority wins); no overnight sends (Europe/London quiet hours); suppress duplicates and stale reminders; **cancel obsolete follow-ups** when the contractor confirms or their situation changes. Idempotency key = contractor + cadence + window. Consent and suppression are checked at send time, not only at scheduling time.
- **One-touch confirm links:** signed, single-purpose, expiring, bound to one contractor and one action ("still available"), stored as hashes. A link can confirm only; it cannot reveal data or change anything else. Anything beyond "still the same" requires sign-in, then returns to the exact action (Phase 2 deep-link resume).
- **LOOP messages vs notifications:** two separate stores. *LOOP team messages* (one-way from LOOP, no recruiter chat) have read/unread state; *system notifications* (reminders, confirmations, security) are separate. Both shown in My LOOP.
- Escalation per spec: follow-up, manual call task for Admin, then search suppression. Nothing changes colour to green on its own.

### Phase 9 — Introductions and Founding (Gate 3)
- **Introducer at registration:** registration asks "who introduced you?". A link/QR may preselect the introducer, but the registrant confirms or corrects. Verbal introductions use a **privacy-safe existing-member lookup** (match returns a masked confirmation, never a searchable directory; rate-limited).
- Referral link and QR code per contractor; token is opaque and non-guessable, not the contractor ID or email. Links and QR codes go to **V33 web registration**, never to an app.
- Rules: one direct introducer; no self-referral, duplicates or multi-level chains. Attribution is **locked at completed registration**; corrections only by audited Admin override (Phase 10). Same-device and duplicate-identity clusters are flagged for review rather than silently counted.
- **Introduction count:** show the lifetime count. Five is a milestone, not a cap.
- **Founding** (first 50,000 qualifying UK IT contractors; a place is not reserved at registration start). Domain function checks: 5 distinct completed direct introductions, current confirmed availability, final eligibility conditions. The app spec adds **a verified first app sign-in**, which depends on the deferred app (Open Question 11). Status is permanent once earned. Allocation by conditional counter update + insert in one transaction (B6); concurrency test required.
- Public counters ("places left") come from a cached aggregate; counts only, never names. Pool wording (proposed 5% of annual net profit and 5% of qualifying-sale proceeds, collective not each) uses "proposed" and "qualified" language; **no calculation or payout until legal approval**.
- **£50 rewards ledger** (separate from Radar): the contractor earns £50 once, for their first qualifying LOOP placement; their direct introducer earns £50 once per such contractor (unlimited different introductions can each earn). Qualification needs 3 months of agency-verified service plus Admin approval. No downstream rewards, no repeat-placement rewards, Radar contracts excluded. Statuses: pending → under verification → approved → paid. Record assignment ID, supplying company, dates, evidence, approval and payout audit. Keep the existing `@@unique([type, beneficiaryId, qualifyingContractorId])` so rewards are created once. Approval is recorded now; **payment stays off** (`payouts.live`).

### Phase 10 — Admin, operations (Gate 3→4)
Prototype tabs: Overview, Contractors, Availability queue, Introductions & Founding, Communications, Settings.

- Separate Vite SPA, **separate auth realm** from contractors: staff accounts, OTP + a second factor (TOTP or passkey), short sessions, IP allow-list or SSO at the edge if feasible.
- RBAC roles (read-only, operator, admin); every endpoint declares required permission; deny by default.
- Contractor search and detail, availability queue, reminder-schedule editor (writes versioned config, audited), manual confirm "on behalf" (source = `ADMIN`, reason mandatory).
- **Introducer override** (change attribution; reason mandatory, before/after audited) and **reward review/approval queue** (evidence from Phase 9; approver cannot be the requester for amounts above any later threshold).
- Admin manages LOOP team message templates and notification templates (versioned).
- **Every view of personal data and every change writes an `AuditEvent`**; audit log is append-only and not editable from the UI.

### Phase 11 — Deferred: Contractor App (not scheduled)
The mobile app is out of scope for this plan and will be planned separately. Nothing here is built now. What we do keep, so adding it later is additive:
- `/api/v1` stays backward-compatible and the generated OpenAPI client remains the only contract.
- Business rules and colour stay server-side.
- `Session.clientType` enum and `Contractor.firstAppSignInAt` already exist.
- The messaging adapter (Phase 8) is channel-agnostic.

When the app is planned it will need: JWT + rotating refresh tokens with reuse detection, device registry, push (APNs/FCM, payloads free of personal data), universal links on an allow-list, the `firstAppSignIn` evidence for Founding (Open Question 11), push preferences, and a pen-test round covering the app.

### Phase 12 — Admin full and communications (Gate 4)
- Compose and send broadcast or targeted messages: audience preview, consent filter applied server-side, two-person approval for sends above a threshold, send-rate limits, full delivery log.
- Founding tracker, review queues for flagged referrals and profile changes.

### Phase 13 — Commercial, flagged off (Gate 5)
Agency portal, payouts (Wise), profit participation, Radar. Only schema seams and interfaces; flags `payouts.live`, `agency.access` stay off in code and seeds. A threat-model review is a precondition to enabling any of them, since they introduce a new user class (agencies), money movement and a new data-exposure surface.

---

## 4. Security — decisions and reasons

### 4.1 Threat model (what we are protecting against)
LOOP holds CVs, contact details and employment/availability data for UK contractors, and it will become a target list of in-demand IT people. Realistic threats, in priority order:
1. **Account takeover** via OTP abuse, SIM-swap, phishing or session theft.
2. **Bulk scraping or enumeration** of the contractor database (via search, referral links, error messages).
3. **Malicious upload** (malware, parser exploits, oversized files).
4. **Over-privileged internal access** (staff browsing data they need not see, or a compromised Admin account).
5. **Abuse of messaging** (spam, SMS/email pumping, forged one-touch links).
6. **Referral and Founding fraud** (fake accounts to claim a capped place or a reward).
7. **Privacy failures** (logging PII, unlawful retention, consent errors, data leaving the UK).
8. **Prompt injection / data leakage through the LLM.**

### 4.2 Authentication
- **Passwordless email OTP** (spec-aligned). *Why:* no passwords to leak, reuse or reset; the email inbox is the root of trust, which we must anyway rely on for recovery. *Trade-off:* inbox compromise equals account compromise, so sessions are revocable, sign-ins are audited and notified, and sensitive changes (email/mobile change, account deletion) require a fresh OTP.
- **Email chosen over SMS for codes** because routine SMS is out of scope, SMS is susceptible to SIM-swap and costs money under abuse ("SMS pumping"). Mobile is collected as a contact attribute only; verifying it is Open Question 3.
- OTP hardened as in Phase 2; uniform responses prevent account enumeration.
- **Admin has a separate auth realm and a second factor.** *Why:* the Admin compromise is the highest-impact event; sharing the contractor login path would let a contractor-grade phish become staff access.

### 4.3 Sessions and tokens
- Web: httpOnly Secure `SameSite=Lax` cookies + CSRF token. *Why:* JavaScript cannot read the cookie, so XSS cannot exfiltrate the session.
- App token auth (short JWT + rotating hashed refresh tokens with reuse detection) is **deferred** with the Contractor App (Phase 11). Web and Admin use cookie sessions only.
- Tokens, OTPs and one-touch links are stored as SHA-256 hashes only, so a database leak does not yield usable credentials.
- Authorisation checks are by **ownership in the service layer** (`contractorId` comes from the session, never from the request body or path) to prevent IDOR.

### 4.4 Data access and the "one platform" rule
- Single API, single rule set, single audit trail. Web/app/Admin differ only by *credential realm and permissions*, not by data path.
- Postgres roles: the app uses a least-privilege role (no DDL); migrations run under a separate role. Row-level checks stay in services; consider Postgres RLS for contractor-owned tables as a defence-in-depth step (decision in ADR, Phase 1).
- Consistency without sync jobs: because every client writes the same rows, an app update is visible on web and Admin on the next read. Search-only cached colour is recomputed in the same transaction as the confirmation write, so it cannot lag.

### 4.5 Uploads
- Quarantine → type/magic-byte check → ClamAV → promote. Private bucket, presigned short-lived URLs, no public ACLs, `nosniff`, download-only. *Why:* a CV is attacker-controlled input to document parsers and an LLM, so it is treated as hostile until proven otherwise.
- Text extraction runs bounded (time, memory, page count) and ideally in a separate worker process (`APP_ROLE=worker`) so a parser crash cannot take down the API.

### 4.6 AI and prompt injection
- Fixed schema, validated output, evidence excerpts must exist verbatim in the CV text, and a human (the contractor) confirms before anything is stored as their profile. The model has no tools, no network and no access to other users' data, so the worst a malicious CV can do is produce wrong suggestions for its own author.
- Minimise what is sent: CV text only. Provider region and retention settings are a contractual requirement (Open Question 4).

### 4.7 Privacy, consent and UK data residency
- Everything in AWS eu-west-2 (RDS, S3, Secrets Manager, logs). Email/push/LLM providers reviewed for UK/EU processing; a sub-processor register is maintained.
- Consent is a first-class record (purpose, wording version, time, source, withdrawal). Operational and marketing are separate; withdrawal takes effect on the next send.
- Never log CV content, emails, phones, tokens or OTPs (Phase 1 test enforces it). Backups encrypted; encryption at rest on RDS/S3; TLS 1.2+ everywhere.
- Subject rights (access, export, erasure, rectification) through the `privacy` module, with retention timers run as jobs.

### 4.8 Abuse resistance
- Rate limits on OTP, upload, search, referral-link resolution and any public counter endpoint; a CAPTCHA/Turnstile option is held in reserve for the anonymous upload step if abuse appears (decision deferred, flagged).
- Referral and Founding fraud: unique registered identity, locked attribution, anomaly flags, and **Founding awarded by the server inside a transaction**, never by the client. Rewards unique-keyed so duplicates are impossible.
- Idempotency keys on mutating endpoints so retries and double-taps are safe.

### 4.9 Admin controls and audit
- RBAC deny-by-default, least privilege, second factor, short sessions, mandatory reason on "on-behalf" actions, append-only `AuditEvent` (who, what, when, before/after; PII fields hashed or masked in the diff where not needed).
- Read access to personal data is itself audited, so a curious employee leaves a trail.

### 4.10 Supply chain and operations
- Lockfile pinned, dependency audit and secret scanning in CI, minimal Docker image, non-root user, no shell tools in production image, image scan.
- Secrets in Secrets Manager only; rotation documented. Separate environments and credentials for dev/staging/prod; no production data in lower environments.
- Webhooks (email provider, push, later Wise/Twilio-style) verify signatures and are replay-protected.
- Logging and alerting on auth anomalies (OTP failure spikes, refresh reuse, mass export, Admin off-hours access).
- Penetration test before opening Gate 1 to the public, and again before Gate 4 (Admin). A further round covers the app when it is planned.

### 4.11 Per-phase security checkpoint
Each phase's PR must answer: what personal data is new, who can read it, how is it audited, how can it be abused, how is it deleted. A short note goes in the PR and, for significant decisions, an ADR.

---

## 5. Cross-cutting engineering rules (unchanged from `CLAUDE.md` unless noted)
- Business rules only in `packages/domain`; clients never compute colour.
- Contracts in `packages/contracts`; run `pnpm api:generate` after endpoint changes; generated client committed.
- One Prisma migration per change; never edit applied migrations; money in integer pence.
- Explicit `@Inject()` on all Nest dependencies.
- Feature flags for anything commercial or agency-facing stay off.
- Update `CLAUDE.md` in Phase 0 (SMS, auth wording, new cadences and status names, mobile marked deferred).

## 6. Reuse from the existing code
| Existing | Verdict |
| --- | --- |
| Auth module, Session model | Keep; extend with `clientType`, OTP by email, deep-link resume; app refresh-token reuse detection deferred |
| `Referral`, `Reward` (`@@unique([type, beneficiaryId, qualifyingContractorId])`), `FoundingCounter` | Keep; add locked attribution, Admin override, introducer-at-registration, 3-month verified-service and approval gates |
| Contractor `marketingConsent` | Keep; add separate partner-marketing consent (Phase 6) |
| Contractor `firstAppSignInAt` | Keep unused as a seam; Founding condition deferred (Open Question 11) |
| `ExtractionRun` | Keep; basis for CV versions and material-change review |
| `DEFAULT_FRESHNESS_THRESHOLDS` (7/14, 14/28, 30/60, 60/120) | Replace with spec cadences (Green 7, Orange 28/14/7, Red 30, Blue 60, profile 90, CV 180), configurable |
| Homepage: `routes.ts`, `_index.tsx`, `home-sections.tsx`, `app.css` tokens, `site-header.tsx`, public assets | Rework in Phase H; keep primitives (`ButtonLink`, `Card`, `Section`, etc.) where they fit |
| Founding, referrals, rewards services | Keep; add locked attribution, link/QR, counters |
| `me` module, availability form | Keep; extend to full My LOOP |
| `deriveFreshness` | Keep shape; new thresholds, configurable |
| `sms` module, `operationalSmsConsent` | Retire (V33: no routine SMS) |
| `Contractor.phone` required + unique | Revisit (Open Question 3) |
| Web routes: `join`, `join/cv`, `my-loop` | Keep; add the missing V33 screens |

## 7. Open questions (need business input)
1. **Cadence config:** confirm the 7/30/60 and 28/14/7 values are defaults editable in Admin, not fixed.
2. **CV file limits and retention:** max size, allowed types, how long unregistered uploads and superseded versions are kept.
3. **Mobile number:** required at registration? verified? unique? (Changes the `phone` constraint and the fraud model.)
4. **Providers:** LLM extraction provider (the PDF names "Jev"), email (Postmark vs SES), push; UK/EU processing and no-training terms.
5. ~~Go-live condition for QR/store links and app-download prompts~~ — **deferred** with the app.
6. **Legal:** privacy notice, consent wording, retention periods, Founding terms, DPIA sign-off.
7. ~~App team: token lifetimes, certificate pinning, biometric unlock, deep-link scheme~~ — **deferred** with the app.
8. **Admin identity:** staff SSO vs local accounts, second-factor method, IP restrictions.
9. **Anonymous upload abuse:** accept quota-only protection initially, or add CAPTCHA from day one?
10. **Green follow-up conflict:** the app spec says Green has no automatic +3 follow-up; the older plan and V33 handover mention +3/+7 follow-ups. The plan applies +3/+7 to Orange only. Confirm.
11. **Founding "verified first app sign-in":** the app spec makes this a condition, but the app is deferred. The plan keeps `firstAppSignInAt` unused and treats the condition as deferred, so Founding is currently awarded without it. Confirm, or hold Founding awards until the app exists.
12. **Homepage palette:** the concept uses `#090c13` / lime `#c7fb49` / cyan `#55d9f5`; the repo uses V11 tokens (`#061526` / `#b9fb23` / `#16baf0`). Re-theme the whole web app, or apply the concept palette to the homepage only?
13. **Partner-marketing consent:** the spec requires a separate flag. Confirm the wording, default (off) and whether any partner sharing exists at launch.
14. **Reminder channel:** with no app, all reminders are email. Confirm no push or SMS fallback at launch, and the daily cap/quiet hours (one routine reminder per day, no overnight sends).
