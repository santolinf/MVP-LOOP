# ADR 0011: Postgres row-level security for contractor-owned tables

Status: Proposed (2026-10-19, plan §4.4) — for Frank's review; nothing is enabled yet.

## Decision

Do **not** enable Postgres RLS in Phase 1. Keep authorisation in the application layer (`AuthGuard` sets `contractorId`; every contractor-owned query filters on it). Revisit RLS before agency access goes live (feature flag `agency.access`), when a second class of reader appears.

When adopted, the shape will be:
- RLS enabled on contractor-owned tables (profile, availability, preferences, referrals, rewards, sessions).
- The API connects as a non-owner role. Each request runs in a transaction that sets `SET LOCAL app.contractor_id = '<uuid>'`; policies compare `contractorId = current_setting('app.contractor_id')::uuid`.
- Background jobs and admin use a separate role with `BYPASSRLS`, with every use audited.

## Why

- Today the only reader of contractor data is the contractor themselves (plus admin). The application filter is simple and covered by integration tests.
- RLS with Prisma needs a per-request transaction and `SET LOCAL`. That changes how every query is issued (interactive transactions, pg-boss and the freshness sweep using a bypass role), a large cross-cutting change that does not belong in a security-baseline phase.
- RLS is most valuable as defence in depth once agencies (a different principal) can read contractor data. That is when the cost is justified.

## Trade-offs / open items

- Until RLS lands, a missing `where contractorId` in a new query is a data leak. Mitigation: code review checklist item and an integration test per new endpoint that asserts another contractor's data is not returned.
- TODO(spec): confirm with Frank whether agency access is expected before or after the first production launch; if before, schedule RLS in the phase that introduces agency reads.
- Rate-limit buckets are not contractor-owned data and are excluded.

## Phase 1 security checkpoint (plan §4.11)

| Question | Answer |
| --- | --- |
| New personal data? | `RateLimitBucket` stores SHA-256 hashes of IP, account id and device id with a counter and window start. No clear-text identifiers. |
| Who can read it? | The API database role only. No endpoint exposes it. |
| How is it audited? | Not audited: operational counters, not contractor, referral, reward or payment data (CLAUDE.md rule 12 does not apply). |
| How can it be abused? | Rotating IPs or device ids evades one scope, but the three scopes are independent. Spoofed `x-device-id` only affects the attacker's own bucket. The limiter fails open if Postgres is down, so a DB outage removes the global limit (OTP limits still apply). |
| How is it deleted? | The `rate-limit-cleanup` job purges windows older than 1 hour every 15 minutes. |
| Logging | Logger redacts email, phone, names, tokens, OTP codes and CV text by key, and scrubs emails, UK phones, long tokens and 6-digit codes in free text. Names inside free-text strings are not detected (best effort). |
| Errors | RFC 9457 problem responses; 5xx are generic, with no stack traces and no account-existence signal. |
