# LOOP MVP: System Architecture and Build Plan

Oct 15, 2026 · @Frank

## Summary

LOOP's MVP is one NestJS application, organised by business module, shipped as a single container image with PostgreSQL as both the system of record and the job queue.

This is the engineering companion to *LOOP Contractor MVP: Technology Stack and Implementation Plan*. That doc explains the technology choices; this one turns them into a system architecture, a repository layout, a data model, an API surface and a step-by-step build plan. Spec references (A1–A16, B1–B12, C1–C3) point to the V2.0 handover. A `CLAUDE.md` file for the repository root is delivered alongside this doc.

The decisions it builds on: REST + OpenAPI (not GraphQL), pg-boss (no Redis), one image with an `APP_ROLE` switch, managed PostgreSQL, cookie auth for web and bearer tokens for future mobile apps, and AWS in London as the default host.

## System architecture

A modular monolith: every client calls one versioned REST API, business modules own their own tables, and slow or scheduled work runs as pg-boss jobs inside the same process.

&#91;embedded content: logical architecture · 4 clients, 6 module groups, 3 data stores, 4 external services\]

The agency link is a signed, time-limited page for verifying three months of service; it is not the future agency portal.

### Components

| Component | Location | Responsibility |
| --- | --- | --- |
| Contractor web | `apps/web` | Prerendered landing page; onboarding journey (Screens 01–09); My LOOP, Stay Current, Introduce Contractors, Rewards, Founding progress. Calls the API only through generated hooks. |
| Admin portal | `apps/admin` | Contractor search and inspection, freshness and grey queues, CV/AI errors, SMS history, referrals, assignments, verification, reward approval, umbrella searches, flags (B11). |
| NestJS app | `apps/api` | REST API under `/api/v1` with OpenAPI; serves the web and admin bundles and `.well-known` files; runs jobs. `APP_ROLE=all\|api\|worker` decides which parts start. |
| Jobs | `apps/api/src/jobs` | pg-boss handlers: CV scan and extraction, SMS sends, daily freshness sweep, three-month milestones, payout dispatch, retention clean-up. |
| Domain rules | `packages/domain` | Pure functions for colour, freshness schedule, founding eligibility, reward eligibility and referral validity. No framework, no I/O. |
| PostgreSQL | managed (RDS) | System of record, pg-boss queue tables, audit log, outbox. |
| Object storage | S3 + KMS | CV files: quarantine bucket, then private bucket after malware scan; lifecycle rules for retention. |

### Business modules

| Module | Owns | Spec |
| --- | --- | --- |
| `auth` | OTP and magic-link login, sessions, access and refresh tokens, CSRF | A6, B12 |
| `onboarding` | Anonymous drafts, referral capture, CV upload initiation, draft-to-account conversion | A3, A6, B5 |
| `cv` | File validation, malware scan, text extraction (unpdf, mammoth) | A3 |
| `extraction` | LLM structured extraction with evidence and confidence, `ExtractionRun` records | A4 |
| `profile` | Professional profile, field provenance, CV re-upload suggestions | A5 |
| `employment` | Employment situation, contract end, notice period, availability facts | A7, A8 |
| `preferences` | Roles, locations, rates, IR35, right to work, clearance, umbrella provider | A9, B9 |
| `freshness` | Confirmation records, check schedules, grey transitions, follow-up queue, search suppression | A12, B3, B4 |
| `messaging` | SMS, email and (later) push behind one channel interface; Twilio webhooks; consent | A12, B12 |
| `referrals` | Referral codes, attribution, duplicate and self-referral checks | A13, B5 |
| `founding` | Qualification checks, transactional allocation, progress | A15, B6 |
| `assignments` | Assignments, verification requests, agency verification links | B7 |
| `rewards` | Reward ledger, eligibility, admin approval | A14, B7 |
| `payments` | Payout adapter (Wise), reconciliation; disabled by flag | B8 |
| `participation` | Founding status history and profit-sharing eligibility records (no percentages) | B10 |
| `admin` | Admin-only endpoints, search, queues, reporting | B11 |
| `flags`, `audit`, `privacy`, `health` | Feature flags, append-only audit, GDPR export and erasure, retention, health checks | B11, B12 |

