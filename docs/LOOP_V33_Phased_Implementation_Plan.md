# LOOP V33 — Phased Implementation Plan

**Source of truth:** `requirements/LOOP_Web_V33_Consolidated_Frank_Handover_18_Oct_2026.pdf`
**Look, feel and screens:** `requirements/LOOP_Frank_Frontend_V33` (prototype only; its data is demo state, its copy and flows are the reference)
**Supersedes:** `docs/LOOP_Change_Phased_Approach.md` (old 13-phase plan, archived in `requirements/`). Phases 1–2 of that plan are partly reusable; nothing after them is continued.
**Status:** Draft for review by Frank (18 Oct 2026). No implementation has started.

---

## 1. Shape of the product

LOOP is **one platform with three front doors**, not three systems.

| Door | Who | Delivered in |
| --- | --- | --- |
| Website | Contractors: discover, upload CV, AI profile, register, confirm availability, go LIVE, log back in (My LOOP) | Gates 1–3 |
| Contractor App | Registered contractors: one-tap availability, profile updates, introductions (designed separately) | Gate 4 |
| Admin | Internal staff: network, profile/availability checks, reminders, introductions, Founding, comms | Gate 3 (read/ops) → Gate 4 (full) |

**Architectural consequence (the rule everything below follows):** all three call the same `/api/v1` API, which calls the same `packages/domain` rules against the same Postgres database. No client keeps its own copy of status, colour, freshness or eligibility. An availability change made in the app is a row update in the one database; the website and Admin read that row, so it is "immediate" by construction, not by sync. This is also the main security decision: **one enforcement point** for authorisation, validation and audit, instead of three to keep consistent.

Gates (from the PDF): **G1** web registration → **G2** operational My LOOP → **G3** freshness and growth → **G4** app and Admin → **G5** later commercial (flags off).

---

## 2. Phase map

Each phase is a shippable increment, small enough for one or two PRs per spec area, and ends with a security checkpoint (§4) and green `pnpm lint && pnpm typecheck && pnpm test` (plus `pnpm e2e` when a user journey changes).

| # | Phase | Gate | Outcome |
| --- | --- | --- | --- |
| 0 | Reconcile spec, code and docs | – | Repo matches V33; decisions recorded as ADRs |
| 1 | Security and platform baseline | G1 | Hardened API shell, rate limiting, logging redaction, CI security checks |
| 2 | Identity: registration, OTP, sessions | G1 | Email-OTP sign-up/sign-in; web cookie sessions and app-ready token sessions |
| 3 | Eligibility and CV intake | G1 | Eligibility declaration, safe file upload, malware scan, staged storage |
| 4 | AI profile extraction and review | G1 | Evidence-backed extraction, review/confirm screens, no invented data |
| 5 | Situation, availability and preferences | G1 | Employment situation, availability facts, preferences, derived colour |
| 6 | Consent, review and GO LIVE | G1 | Consent records, final review, LIVE state, Welcome screen. **Gate 1 complete** |
| 7 | My LOOP parity | G2 | Log back in, edit everything, CV versions, pause/visibility |
| 8 | Messaging engine and reminders | G3 | Email provider, templates, delivery log, cadence engine, one-touch confirm |
| 9 | Introductions and Founding | G3 | Referral link/QR, locked attribution, counters, transactional Founding |
| 10 | Admin (operations) | G3→G4 | RBAC, contractor search, availability queue, reminders config, audited actions |
| 11 | Contractor App support | G4 | Token auth, device registry, push, deep links, app-sign-in flag |
| 12 | Admin (full) and comms | G4 | Communications, Founding tracking, review queues |
| 13 | Commercial (flagged off) | G5 | Agency portal, payouts, profit participation, Radar — design only until enabled |

---

## 3. Phase detail

### Phase 0 — Reconcile spec, code and docs (small, do first)
Why first: the existing code and `CLAUDE.md` still encode decisions V33 reverses. Building on them would bake in drift.

