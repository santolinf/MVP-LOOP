# Phase 2 backlog: reward claims, notifications and payment tracking

Status: **deferred**. Do not build before agencies and consultancies start generating qualifying placements through LOOP.
Source: product owner email "rewards functionality, MVP vs Phase 2" (Oct 2026). The MVP half (referral registration,
attribution and permanent account linking, B5) is delivered; see `Referral` in `packages/db/prisma/schema.prisma`.

## Reward rules (unchanged)

- £50 one-off to a contractor for their first qualifying LOOP assignment.
- £50 one-off to their direct introducer when that referred contractor completes their first qualifying assignment.
- Qualifying period: three months of agency-verified paid service.
- Unlimited separate direct introductions; each can earn independently.
- No recurring or multi-level rewards.

## Deferred items

| # | Item | Notes |
| --- | --- | --- |
| 1 | "Claim My Rewards" button | My LOOP; shown only when a reward is claimable |
| 2 | Contractor placement reward claims | Claim linked to `Assignment` and `Reward` (type `CONTRACTOR_PLACEMENT`) |
| 3 | Individual referral reward claims | Introducer is resolved from `Referral.referrerId`; never typed by the claimant |
| 4 | Automatic reward notification email to the product owner | Via the Phase 8 messaging engine, new template |
| 5 | Admin reward claims dashboard | Extends the Phase 10 admin reward queue |
| 6 | Manual claim approval and rejection screens | Keep the four-eyes rule from `mayApproveReward` |
| 7 | Payment tracking and payment statuses | Behind `payouts.live`; money in integer pence |
| 8 | Automated reward verification | Agency-supplied evidence only (B7) |

## What already exists (reuse, do not rebuild)

- `Referral`: introducer, introduced contractor, registration time, `source`, `codeUsed`, hashed IP / user agent / device,
  locked at GO LIVE, FK-constrained, no self-referral. Phase 2 adds claims that point at these rows; the rows do not change.
- `Reward` ledger with `@@unique([type, beneficiaryId, qualifyingContractorId])`, statuses PENDING, UNDER_VERIFICATION, APPROVED, PAID.
- `RewardsService.openForPlacement`, admin approval with four-eyes, read-only `GET /rewards`.
- `payouts.live` feature flag (off); `AuditEvent` for every change.

## Known work when this is picked up

- Add foreign keys on `Reward.beneficiaryId` and `Reward.qualifyingContractorId` (left out of B5 to keep it small).
- Decide retention for referral and reward evidence after erasure (`TODO(spec)` in `privacy/erasure.ts`).
- Worked example to test: John introduces Sarah, David and Mike. Sarah qualifies, so John's reward is assessed for Sarah only;
  David and Mike are unaffected.