### Key flows

**Onboarding to LIVE (first milestone)**

1. The landing page stores any `?ref=` code; the API creates an anonymous draft and returns a signed draft token.
2. The browser uploads the CV to a presigned quarantine URL; a job scans it, extracts text and calls the LLM.
3. The extraction result (fields, evidence, confidence) is stored in `ExtractionRun` and shown on the verify screen with uncertain fields highlighted.
4. The contractor corrects and confirms; registration verifies the mobile by OTP and converts the draft, keeping the referral.
5. Employment, availability and preferences are captured; go LIVE records activation and freshness timestamps, issues the referral link and starts founding tracking.

**SMS reconfirmation (Stay Current)**

1. The daily sweep asks `packages/domain` which contractors are due a check, and enqueues sends.
2. Each SMS carries a signed one-tap link and accepts keyword replies; Twilio webhooks record delivery and replies.
3. A confirmation updates `lastConfirmedAt` and the source, then schedules the next check; a change routes to My LOOP.
4. Missed checks move the profile to grey and into the admin follow-up queue; unsuccessful phone contact leads to search suppression.

**Founding qualification**

1. Any event that could qualify a contractor (a referral completes registration, availability confirmed) enqueues an eligibility check.
2. If current and holding five unique registered referrals, one transaction increments the counter only while it is below 50,000 and inserts the qualification with its sequence number.

**Agency verification to reward**

1. Admin records an assignment (contractor, agency, start date, introduction ID).
2. At three months a job creates a verification request and emails a signed, time-limited link to the agency representative.
3. The representative confirms service dates; their identity and work email are stored with the audit record.
4. Admin approves; the ledger creates the contractor's reward and the introducer's, each guarded by a unique key.
5. Payout stays queued until the `payouts.live` flag is enabled.

### Cross-cutting concerns

- **Authentication:** cookie sessions with CSRF for web, bearer access tokens plus rotating refresh tokens for future mobile; admin via SSO with MFA.
- **Authorisation:** roles (contractor, admin, finance-approver, support) checked by guards; CASL for admin permissions.
- **Audit:** an interceptor and Prisma extension write `AuditEvent` rows for every change to contractor, referral, reward and payment data.
- **Idempotency:** `Idempotency-Key` header on mutating endpoints, stored per user for 24 hours.
- **Feature flags:** DB-backed flags for agency access, rewards, payouts and profit sharing.
- **Errors:** typed domain errors mapped to RFC 9457 problem responses.
- **Observability:** Pino logs with a PII redaction list, OpenTelemetry traces, Sentry, alerts on failed jobs and SMS delivery rate.
- **Time:** timestamps stored in UTC; date-only rules computed in Europe/London.
- **Events:** an outbox table records profile and availability changes for future matching (A16).

## Folder structure

Apps depend on packages, never the other way round, and `packages/domain` depends on nothing internal.

