# ADR 0001: One platform, one API

Status: Accepted (18 Oct 2026, plan §4.4)

## Decision
Website, Contractor App and Admin share one backend, one database, one rule set and one audit trail. Clients differ only by credential realm and permissions.

## Why
Every client writes the same rows, so an update is visible everywhere on the next read with no sync jobs. Colour is recomputed in the same transaction as the confirmation write.

## Trade-offs / open items
Postgres RLS for contractor-owned tables as defence in depth is to be decided in Phase 1.
