# Local development environment

How to run LOOP on your own machine. For architecture rules and conventions see [CLAUDE.md](../../CLAUDE.md); for the
shared cloud environment see [cloud-environment/](../cloud-environment/gcp-dev-environment.md).

## Prerequisites

Node 24 (see `.nvmrc`), pnpm (version from `packageManager`), and Docker (local, or a remote Docker host, see below).

## First run

```bash
pnpm install
docker compose up -d          # Postgres, MinIO, Mailpit, ClamAV scanner
cp .env.example .env
pnpm db:migrate && pnpm db:seed
pnpm dev                      # api + web + admin in watch mode
```

Run `pnpm lint && pnpm typecheck && pnpm test` before committing.

## Local services

`docker compose up -d` (from [docker-compose.yml](../../docker-compose.yml)) starts the same dependencies the app uses
in the cloud, so local and deployed code paths match:

| Service | Port(s) | Used for |
| --- | --- | --- |
| Postgres 17 | 5432 | Database and the pg-boss job queue |
| MinIO | 9000 (S3), 9001 (console) | CV storage through the S3 API (ADR 0012) |
| clamav-scanner | 8080 | Malware scanning over `POST /scan`. First start downloads signatures, so `/healthz` is 503 for a minute or two. |
| Mailpit | 1025 (SMTP), 8025 (web UI) | All outgoing email; read sign-in codes at <http://localhost:8025> |

`.env.example` already points at these. Dev defaults need no scanner, SMTP or S3 setup beyond that.

## Everyday commands

| Task | Command |
| --- | --- |
| Unit tests | `pnpm test` |
| Regenerate the OpenAPI spec and client after any API change | `pnpm api:generate` |
| Integration tests (need Docker) | `pnpm --filter @loop/api test:integration` |
| Acceptance tests (spec C2) | `pnpm e2e` |

### e2e: install the browser once

Playwright expects `chromium_headless_shell-1248`:

```bash
pnpm --filter @loop/e2e exec playwright install chromium
```

### Integration tests

These start real containers (for example the founding-allocation concurrency test, about 18 seconds) and also exercise
real services:

- **Storage conformance** runs the S3 operations the CV pipeline needs against whatever `S3_*` points at (MinIO from
  `docker compose up -d` by default). Use it to accept a new storage backend.
- **SMTP delivery** sends through Mailpit and reads the message back over its API.
- **Scanner contract** (a unit test) runs the real scanner front with a fake clamd. Set `CLAMAV_CONTRACT_URL` and
  `CLAMAV_CONTRACT_TOKEN` to also check a running scanner with real ClamAV.

## Using a remote Docker host

If Docker runs on another machine, point the tooling at it. Replace `<docker-host>` with its address.

Bash:

```bash
export DOCKER_HOST=tcp://<docker-host>:2375
export TESTCONTAINERS_RYUK_DISABLED=true
pnpm --filter @loop/api test:integration
```

To also use the services running there (database, MinIO, scanner, Mailpit), set their addresses:

```bash
export DATABASE_URL="postgresql://loop:loop@<docker-host>:5432/loop?schema=public"
export S3_ENDPOINT=http://<docker-host>:9000 S3_ACCESS_KEY_ID=minioadmin S3_SECRET_ACCESS_KEY=minioadmin S3_FORCE_PATH_STYLE=true
export CLAMAV_URL=http://<docker-host>:8080
export SMTP_HOST=<docker-host>
export TESTCONTAINERS_HOST_OVERRIDE=<docker-host>
export E2E_API=1 MAILPIT_URL=http://<docker-host>:8025
```

Windows `cmd`:

```shell
SET DOCKER_HOST=tcp://<docker-host>:2375
SET DATABASE_URL=postgresql://loop:loop@<docker-host>:5432/loop?schema=public
SET TESTCONTAINERS_HOST_OVERRIDE=<docker-host>
SET TESTCONTAINERS_RYUK_DISABLED=true
SET E2E_API=1
SET MAILPIT_URL=http://<docker-host>:8025
```

The Docker daemon's TCP port 2375 is unauthenticated: only use it on a trusted network.

## Admin sign-in without an authenticator app

Admin sign-in uses an emailed code, then a TOTP second factor. During development you can skip installing an
authenticator: pass the base32 key shown on the login screen and the command prints the current 6-digit code and how
long it stays valid:

```bash
pnpm --filter @loop/api totp YOUR_BASE32_KEY
```

The seed creates a development admin (`admin@loop.local`); read its emailed code in Mailpit.
