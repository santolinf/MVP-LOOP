# ADR 0012: Cloud-agnostic object storage and malware scanning

Status: Accepted (2026-10-29). Extends ADR 0005 (uploads quarantined; AI constrained). Replaces the unstated "why ClamAV" gap there.

## Decision

The app depends on two **interfaces**, not on any cloud product. Any backend that satisfies them is supported; `infra/` is one deployment of them, not a requirement.

### 1. Object storage: the S3 API

A private bucket reached with the AWS S3 client (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`). `S3_ENDPOINT` is omitted for AWS S3. The operations the CV pipeline uses, and which a backend must support:

- Presigned PUT (SigV4) with the content type signed, so a different type is refused.
- Presigned GET with `response-content-disposition` and `response-content-type` overrides (forced download).
- HEAD (size, or not found), ranged GET (magic-byte check), streamed GET (scan).
- Server-side copy then delete (quarantine to ready).

Supported by the S3 client: AWS S3, MinIO, Ceph RGW, Cloudflare R2, Backblaze B2, Google Cloud Storage via its S3 interop API (HMAC keys). **Not supported without a gateway:** Azure Blob (not S3-compatible). The client disables the SDK's default CRC32 checksums because some backends reject those headers.

A candidate backend is accepted when `storage.conformance.int.test.ts` passes against it (point `S3_*` at a scratch bucket and run `pnpm --filter @loop/api test:integration`). Dev and CI run the same suite against MinIO.

### 2. Malware scanner: an HTTP contract

`POST {CLAMAV_URL}/scan`, body = the file bytes, `Authorization: Bearer {CLAMAV_AUTH_TOKEN}`. Answers `200 {"verdict":"CLEAN"|"INFECTED"}`. Anything else (4xx/5xx, timeout, unknown verdict) is "no verdict", and the app **fails closed**: the upload is not promoted. `GET /healthz` is 200 only once signatures are loaded.

The reference implementation is `infra/clamav-scanner`: clamd + freshclam + a small HTTP front, as one container. It runs wherever a container runs (Cloud Run, ECS, Kubernetes, Container Apps, a VM beside the app). Any other implementation that honours the contract (a commercial scanning API behind a thin adapter, an ICAP bridge) can replace it with no app change. `clamav-scanner.contract.test.ts` checks the contract (set `CLAMAV_CONTRACT_URL` and `CLAMAV_CONTRACT_TOKEN` to check a deployed one with real ClamAV).

Local dev runs the same container from `docker-compose.yml`, so dev exercises the production code path (the old raw-TCP clamd client was removed).

### 3. Where scanning sits in the pipeline

At ingestion, **before** text extraction and the LLM, as ADR 0005 already orders it: quarantine, type/magic-byte check, scan, promote. The LLM only sees extracted text, so the scan protects the extractor and every later human who opens the file.

Signatures improve after upload, so stored files are re-scanned: the hourly `cv-rescan` job scans READY CVs whose last clean verdict (`CvUpload.lastScannedAt`) is older than `CV_RESCAN_INTERVAL_DAYS` (default 7), oldest first, 50 per run. A file that now scans INFECTED is deleted, its upload REJECTED, and a SYSTEM audit event written. A scan error leaves the file READY and due, and the job fails only if nothing could be scanned. **TODO(spec): no agency download path exists yet. Before `agency.access` goes live, re-scan at first agency download or serve a sanitised copy.**

## Why

- Cloud choice is undecided and should not leak into application code. The lock-in surface is two small, standard interfaces.
- No cloud offers a managed malware scanner we could rely on across providers (AWS GuardDuty for S3 has no Google or Azure equivalent), so a container behind HTTP is the only portable shape.
- Cloud Run and similar platforms speak only HTTP, so the scanner contract is HTTP rather than clamd's TCP protocol.

## Trade-offs / open items

- Lowest common denominator: no GuardDuty-style managed scanning, no native cloud-SDK storage features.
- "S3-compatible" is uneven in practice; the conformance test, not the label, is the definition of supported.
- Auth to the scanner is a shared bearer token, the portable baseline. Provider IAM or network isolation is optional hardening per deployment, and does not change the contract.
- Signature-based scanning misses novel exploits; parser isolation (bounded extraction in the worker) remains the control for those.
- Production requires `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, an https `CLAMAV_URL` and `CLAMAV_AUTH_TOKEN`; the app refuses to boot without them. UK-only residency of the bucket is a deployment requirement we cannot enforce in code.
- `infra/lib/scanner-stack.ts` deploys the scanner on AWS (Fargate, internal https ALB, token in Secrets Manager) when `-c scannerCertificateArn=...` is passed; the other CDK stacks remain stubs. Provider recipes are in [deploy-storage-and-scanning.md](../deploy-storage-and-scanning.md).
