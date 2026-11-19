# Storage and malware scanning: provider recipes

The app needs two things only (see [ADR 0012](../design-and-planning/adr/0012-cloud-agnostic-storage-and-scanning.md)): a private
S3-compatible bucket, and a scanner that honours `POST /scan`. Everything below is how to satisfy them on a given
provider. Set the matching variables in `.env.prod`. Personal data must stay in the UK, so choose a UK region.

| Variable | Notes |
| --- | --- |
| `S3_ENDPOINT` | Omit for AWS S3. |
| `S3_REGION` | Required in production. The provider's region name (`auto` for GCS interop and R2). |
| `S3_BUCKET` | Private; no public access. Add a lifecycle rule that deletes `quarantine/` objects after a day. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | A dedicated identity limited to this bucket. |
| `S3_FORCE_PATH_STYLE` | `true` for MinIO and most self-hosted stores. |
| `CLAMAV_URL` | https URL of the scanner, no trailing slash. |
| `CLAMAV_AUTH_TOKEN` | At least 32 chars (`openssl rand -hex 32`). The scanner's `AUTH_TOKEN` must be the same value. |

## Browser access to the bucket (CORS and CSP)

Browsers upload and download CVs straight to presigned URLs on the bucket's origin, not through the API. Two things
must allow that:

- **The app's Content-Security-Policy** (`connect-src`). The API adds the bucket origin itself (taken from
  `S3_PUBLIC_ENDPOINT`, `S3_ENDPOINT`, or the provider's host), so no setting is needed.
- **The bucket's CORS policy.** Allow `PUT` and `GET` (and `HEAD`) from your app origin (`APP_BASE_URL`), with the
  `Content-Type` request header allowed. MinIO allows this by default; AWS S3 and Google Cloud Storage need it set
  explicitly, and an upload then fails in the browser with no server-side error if it is missing.

## Scanner image (any provider)

`infra/clamav-scanner` builds the reference scanner. It needs about 2 GB of memory, one always-warm instance so clamd
stays loaded, and CPU that is not throttled between requests so freshclam can update signatures.

```bash
docker build -t loop-clamav-scanner infra/clamav-scanner
docker run -p 8080:8080 -e AUTH_TOKEN=$(openssl rand -hex 32) loop-clamav-scanner   # /healthz is 503 until ready
```

Verify a deployed scanner against the contract with real ClamAV:

```bash
CLAMAV_CONTRACT_URL=https://scanner.example.com CLAMAV_CONTRACT_TOKEN=... pnpm --filter @loop/api test
```

## Google Cloud (Cloud Storage + Cloud Run)

- Bucket in `europe-west2`, uniform access, public access prevented. Create an HMAC key for a dedicated service account.
  `S3_ENDPOINT=https://storage.googleapis.com`, `S3_REGION=auto`.
- Scanner on Cloud Run (HTTP only, which is why the contract is HTTP):

```bash
gcloud run deploy clamav-scanner --source infra/clamav-scanner --region europe-west2 \
  --memory 2Gi --cpu 1 --min-instances 1 --max-instances 3 --concurrency 4 --no-cpu-throttling \
  --allow-unauthenticated --set-secrets AUTH_TOKEN=loop-clamav-token:latest
```

  `--allow-unauthenticated` is deliberate: the service checks its own bearer token, so the app can run anywhere. If the
  app runs on Cloud Run, switch to IAM-only and send a Google ID token (hardening; not needed for the contract).

## AWS (S3 + ECS Fargate)

- Bucket in `eu-west-2`, Block Public Access on. `S3_REGION=eu-west-2`, leave `S3_ENDPOINT` unset, use an IAM user or
  keys scoped to the bucket.
- Scanner as a separate Fargate service (2 GB task, desired count 1) behind an ALB with an https listener. Do not bundle
  it into the API task; clamd's memory would distort API sizing. This is `infra/lib/scanner-stack.ts`:
  `cd infra && npx cdk deploy LoopNetwork LoopScanner -c scannerCertificateArn=<ACM cert in eu-west-2>`. The
  ALB is internal, so the app must run in (or be peered/routed to) the VPC; add its security group to the ALB's
  ingress. Point a DNS name matching the certificate at the ALB and use that as `CLAMAV_URL`; read
  `CLAMAV_AUTH_TOKEN` from the stack's `AuthToken` secret.
- Alternative: GuardDuty Malware Protection for S3 is cheaper to run but asynchronous and AWS-only, so using it means
  changing the upload flow and giving up this portability (ADR 0012).

## Self-hosted

- MinIO (or Ceph RGW) with `S3_FORCE_PATH_STYLE=true`, behind TLS. The dev `docker-compose.yml` runs exactly this, plus
  the scanner image, so `docker compose up -d` is a working reference.
- Put the scanner on the same private network as the app; still keep the bearer token.

## Checking a new backend

Point `S3_*` at a scratch bucket (it must exist) and run the storage conformance suite. It prefixes every key with
`conformance/<uuid>/` and deletes what it created.

```bash
pnpm --filter @loop/api test:integration -- storage.conformance
```
