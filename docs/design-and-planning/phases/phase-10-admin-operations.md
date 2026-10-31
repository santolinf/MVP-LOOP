> Part of the [LOOP V33 Phased Implementation Plan](../LOOP_V33_Phased_Implementation_Plan.md) (§3 Phase detail). Source of truth is the master plan; this file is an extract.

### Phase 10 — Admin, operations (Gate 3→4)
Prototype tabs: Overview, Contractors, Availability queue, Introductions & Founding, Communications, Settings.

- Separate Vite SPA, **separate auth realm** from contractors: staff accounts, OTP + a second factor (TOTP or passkey), short sessions, IP allow-list or SSO at the edge if feasible.
- RBAC roles (read-only, operator, admin); every endpoint declares required permission; deny by default.
- Contractor search and detail, availability queue, reminder-schedule editor (writes versioned config, audited), manual confirm "on behalf" (source = `ADMIN`, reason mandatory).
- **Introducer override** (change attribution; reason mandatory, before/after audited) and **reward review/approval queue** (evidence from Phase 9; approver cannot be the requester for amounts above any later threshold).
- Admin manages LOOP team message templates and notification templates (versioned).
- **Every view of personal data and every change writes an `AuditEvent`**; audit log is append-only and not editable from the UI.
