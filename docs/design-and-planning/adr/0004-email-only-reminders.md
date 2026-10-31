# ADR 0004: Email-only reminders; routine SMS removed

Status: Accepted (18 Oct 2026, plan §4 / App spec)

## Decision
Reminders are sent by email. Routine SMS is removed from the MVP, the operationalSmsConsent flag and Twilio config are retired, and apps/api/src/modules/sms stays an empty boundary. Cadences: Available 7 days; Orange prompts 28/14/7 days before end, end-date outcome ask, then +3/+7; Red 30; Blue 60; profile review 90; CV review 180; referral nudge 14.

## Why
Matches the app spec, avoids SMS pumping cost and SIM-swap exposure, and reduces consent surface.

## Trade-offs / open items
Open: Q10 (Green +3 follow-up), Q13 (partner-marketing consent), Q14 (email-only reminders confirmation). The needs-confirmation grace windows (2x) are an assumption.
