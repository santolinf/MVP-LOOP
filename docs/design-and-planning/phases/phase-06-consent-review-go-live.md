> Part of the [LOOP V33 Phased Implementation Plan](../LOOP_V33_Phased_Implementation_Plan.md) (§3 Phase detail). Source of truth is the master plan; this file is an extract.

### Phase 6 — Consent, review and GO LIVE (Gate 1 complete)
- `ConsentRecord` per purpose (profile visibility, operational email, LOOP marketing, **separate optional partner-marketing consent**), each with wording version, timestamp, source, and withdrawal; no pre-ticked boxes. Service and security notices are never disabled by a marketing opt-out. (Push consent is added when the app is built.)
- **AI disclosure** shown at registration (plain wording that an AI reads the CV and the contractor confirms every field); lightly echoed in marketing copy.
- Review screen shows exactly what will be visible; GO LIVE sets `live` only if required fields, eligibility and consent exist (domain function, not UI logic).
- Welcome screen: web only. No app download or QR prompts now (mobile app deferred).
- Playwright acceptance journey: CV → profile → register → availability → LIVE.