```
loop/
├── CLAUDE.md                     # guidance for Claude Code and contributors
├── README.md
├── package.json                  # root scripts; packageManager: pnpm
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .nvmrc                        # Node 24 LTS
├── .env.example
├── docker-compose.yml            # Postgres, MinIO (S3), Mailpit, ClamAV
├── Dockerfile                    # single multi-stage image
├── .github/workflows/
│   ├── ci.yml                    # lint, typecheck, test, e2e, build image
│   └── deploy.yml                # migrate + deploy to staging, promote to prod
├── apps/
│   ├── api/                      # NestJS: REST + OpenAPI, static serving, jobs
│   │   ├── src/
│   │   │   ├── main.ts           # bootstrap; reads APP_ROLE
│   │   │   ├── app.module.ts
│   │   │   ├── config/           # env schema (Zod), typed config service
│   │   │   ├── common/
│   │   │   │   ├── guards/       # session/bearer auth, roles, CSRF
│   │   │   │   ├── interceptors/ # audit, idempotency, logging
│   │   │   │   ├── filters/      # domain error -> RFC 9457 problem
│   │   │   │   └── pipes/        # Zod validation
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── onboarding/
│   │   │   │   ├── cv/
│   │   │   │   ├── extraction/
│   │   │   │   ├── profile/
│   │   │   │   ├── employment/
│   │   │   │   ├── preferences/
│   │   │   │   ├── freshness/
│   │   │   │   ├── messaging/
│   │   │   │   ├── referrals/
│   │   │   │   ├── founding/
│   │   │   │   ├── assignments/
│   │   │   │   ├── rewards/
│   │   │   │   ├── payments/
│   │   │   │   ├── participation/
│   │   │   │   ├── admin/
│   │   │   │   ├── flags/
│   │   │   │   ├── audit/
│   │   │   │   ├── privacy/
│   │   │   │   └── health/
│   │   │   ├── jobs/             # pg-boss setup + one handler per job name
│   │   │   └── static/           # serves web/admin bundles, .well-known files
│   │   └── test/                 # integration tests (Nest + Testcontainers)
│   ├── web/                      # React Router v7, framework mode
│   │   └── app/
│   │       ├── routes/           # _index, upload, verify, register, onboarding.*,
│   │       │                     # my-loop.*, introduce, r.$code, confirm.$token
│   │       ├── features/         # onboarding, availability, referrals, rewards
│   │       └── lib/              # api client setup, auth, analytics
│   ├── admin/                    # React + Vite SPA
│   │   └── src/{routes,features,lib}
│   └── e2e/                      # Playwright: spec C2 acceptance tests
├── packages/
│   ├── domain/                   # pure rules + Vitest tables
│   │   └── src/{availability,freshness,founding,rewards,referrals,time}/
│   ├── db/
│   │   ├── prisma/schema.prisma
│   │   ├── prisma/migrations/
│   │   ├── prisma/sql/           # TypedSQL for locking queries
│   │   └── src/{client.ts,seed.ts}
│   ├── contracts/                # Zod request/response schemas by module
│   ├── api-client/               # Orval-generated hooks (do not edit)
│   ├── ui/                       # AvailabilityBadge, form fields, layout
│   └── config/                   # eslint, tsconfig, vitest presets
└── infra/                        # AWS CDK app
    └── lib/{network,data,storage,service,secrets,monitoring}-stack.ts
```

