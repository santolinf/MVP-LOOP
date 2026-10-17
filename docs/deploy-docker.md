# Deploying LOOP on Docker

One image runs the API, the contractor web site, the admin portal and the background worker (`APP_ROLE=all`).
`docker-compose.prod.yml` adds Postgres and a one-shot migration job. There is no seeding and there are no
backing services (MinIO, ClamAV, Mailpit).

| Service    | Image / target        | Purpose                                              |
| ---------- | --------------------- | ---------------------------------------------------- |
| `postgres` | `postgres:17`         | Database. Not published to the host.                 |
| `migrate`  | Dockerfile `migrate`  | Runs `prisma migrate deploy`, then exits.            |
| `app`      | Dockerfile `runtime`  | `/api/v1`, web at `/`, admin at `/admin/`, pg-boss.  |

Start order is enforced: `postgres` healthy → `migrate` exits 0 → `app` starts.

## First deployment

```bash
cp .env.prod.example .env.prod
# edit .env.prod: replace every CHANGE_ME (see below)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Targeting a remote daemon: `export DOCKER_HOST=tcp://<host>:2375` first (the build context is sent to it).

## Environment variables (`.env.prod`)

| Variable            | Required | Notes                                                                   |
| ------------------- | -------- | ----------------------------------------------------------------------- |
| `POSTGRES_USER`     | yes      | Also used to build `DATABASE_URL`.                                      |
| `POSTGRES_PASSWORD` | yes      | **Must be URL-safe** (use `openssl rand -hex 16`); it is placed in a URL. |
| `POSTGRES_DB`       | yes      |                                                                         |
| `SESSION_SECRET`    | yes      | ≥ 32 chars, enforced at boot. `openssl rand -hex 32`.                    |
| `JWT_SECRET`        | yes      | ≥ 32 chars, enforced at boot.                                           |
| `PUBLIC_BASE_URL`   | yes      | Public origin, no trailing slash. Used in referral links.               |
| `APP_PORT`          | no       | Host port, default 3000.                                                |
| `LOOP_TAG`          | no       | Image tag, default `latest`.                                            |
| `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT` | no | Without `SMTP_HOST`, sign-in emails are not sent.        |

`NODE_ENV`, `APP_ROLE`, `PORT` and `DATABASE_URL` are set by the compose file. Never commit `.env.prod`
(it is gitignored). Payouts, profit-sharing and agency flags stay off in production.

## Verify

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps -a   # app healthy, migrate Exited (0)
curl http://<host>:3000/api/v1/health            # {"status":"ok"}
curl http://<host>:3000/api/v1/public/config     # flags all false, founding claimed 0
```

Then open `http://<host>:3000/` and `http://<host>:3000/admin/`.

## Operations

- **Update:** `git pull`, then re-run the `up -d --build` command. `migrate` re-runs and applies only new migrations.
- **Logs:** `docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f app`
- **Stop:** `... down` keeps data. `... down -v` **deletes the database volume**.
- **Backup:** `docker exec loop-prod-postgres-1 pg_dump -U <user> <db> > loop.sql`

## Gotchas

- The compose project is named `loop-prod` so its volume (`loop-prod_pgdata`) never collides with the
  dev stack's `loop_pgdata`. Reusing a volume created with a different password fails with `P1000`.
- Port 3000 must be free on the host, or change `APP_PORT`.
- `docker compose down` then `up` on a clean volume re-applies all migrations; verified from scratch.
- Plain HTTP is fine for testing. For real use, put a TLS-terminating proxy or load balancer in front and
  set `PUBLIC_BASE_URL` to the `https://` origin.
- Known, harmless: Node logs `MODULE_TYPELESS_PACKAGE_JSON` at start.

## Automating this

See [ci-cd-pipeline.md](ci-cd-pipeline.md) for the CI/CD design, secrets, deploy job, smoke tests and rollback.

## Not covered yet

AWS (ECS Fargate, RDS, S3, Secrets Manager via CDK in `infra/`), object storage, malware scanning, and a
DB-aware readiness check (`/api/v1/health` currently only reports process liveness).
