# CI/CD pipeline for the Docker deployment

Turns the manual steps in [deploy-docker.md](deploy-docker.md) into an automated pipeline. Nothing here is
implemented yet beyond `.github/workflows/ci.yml` (verify only); `deploy.yml` is a stub with a `TODO(spec)`.

## Pipeline overview

| Stage    | Trigger                    | What it does                                                    | Gate                        |
| -------- | -------------------------- | --------------------------------------------------------------- | --------------------------- |
| Verify   | every push / PR            | install, `db generate`, `lint`, `typecheck`, `test`             | must pass to merge          |
| Build    | push to `main` (or tag)    | `docker build` both targets (`runtime`, `migrate`)              | Verify green                |
| Deploy   | after Build, manual approval for prod | `compose up -d` on the target host; migrations run first | GitHub Environment approval |
| Smoke    | after Deploy               | health, `/`, `/admin/`, `/my-loop`, public config flags         | fails the run + alerts      |

Verify is already in `ci.yml`. Add `pnpm e2e` (spec C2) to Verify or a separate job when user journeys change.

## Facts the pipeline relies on

- **Images:** one Dockerfile, targets `migrate` (runs `prisma migrate deploy`) and `runtime` (`node dist/main.js`, user `node`, port 3000).
  `runtime` runs everything with `APP_ROLE=all`; later split into `api` and `worker` with the same image.
- **Compose:** `docker-compose.prod.yml`, project name `loop-prod`. Order is enforced: postgres healthy → migrate exits 0 → app.
- **Config:** all from `.env.prod` (see the variable table in deploy-docker.md). **Never in the repo.** CI must create it on the target host or inject it.
- **Seeding:** never in the pipeline. Flags for payouts, profit sharing and agency stay off.
- **Health:** `GET /api/v1/health` → `{"status":"ok"}`. Liveness only; it does not check the DB.
- **Node/pnpm:** Node from `.nvmrc` (24), `pnpm@12.11.2` from `packageManager`.

## Secrets and variables (GitHub Environment `production`)

| Name                  | Kind     | Used for                                                      |
| --------------------- | -------- | ------------------------------------------------------------- |
| `DEPLOY_HOST`         | variable | Docker host address                                           |
| `DEPLOY_USER`         | variable | SSH user on the host                                          |
| `DEPLOY_SSH_KEY`      | secret   | Private key for that user                                     |
| `DEPLOY_SSH_KNOWN_HOSTS` | secret | Pinned host key (avoid `ssh-keyscan` at run time)            |
| `ENV_PROD`            | secret   | Full contents of `.env.prod`                                  |
| `PUBLIC_BASE_URL`     | variable | Smoke-test target, e.g. `https://loop.example.com`            |

Set the Environment to require a reviewer. Rotate `SESSION_SECRET`/`JWT_SECRET` deliberately: changing them logs everyone out.
`POSTGRES_PASSWORD` must never change on an existing volume (it is only read when the volume is first created).

## Reaching the Docker host

The current host uses `tcp://192.168.1.178:2375`: **unauthenticated and plain text, and a private LAN address.**
A GitHub-hosted runner cannot reach it and it must not be exposed to the internet (it is root on the host).
Use one of:

1. **Docker over SSH (recommended):** `DOCKER_HOST=ssh://$DEPLOY_USER@$DEPLOY_HOST`. Needs Docker CLI on the runner and SSH access to the host.
2. **Self-hosted runner on the LAN:** keep `tcp://` but only on that trusted network.
3. **Registry pull (best for AWS later):** CI builds and pushes images; the host only pulls. See "Registry variant".

## Deploy job (SSH variant)

Sketch for `.github/workflows/deploy.yml`. Not yet applied.