- **Remove routine SMS from the MVP.** V33 is email plus push only. Retire the `sms` module path, `operationalSmsConsent` and the Twilio-based "Stay Current" flow; keep the module boundary empty rather than deleting history. Update `CLAUDE.md` (stack, glossary, "Operational SMS" security line, magic-link wording).
- **Re-align freshness thresholds** in `packages/domain/src/freshness`: Green 7d, Red 30d, Blue 60d, Orange prompts at 28/14/7 days before start, end-date follow-ups at +3/+7 days, full profile review at 90d, CV suggestion at 180d, one referral nudge after 14 days. Make them **configuration with defaults**, editable in Admin later, never literals in jobs. Table-driven tests per rule (existing `TODO(spec): Q3` is closed here).
- **Clearance** becomes a Yes/No declaration (no vetting levels).
- **Registration identifiers:** capture email and mobile; decide uniqueness (see Open Question 3) before the Prisma schema moves.
- **ADRs** in `docs/adr/` for each decision in §4 so the "why" survives.
- Mark `docs/LOOP_Change_Phased_Approach.md` superseded (pointer at the top).

*Done when:* CLAUDE.md, domain constants and docs agree with the PDF; no code path sends routine SMS.

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
- **Session model**: `Session(clientType = WEB|APP, firstAppSignInAt, revokedAt, deviceId)`.
  - Web: httpOnly, Secure, `SameSite=Lax` cookie + CSRF token; short idle timeout, absolute max lifetime.
  - App: 15-minute JWT access token + rotating opaque refresh token stored as SHA-256 hash; **refresh-token reuse detection revokes the whole token family**.
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
- `ConsentRecord` per purpose (profile visibility, operational email, marketing, push later), each with wording version, timestamp, source, and withdrawal; no pre-ticked boxes; operational and marketing remain separate.
- Review screen shows exactly what will be visible; GO LIVE sets `live` only if required fields, eligibility and consent exist (domain function, not UI logic).
- Welcome screen, with the app/QR prompts gated by the go-live condition in Open Question 5.
- Playwright acceptance journey: CV → profile → register → availability → LIVE.

### Phase 7 — My LOOP parity (Gate 2)
- Log back in (OTP), view and edit every Gate 1 field, same validation as registration.
- **CV versions:** new upload creates a suggestion diff; contractor-confirmed fields are never silently overwritten. Old versions retained per retention rule; delete-my-CV works end to end.
- Pause/unpause visibility, withdraw profile, export my data, delete my account (through the `privacy` module; erasure job with audit tombstone).

### Phase 8 — Messaging engine and reminders (Gate 3)
- Provider adapter for email (Postmark or SES, Open Question 4) behind an interface; `Message` and `DeliveryLog` tables; bounce/complaint webhooks with signature verification feeding suppression.
- Templates versioned in code, reviewed like code. Merge fields are escaped.
- **Cadence engine** (pg-boss scheduled sweep with singleton key): reads contractors due under the configured thresholds, creates messages once (idempotency key = contractor + cadence + window), and respects consent and quiet hours.
- **One-touch confirm links:** signed, single-purpose, expiring, bound to one contractor and one action ("still available"), stored as hashes. A link can confirm only; it cannot reveal data or change anything else. Anything beyond "still the same" requires sign-in.
- Escalation per spec: follow-up, manual call task for Admin, then search suppression. Nothing changes colour to green on its own.

### Phase 9 — Introductions and Founding (Gate 3)
- Referral link and QR code per contractor; token is opaque and non-guessable, not the contractor ID or email.
- Attribution captured on arrival and **locked at registration** (cannot be reassigned later); self-referral, duplicate-identity and same-device clusters are flagged for review rather than silently counted.
- Founding qualification = 5 unique registered direct referrals while current; allocation by conditional counter update + insert in one transaction (B6). Concurrency test required.
- Public counters ("places left") come from a cached aggregate; they reveal counts only, never names.
- Rewards ledger stays "eligibility only" (£50 and profit participation not hard-coded, not payable). `payouts.live` stays off.

### Phase 10 — Admin, operations (Gate 3→4)
Prototype tabs: Overview, Contractors, Availability queue, Introductions & Founding, Communications, Settings.

- Separate Vite SPA, **separate auth realm** from contractors: staff accounts, OTP + a second factor (TOTP or passkey), short sessions, IP allow-list or SSO at the edge if feasible.
- RBAC roles (read-only, operator, admin); every endpoint declares required permission; deny by default.
- Contractor search and detail, availability queue, reminder-threshold editor (writes versioned config, audited), manual confirm "on behalf" (source = `ADMIN`, reason mandatory).
- **Every view of personal data and every change writes an `AuditEvent`**; audit log is append-only and not editable from the UI.

