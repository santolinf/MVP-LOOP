> Part of the [LOOP V33 Phased Implementation Plan](../LOOP_V33_Phased_Implementation_Plan.md) (§3 Phase detail). Source of truth is the master plan; this file is an extract.

### Phase 8 — Messaging engine and reminders (Gate 3)
- **Channel: email only for now** (no routine SMS; push is added with the app). Provider adapter for email (Postmark or SES, Open Question 4) behind an interface that can later take a push channel; `Message` and `DeliveryLog` tables; bounce/complaint webhooks with signature verification feeding suppression.
- Templates versioned in code, reviewed like code. Merge fields are escaped.
- **Cadence engine** (pg-boss scheduled sweep with singleton key), thresholds from Admin-editable versioned config, defaults from the app spec (Open Question 10 covers the Green follow-up conflict):
  - Green: reconfirm every 7 days, **no automatic +3 follow-up**.
  - Orange: prompts at 28, 14 and 7 days before the end date, then an end-date outcome ask, then +3 and +7 days if unanswered.
  - Red: 30 days. Blue: 60 days. Full profile review: 90 days. CV review: optional, 180 days. Referral nudge: 14 days if no introductions.
- **Reminder controls:** cap of one routine reminder per contractor per day (highest priority wins); no overnight sends (Europe/London quiet hours); suppress duplicates and stale reminders; **cancel obsolete follow-ups** when the contractor confirms or their situation changes. Idempotency key = contractor + cadence + window. Consent and suppression are checked at send time, not only at scheduling time.
- **One-touch confirm links:** signed, single-purpose, expiring, bound to one contractor and one action ("still available"), stored as hashes. A link can confirm only; it cannot reveal data or change anything else. Anything beyond "still the same" requires sign-in, then returns to the exact action (Phase 2 deep-link resume).
- **LOOP messages vs notifications:** two separate stores. *LOOP team messages* (one-way from LOOP, no recruiter chat) have read/unread state; *system notifications* (reminders, confirmations, security) are separate. Both shown in My LOOP.
- Escalation per spec: follow-up, manual call task for Admin, then search suppression. Nothing changes colour to green on its own.
