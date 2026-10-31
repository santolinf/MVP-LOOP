> Part of the [LOOP V33 Phased Implementation Plan](../LOOP_V33_Phased_Implementation_Plan.md) (§3 Phase detail). Source of truth is the master plan; this file is an extract.

### Phase 1 — Security and platform baseline
Do this before any new personal-data feature, because retrofitting is how gaps happen.

- Security headers (helmet) and a strict CSP for the served web/admin bundles; CORS limited to known origins; HSTS at the edge.
- Request validation everywhere via Zod (`nestjs-zod`); reject unknown fields.
- Global rate limiting (per IP, per account, per device) with a Postgres-backed store so no Redis is needed.
- Logger redaction list: email, phone, tokens, CV text, OTP codes, names in free text. A test asserts a log line containing a seeded email is redacted.
- RFC 9457 errors that never leak stack traces or whether an account exists.
- CI: dependency audit, secret scanning, `lint`/`typecheck`, license check; Dependabot or equivalent.
- Config validation fails closed at boot; secrets only from env/Secrets Manager.
