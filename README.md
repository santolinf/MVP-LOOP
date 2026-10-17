# LOOP Contractor MVP

pnpm + Turborepo monorepo. See `CLAUDE.md` for architecture rules and the build plan for requirements.

```bash
pnpm install
docker compose up -d
cp .env.example .env
pnpm db:migrate && pnpm db:seed
pnpm dev
```

Run `pnpm lint && pnpm typecheck && pnpm test` before committing.


## Development

### OpenAPI

```bash
pnpm api:generate
```

### e2e

Playwright expects chromium_headless_shell-1248, so to install it, run (once only):

```bash
pnpm --filter @loop/e2e exec playwright install chromium
```

If you have a remote Docker, when needed, then set the following variables:

```bash
DOCKER_HOST=tcp://192.168.1.178:2375
TESTCONTAINERS_HOST_OVERRIDE=192.168.1.178
TESTCONTAINERS_RYUK_DISABLED=true
```