```yaml
name: deploy
on:
  push: { branches: [main] }
  workflow_dispatch:

concurrency: { group: deploy-production, cancel-in-progress: false }

jobs:
  verify:
    uses: ./.github/workflows/ci.yml        # add `workflow_call:` to ci.yml's triggers

  deploy:
    needs: verify
    runs-on: ubuntu-latest
    environment: production                 # approval gate
    env:
      DOCKER_HOST: ssh://${{ vars.DEPLOY_USER }}@${{ vars.DEPLOY_HOST }}
      LOOP_TAG: ${{ github.sha }}
      COMPOSE: docker compose -f docker-compose.prod.yml --env-file .env.prod
    steps:
      - uses: actions/checkout@v4

      - name: SSH setup
        run: |
          install -m 700 -d ~/.ssh
          echo "${{ secrets.DEPLOY_SSH_KEY }}" > ~/.ssh/id_ed25519 && chmod 600 ~/.ssh/id_ed25519
          echo "${{ secrets.DEPLOY_SSH_KNOWN_HOSTS }}" > ~/.ssh/known_hosts

      - name: Write .env.prod (runner only, never committed)
        run: |
          printf '%s\n' "${{ secrets.ENV_PROD }}" > .env.prod
          echo "LOOP_TAG=${LOOP_TAG}" >> .env.prod

      - name: Build and start (migrate runs first)
        run: $COMPOSE up -d --build --remove-orphans

      - name: Wait for healthy
        run: |
          for i in $(seq 1 30); do
            s=$($COMPOSE ps app --format '{{.Health}}')
            [ "$s" = healthy ] && exit 0
            sleep 5
          done
          $COMPOSE logs --tail=100 app migrate; exit 1

      - name: Smoke test
        run: |
          B=${{ vars.PUBLIC_BASE_URL }}
          curl -fsS $B/api/v1/health | grep '"ok"'
          for p in / /admin/ /my-loop; do curl -fsS -o /dev/null $B$p; done
          curl -fsS $B/api/v1/public/config | grep -q '"payouts[^}]*true' && { echo "flag on"; exit 1; } || true

      - name: Cleanup
        if: always()
        run: rm -f .env.prod ~/.ssh/id_ed25519
```

Notes:
- Do **not** use `down -v` or `--force-recreate` for postgres in the pipeline; `down -v` deletes the database.
- `--remove-orphans` is project-scoped (`loop-prod`), so it will not touch the dev stack.
- Tagging images with the commit SHA (`LOOP_TAG`) gives a rollback handle.

## Registry variant (recommended before AWS)

Requires a small compose change (not made yet): give `app` and `migrate` `image:` references to a registry
(e.g. `ghcr.io/<org>/loop:${LOOP_TAG}`) and keep `build:` only in a separate `docker-compose.build.yml` override.

1. Build job: `docker/build-push-action` for `target: runtime` and `target: migrate`, tags `:${sha}` and `:main`, with buildx layer cache.
2. Scan the images (e.g. Trivy) and fail on critical findings.
3. Deploy job: `compose pull && compose up -d`. The host never builds.

For ECS Fargate the same two images apply: run `migrate` as a one-off task before updating the service, and run
the `runtime` image with `APP_ROLE=all` or separate `api`/`worker` services. Config comes from Secrets Manager
instead of `.env.prod`. That work lives in `infra/` and the `deploy.yml` TODO (OIDC role in eu-west-2, `cdk deploy`).

## Rollback

- **App only:** redeploy the previous SHA: `LOOP_TAG=<old-sha> $COMPOSE up -d --build`.
- **Migrations are forward-only** (Prisma). Never edit an applied migration. If a bad migration shipped, restore from backup or add a corrective migration.
- **Before every deploy that includes new migrations**, take a dump (add as a pipeline step):
  `docker exec loop-prod-postgres-1 pg_dump -U $POSTGRES_USER $POSTGRES_DB | gzip > loop-$(date +%F-%H%M).sql.gz`
  and store it off-host.

## Checklist to implement

1. Add `workflow_call` to `ci.yml`; optionally add an e2e job.
2. Create the `production` Environment, reviewers, and the secrets/variables above.
3. Decide the host access route (SSH vs self-hosted runner vs registry).
4. Replace the stub `deploy.yml` with the sketch; test on a non-prod host first.
5. Add the pre-migration backup step and off-host storage.
6. Optional hardening: DB-aware readiness endpoint, image scanning, Slack/email notification on failure.

## Cautions

- The pipeline needs the host to have Docker Compose v2 and enough disk for image builds (`docker image prune -f` after deploy).
- Never print `.env.prod` or echo secrets; GitHub masks secrets but multi-line values should be set as a single secret and written with `printf`.
- Per CLAUDE.md, adding infrastructure (registry, scanners, secrets stores) should be flagged and agreed first.
