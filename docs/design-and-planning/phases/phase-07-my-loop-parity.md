> Part of the [LOOP V33 Phased Implementation Plan](../LOOP_V33_Phased_Implementation_Plan.md) (§3 Phase detail). Source of truth is the master plan; this file is an extract.

### Phase 7 — My LOOP parity (Gate 2)
- Log back in (OTP), view and edit every Gate 1 field, same validation as registration.
- **CV versions:** replacing a CV stores a new `CvVersion`, re-runs extraction and compares it with the confirmed profile. Material changes (roles, dates, skills, clearance) need explicit contractor review before anything is overwritten; unreviewed changes never apply. Version history is preserved per retention rule; delete-my-CV works end to end. A periodic CV-review prompt (optional, 180 days) is a Phase 8 cadence.
- **Assignments without a CV:** contractors can add assignment history manually (client/supplying company, role, start and end dates, assignment ID where known). The same records feed the £50 reward evidence in Phase 9.
- **Profile fields added by the app spec:** security clearance (Yes/No), IR35 status, rates and work patterns, validated server-side with enums. Check which already exist in `schema.prisma` and add the rest in one migration.
- Pause/unpause visibility, withdraw profile, export my data, delete my account (through the `privacy` module; erasure job with audit tombstone).
