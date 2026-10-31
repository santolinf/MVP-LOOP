# ADR 0009: Supply chain and operations

Status: Accepted (18 Oct 2026, plan §4.10)

## Decision
Pinned lockfile, dependency audit and secret scanning in CI, minimal non-root image, secrets in Secrets Manager, separate environments, signed and replay-protected webhooks, auth anomaly alerting, pen tests before Gates 1 and 4.

## Why
Reduces dependency and operational compromise risk.

## Trade-offs / open items
Pen-test scheduling is outside the repo.
