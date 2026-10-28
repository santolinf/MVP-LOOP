# ADR 0008: Admin RBAC and audit

Status: Accepted (18 Oct 2026, plan §4.9)

## Decision
Deny-by-default RBAC, second factor, short sessions, mandatory reason for on-behalf actions, append-only AuditEvent with masked PII, and audited read access to personal data.

## Why
Limits damage from curious or compromised staff and leaves a trail.

## Trade-offs / open items
Clearance Yes/No has no code footprint yet; designed in its phase.
