> Part of the [LOOP V33 Phased Implementation Plan](../LOOP_V33_Phased_Implementation_Plan.md) (§3 Phase detail). Source of truth is the master plan; this file is an extract.

### Phase 3 — Eligibility and CV intake
- Eligibility declaration (right to work / UK-based / contractor intent as specified) stored as an immutable, timestamped record with wording version.
- **Upload pipeline:** presigned upload to S3-compatible storage (private bucket) → quarantine prefix → size/type/magic-byte checks (PDF, DOC/DOCX only) → ClamAV scan → only then promoted and made available to extraction. A failed scan deletes the object and tells the user generically.
- Files are never served from the app origin; downloads use short-lived presigned URLs, `Content-Disposition: attachment`, `nosniff`.
- Unauthenticated users can upload (V33 lets people start before registering). Mitigation: per-IP and global upload quotas, small size cap pre-registration, orphaned-upload TTL cleanup job (pg-boss), and the file is bound to a short-lived anonymous "draft" token, adopted by the account at registration.
- Max size and retention are Open Question 2.
