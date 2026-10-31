# ADR 0006: Privacy, consent and UK residency

Status: Accepted (18 Oct 2026, plan §4.7)

## Decision
All data in AWS eu-west-2. Consent is a first-class record (purpose, wording version, time, source, withdrawal); operational and marketing are separate. PII, CV content and tokens are never logged. Subject rights go through the privacy module.

## Why
UK GDPR obligations and minimising breach impact.

## Trade-offs / open items
Sub-processor register maintained; Q13 partner-marketing consent open.
