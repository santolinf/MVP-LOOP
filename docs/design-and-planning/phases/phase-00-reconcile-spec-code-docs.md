> Part of the [LOOP V33 Phased Implementation Plan](../LOOP_V33_Phased_Implementation_Plan.md) (§3 Phase detail). Source of truth is the master plan; this file is an extract.

### Phase 0 — Reconcile spec, code and docs (small, do first)
Why first: the existing code and `CLAUDE.md` still encode decisions V33 reverses. Building on them would bake in drift.

- **Remove routine SMS from the MVP.** Reminders are **email only** for now (the app spec's push channel is deferred with the app). Retire the `sms` module path, `operationalSmsConsent` and the Twilio-based "Stay Current" flow; keep the module boundary empty rather than deleting history. Update `CLAUDE.md` (stack, glossary, "Operational SMS" security line, magic-link wording, the stale "lime 14-day" glossary entry).
- **Re-align freshness thresholds** in `packages/domain/src/freshness` to the app spec (current code: AVAILABLE_NOW 7/14, ENDING_SOON 14/28, IN_CONTRACT 30/60, PERMANENT 60/120): 
  - Green: reconfirm every **7 days, continuous, with no automatic +3 follow-up** (see Open Question 10).
  - Red (in contract, end date more than 28 days away): every **30 days**.
  - Orange / Amber (end date within 28 days): prompts at **28, 14 and 7 days** before the end date, then an end-date outcome ask, then **+3 and +7 days** if unanswered.
  - Blue (permanent): every **60 days**.
  - Full profile review every **90 days**; optional CV review at **180 days**; one referral nudge at **14 days** if no introductions.
  - Make them **configuration with defaults**, editable in Admin later, never literals in jobs. Table-driven tests per rule (existing `TODO(spec): Q3` is closed here).
- **Status names:** Green "Available Now" (explicit confirmation only), Amber (end date ≤ 28 days), Red (end date > 28 days), Blue "Permanently Employed", Unconfirmed (grey). Colour stays derived in `packages/domain` and never auto-promotes to green.
- **Clearance** becomes a Yes/No declaration (no vetting levels).
- **Registration identifiers:** capture email and mobile; decide uniqueness (see Open Question 3) before the Prisma schema moves.
- **ADRs** in `docs/design-and-planning/adr/` for each decision in §4 so the "why" survives.

*Done when:* CLAUDE.md, domain constants and docs agree with the PDF and the app spec's shared rules; no code path sends routine SMS.