### Phase 11 — Contractor App support (Gate 4)
- Token auth endpoints from Phase 2 exercised by a real client; device registry (`DeviceToken`, platform, last seen, revocable).
- Push via APNs/FCM through the messaging adapter; payloads contain no personal data ("Please confirm your availability"), details load after the app authenticates.
- Deep links / universal links with an allow-list of routes; no arbitrary URL redirects.
- `firstAppSignIn` flag set server-side from the first `APP` session (drives the Gate 3 "download the app" nudge suppression).
- Contract tests: the generated OpenAPI client is the only contract; backward-compatible changes only inside `/api/v1`.
- Certificate pinning decision belongs to the app team (Open Question 7).

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
- **Email chosen over SMS for codes** because routine SMS is out of scope, SMS is susceptible to SIM-swap and costs money under abuse ("SMS pumping"). Mobile is collected as a contact attribute; verifying it is Open Question 3.
- OTP hardened as in Phase 2; uniform responses prevent account enumeration.
- **Admin has a separate auth realm and a second factor.** *Why:* the Admin compromise is the highest-impact event; sharing the contractor login path would let a contractor-grade phish become staff access.

### 4.3 Sessions and tokens
- Web: httpOnly Secure `SameSite=Lax` cookies + CSRF token. *Why:* JavaScript cannot read the cookie, so XSS cannot exfiltrate the session.
- App: short JWT + **rotating hashed refresh tokens with reuse detection**. *Why:* a stolen refresh token is detected the moment both the thief and the owner use it, and the family is killed.
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
- Penetration test before opening Gate 1 to the public, and again before Gate 4 (app + Admin).

### 4.11 Per-phase security checkpoint
Each phase's PR must answer: what personal data is new, who can read it, how is it audited, how can it be abused, how is it deleted. A short note goes in the PR and, for significant decisions, an ADR.

---

## 5. Cross-cutting engineering rules (unchanged from `CLAUDE.md` unless noted)
- Business rules only in `packages/domain`; clients never compute colour.
- Contracts in `packages/contracts`; run `pnpm api:generate` after endpoint changes; generated client committed.
- One Prisma migration per change; never edit applied migrations; money in integer pence.
- Explicit `@Inject()` on all Nest dependencies.
- Feature flags for anything commercial or agency-facing stay off.
- Update `CLAUDE.md` in Phase 0 (SMS, auth wording, cadences).

## 6. Reuse from the existing code
| Existing | Verdict |
| --- | --- |
| Auth module, Session model | Keep; extend with `clientType`, `firstAppSignIn`, OTP by email, reuse detection |
| Founding, referrals, rewards services | Keep; add locked attribution, link/QR, counters |
| `me` module, availability form | Keep; extend to full My LOOP |
| `deriveFreshness` | Keep shape; new thresholds, configurable |
| `sms` module, `operationalSmsConsent` | Retire (V33: no routine SMS) |
| `Contractor.phone` required + unique | Revisit (Open Question 3) |
| Web routes: `join`, `join/cv`, `my-loop` | Keep; add the missing V33 screens |

## 7. Open questions (need Frank / Richard)
1. **Cadence config:** confirm the 7/30/60 and 28/14/7 values are defaults editable in Admin, not fixed.
2. **CV file limits and retention:** max size, allowed types, how long unregistered uploads and superseded versions are kept.
3. **Mobile number:** required at registration? verified? unique? (Changes the `phone` constraint and the fraud model.)
4. **Providers:** LLM extraction provider (the PDF names "Jev"), email (Postmark vs SES), push; UK/EU processing and no-training terms.
5. **Go-live condition for QR/store links** and the app-download prompts.
6. **Legal:** privacy notice, consent wording, retention periods, Founding terms, DPIA sign-off.
7. **App team:** token lifetimes, certificate pinning, biometric unlock, deep-link scheme.
8. **Admin identity:** staff SSO vs local accounts, second-factor method, IP restrictions.
9. **Anonymous upload abuse:** accept quota-only protection initially, or add CAPTCHA from day one?
