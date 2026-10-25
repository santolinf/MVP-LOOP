> Part of the [LOOP V33 Phased Implementation Plan](../LOOP_V33_Phased_Implementation_Plan.md) (§3 Phase detail). Source of truth is the master plan; this file is an extract.

### Phase 5 — Situation, availability and preferences
- Employment situation, availability facts (start/end dates in `Europe/London`), freshness and visibility stored as **separate dimensions** (B2). Colour derived by `packages/domain` and returned by the API; clients only render `<AvailabilityBadge>`.
- Never auto-green when an end date passes; permanent employees stay blue.
- Preferences (work type, rate band, location/remote, sectors, notice) with server-side enum validation.
- Each confirmation writes `lastConfirmedAt` + `confirmationSource` (`WEB|APP|EMAIL_LINK|ADMIN`) + a `ConfirmationEvent` row for history.
