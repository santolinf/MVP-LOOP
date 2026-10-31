> Part of the [LOOP V33 Phased Implementation Plan](../LOOP_V33_Phased_Implementation_Plan.md) (§3 Phase detail). Source of truth is the master plan; this file is an extract.

### Phase 4 — AI profile extraction and review
Preserves the existing rules: AI never invents data, every field carries a source excerpt found verbatim in the CV text plus confidence; no evidence → dropped; output stored in `ExtractionRun`, separate from confirmed values.

- pg-boss job `cv.extract` (idempotent, retry-limited). Text extraction first (sandboxed, size/time bounded), then the LLM call.
- **Prompt-injection posture:** CV text is untrusted data. The model gets a fixed schema, tool-less, no network, output validated by Zod; any text in a CV that looks like instructions cannot change behaviour because output is only ever parsed into the schema and shown to the contractor for confirmation.
- Data minimisation to the provider: only the CV text, no email/phone/user ID. Provider must be UK/EU-resident with a no-training contract (Open Question 4).
- Screens: AI profile review, per-field confirm/edit, "we couldn't read this" fallbacks. Nothing becomes the contractor's profile until they confirm (A5).
