> Part of the [LOOP V33 Phased Implementation Plan](../LOOP_V33_Phased_Implementation_Plan.md) (§3 Phase detail). Source of truth is the master plan; this file is an extract.

### Phase 11 — Deferred: Contractor App (not scheduled)
The mobile app is out of scope for this plan and will be planned separately. Nothing here is built now. What we do keep, so adding it later is additive:
- `/api/v1` stays backward-compatible and the generated OpenAPI client remains the only contract.
- Business rules and colour stay server-side.
- `Session.clientType` enum and `Contractor.firstAppSignInAt` already exist.
- The messaging adapter (Phase 8) is channel-agnostic.

When the app is planned it will need: JWT + rotating refresh tokens with reuse detection, device registry, push (APNs/FCM, payloads free of personal data), universal links on an allow-list, the `firstAppSignIn` evidence for Founding (Open Question 11), push preferences, and a pen-test round covering the app.
