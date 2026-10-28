# ADR 0007: Abuse resistance and fraud controls

Status: Accepted (18 Oct 2026, plan §4.8)

## Decision
Rate limits on OTP, upload, search, referral-link resolution and public counters. Founding is awarded server-side in a transaction; rewards are unique-keyed; mutating endpoints take idempotency keys.

## Why
Prevents enumeration, capped-place gaming and duplicate rewards.

## Trade-offs / open items
CAPTCHA/Turnstile held in reserve for anonymous upload; decision deferred.