Each Nest module follows the same internal shape: `*.controller.ts` (HTTP only), `*.service.ts` (orchestration and transactions), `*.repository.ts` (Prisma access for the module's own tables), `*.module.ts`, and `__tests__/`. Modules call each other through exported services, never through another module's tables.

This replaces the earlier `apps/jobs` placeholder in the stack doc: jobs live in `apps/api/src/jobs` so they ship in the same image.

## Data model

Each business record in spec B2 becomes one or more Prisma models, with the rules that must never break enforced by the database, not just the code.

| Model | Key fields | Enforced invariant |
| --- | --- | --- |
| `Contractor` | id, name, email, mobile, mobileVerifiedAt, referralCode, referredById, liveAt, visibility (`live`, `paused`, `searchSuppressed`) | Unique email, mobile and referralCode; `referredById` set once, never self |
| `OnboardingDraft` | id, tokenHash, referralCode, expiresAt, contractorId | Expired drafts and their CVs deleted by retention job |
| `CvFile` | id, ownerId (draft or contractor), storageKey, mimeType, size, scanStatus, uploadedAt | Only `scanStatus = clean` files are processed |
| `ExtractionRun` | id, cvFileId, model, status, rawOutput (JSONB), error, createdAt | Never edited after completion |
| `ProfileField` | contractorId, field, value (JSONB), source (`ai`, `contractor`, `admin`), confidence, verifiedAt | AI values never overwrite `contractor` values |
| `Skill`, `WorkHistory`, `Qualification` | structured children of the profile | Linked to the contractor, with provenance |
| `Employment` | contractorId, situation (`contracting`, `permanent`, `not_working`), contractEndDate, earlyRelease, noticePeriod | One current row per contractor |
| `Availability` | contractorId, availableFrom, immediate, lastConfirmedAt, confirmationSource, derivedColour, nextCheckAt | `derivedColour` written only by the domain function |
| `Preferences` | roles, homeLocation, preferredLocations, workArrangement, targetRatePence, minRatePence, ir35, rightToWork, clearance, umbrellaProvider | Min rate and IR35 required when permanent |
| `CommunicationPreference` | contractorId, operationalSms, marketingSms, marketingEmail, updatedAt | Marketing separate from operational |
| `Confirmation` | contractorId, channel, outcome, payload, createdAt | Append-only |
| `MessageLog` | contractorId, channel, template, providerId, status, sentAt, deliveredAt | Updated only by provider webhooks |
| `Referral` | introducerId, referredId, registeredAt, status, fraudFlags | Unique `referredId`; introducer ≠ referred |
| `FoundingCounter` | id (single row), allocated | `allocated ≤ 50000` via conditional update |
| `FoundingQualification` | contractorId, sequence, qualifiedAt | Unique contractorId and sequence |
| `Assignment` | contractorId, agencyName, startDate, introductionId, status |  |
| `VerificationRequest` | assignmentId, tokenHash, expiresAt, representativeName, workEmail, confirmedStart, confirmedEnd, verifiedAt | Single-use, time-limited |
| `Reward` | type (`own_contract`, `introduction`), beneficiaryId, qualifyingContractorId, amountPence, status | Unique (type, beneficiaryId, qualifyingContractorId) |
| `Payout` | rewardId, provider, providerRef, status, approvedBy, settledAt | Created only when `payouts.live` is on |
| `ParticipationEligibility` | contractorId, eligible, reason, effectiveFrom | History rows, no percentages |
| `Session` | contractorId, tokenHash, family, device, lastUsedAt, expiresAt, revokedAt | Refresh tokens stored hashed only |
| `FeatureFlag` | key, enabled, updatedBy |  |
| `AuditEvent` | actor, entity, entityId, action, before, after, at | Append-only; no update or delete grants |
| `OutboxEvent` | type, payload, createdAt, publishedAt | Written in the same transaction as the change |

Money is stored as integer pence. Timestamps are `timestamptz` in UTC. Search indexes: `pg_trgm` on names and skills, B-tree on `derivedColour`, `contractEndDate` and `umbrellaProvider` for the admin filters in B9 and B11.

## API surface

All endpoints sit under `/api/v1`, are described in the generated OpenAPI spec, and return computed status (such as availability colour) rather than leaving clients to calculate it.

| Group | Endpoints | Caller |
| --- | --- | --- |
| Onboarding | `POST /drafts`, `POST /drafts/:id/cv-upload-url`, `GET /drafts/:id/extraction`, `PUT /drafts/:id/profile` | Anonymous (draft token) |
| Auth | `POST /auth/otp/start`, `POST /auth/otp/verify`, `POST /auth/magic-link/start`, `POST /auth/magic-link/complete`, `POST /auth/token/refresh`, `POST /auth/logout`, `GET /auth/sessions`, `DELETE /auth/sessions/:id` | Public / contractor |
| Registration | `POST /registrations` (converts draft, keeps referral) | Draft token + verified OTP |
| Me | `GET /me`, `PATCH /me`, `DELETE /me` (erasure), `GET /me/export` | Contractor |
| Profile | `GET /me/profile`, `PUT /me/profile`, `POST /me/cv` (re-upload), `GET /me/profile/suggestions`, `POST /me/profile/suggestions/:id/accept` | Contractor |
| Employment and availability | `PUT /me/employment`, `PUT /me/availability`, `POST /me/availability/confirm`, `POST /me/go-live`, `POST /me/pause` | Contractor |
| Preferences | `GET /me/preferences`, `PUT /me/preferences`, `PUT /me/communication-preferences` | Contractor |
| Confirmation links | `GET /confirm/:token` (one-tap SMS confirmation) | Signed link |
| Referrals and founding | `GET /me/referrals`, `GET /me/founding`, `GET /r/:code` (public referral landing data) | Contractor / public |
| Rewards | `GET /me/rewards` | Contractor |
| Agency verification | `GET /verify/:token`, `POST /verify/:token` | Signed, time-limited link |
| Webhooks | `POST /webhooks/twilio/status`, `POST /webhooks/twilio/inbound`, `POST /webhooks/wise` | Providers (signature verified) |
| Admin | `/admin/contractors` (search, filters by colour, contract end, umbrella, freshness), `/admin/follow-ups`, `/admin/extraction-errors`, `/admin/messages`, `/admin/referrals`, `/admin/assignments`, `/admin/verifications`, `/admin/rewards` (approve), `/admin/flags`, `/admin/reports`, `/admin/audit` | Admin roles |
| Platform | `GET /health/live`, `GET /health/ready` | Load balancer |

Mutating endpoints accept an `Idempotency-Key` header. List endpoints use cursor pagination (`?cursor=&limit=`).

## Step-by-step implementation plan

Seven steps, each ending in a working, deployed increment; everything after step 2 ships behind feature flags rather than as a separate public launch.

### Step 0: Foundations

- [ ] Create the repository with pnpm workspaces, Turborepo, `tsconfig.base.json`, `.nvmrc` and `CLAUDE.md`.
- [ ] Add `packages/config` (eslint, tsconfig, vitest presets) and a root `pnpm lint`, `typecheck`, `test` pipeline.
- [ ] Write `docker-compose.yml` for Postgres, MinIO, Mailpit and ClamAV.
- [ ] Scaffold `apps/api` (NestJS) with config validation, Pino logging, the problem-response filter, health endpoints and the `APP_ROLE` bootstrap.
- [ ] Scaffold `packages/db` with Prisma, the first migration (`Contractor`, `AuditEvent`, `FeatureFlag`) and a seed script.
- [ ] Wire pg-boss into `apps/api/src/jobs` with a sample job and singleton scheduling.
- [ ] Set up `@nestjs/swagger` and Orval so `pnpm api:generate` produces `packages/api-client`.
- [ ] Scaffold `apps/web` (React Router v7 with a prerendered landing route) and `apps/admin` (Vite SPA), both using `packages/ui`.
- [ ] Auth skeleton: session table, cookie guard, bearer guard, CSRF, roles; admin SSO stub.
- [ ] Audit interceptor and Prisma extension; idempotency interceptor.
- [ ] Write the Dockerfile (multi-stage, `turbo prune`, `pnpm deploy`, non-root) and CI workflow.
- [ ] Write the CDK stacks and deploy staging: VPC, RDS, S3 buckets, Secrets Manager, one Fargate service, load balancer, CloudFront, WAF.

**Done when:** a pushed commit passes CI, builds one image and deploys to staging, where `/api/v1/health/ready` responds and the landing page loads.

### Step 1: Core onboarding (first milestone)

- [ ] Landing page content and `?ref=` capture (A2).
- [ ] `onboarding` module: drafts, signed draft token, presigned upload URL (A3).
- [ ] `cv` module: type and size validation, ClamAV scan job, text extraction with unpdf and mammoth.
- [ ] `extraction` module: LLM prompt and Zod output schema with evidence and confidence; reject unsupported fields; store `ExtractionRun` (A4).
- [ ] Verify screen with highlighted uncertain fields and inline editing (A5).
- [ ] Registration: name, email, mobile, terms, marketing opt-in; OTP via Twilio Verify; draft conversion keeping referral (A6).
- [ ] Employment pathways, availability capture and preferences including umbrella provider (A7–A9).
- [ ] Review and go LIVE: timestamps, referral link, founding tracking initialised (A10).
- [ ] Basic My LOOP with profile, availability and preferences editing (A11).
- [ ] Playwright tests: CV without account produces a preview; corrections saved on registration; no CV blocks registration; referral retained.

**Done when:** a contractor can upload a CV, correct the AI profile, register, confirm availability and go LIVE on staging.

### Step 2: Availability and freshness

- [ ] `packages/domain/availability`: colour derivation with table-driven tests for every B3 rule.
- [ ] `packages/domain/freshness`: next-check calculation for every B4 schedule.
- [ ] Daily sweep job: recompute colour, enqueue due checks, move overdue profiles to grey.
- [ ] `messaging` module: Twilio sending, signed one-tap links, keyword replies, delivery and inbound webhooks, STOP handling.
- [ ] `GET /confirm/:token` flow and Stay Current screen (A12).
- [ ] Communication preferences, keeping operational SMS separate from marketing.
- [ ] Admin: colour, contract-end and freshness filters; grey follow-up queue; search suppression.
- [ ] Playwright and integration tests for the C2 colour, scheduling, suppression and SMS-disabled cases.

**Done when:** every C2 availability test passes and the sweep runs once a day on staging without duplicates.

### Step 3: Network growth

- [ ] Introduce Contractors page and share actions (WhatsApp, SMS, LinkedIn, email); visible on home, My LOOP, rewards and founding pages (A13).
- [ ] Referral attribution through draft, verification and registration; self-referral and duplicate checks.
- [ ] `packages/domain/founding` eligibility rules.
- [ ] Transactional founding allocation with the conditional counter update.
- [ ] Founding progress on My LOOP ("3 of 5 introductions").
- [ ] Concurrency test: parallel completions never exceed the cap.

**Done when:** five valid registered referrals can complete qualification and the concurrency test passes.

### Step 4: Rewards and verification

- [ ] Admin assignment entry (contractor, agency, start date, introduction ID).
- [ ] Three-month milestone job creating verification requests.
- [ ] Signed, time-limited agency verification page storing representative identity, work email and confirmed dates.
- [ ] Reward ledger with unique keys; admin approval with eligibility, dispute and duplicate checks.
- [ ] Wise adapter in sandbox, behind `payouts.live`; reconciliation job.
- [ ] Rewards page for contractors (A14).

**Done when:** verified service creates eligible rewards exactly once, and missing verification blocks approval.

### Step 5: Future readiness

- [ ] Umbrella provider and contract-end filters (30, 60, 90 days) in admin (B9).
- [ ] `participation` module: founding history and eligibility records, no percentages (B10).
- [ ] Outbox events for profile and availability changes (A16).
- [ ] Basic admin reporting.

**Done when:** the umbrella search C2 test passes and outbox events are written for every profile change.

### Step 6: Hardening and launch

- [ ] GDPR export and erasure; retention jobs for drafts, CVs and logs.
- [ ] Privacy notice and founding terms from legal review wired into registration.
- [ ] Rate limits and SMS fraud protection on OTP endpoints.
- [ ] Load test at around 50,000 profiles; check search and sweep timings.
- [ ] Penetration test and fixes.
- [ ] Production environment: Multi-AZ database, backups and restore test, alerts, runbooks.
- [ ] Production cutover.

**Done when:** all C2 acceptance tests pass in production-like staging, a restore has been tested, and production is live with agency access, payouts and profit sharing still switched off.

## Environments, CI/CD and CLAUDE.md

Three environments share one image; only configuration and secrets differ between them.

| Environment | Runs on | Data | Integrations |
| --- | --- | --- | --- |
| Local | `pnpm dev` + Docker Compose | Postgres container, MinIO, seed data | Twilio test credentials, Mailpit, LLM API with a spend cap |
| Staging | One Fargate task, single-zone RDS | Synthetic contractors only | Twilio and Wise sandboxes |
| Production | One task (two at go-live), Multi-AZ RDS | Real data, UK region | Live Twilio and email; payouts flag off |

**CI (every pull request):** install with a cached pnpm store, then `lint`, `typecheck`, unit and integration tests (Testcontainers), `api:generate` with a check that the client is committed, Playwright against a composed stack, and an image build.

**Deploy (main branch):** build and push the image, run `prisma migrate deploy` as a one-off task, roll the Fargate service on staging, run smoke tests, then promote the same image to production with a manual approval.

### CLAUDE.md

The repository-root `CLAUDE.md` is delivered as a separate file in the chat. It gives Claude Code and new contributors:

- What LOOP is and where the spec lives.
- The stack and the everyday commands (`pnpm dev`, `db:migrate`, `api:generate`, `test`, `e2e`).
- The repository layout.
- Fourteen architecture rules that must not be broken, such as colour being derived, AI never overwriting confirmed data, transactional founding allocation and rewards created exactly once.
- Coding, testing, security and privacy conventions.
- Working agreements for Claude, and a domain glossary of the colours, freshness and founding terms.

Keep it updated as decisions change; it is the first file Claude Code reads in the repository.
