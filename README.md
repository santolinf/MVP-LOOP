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

#### Founding concurrency test
Run against a real Postgres container on your Docker host: 3 tests, about 18 seconds.

```bash
DOCKER_HOST=tcp://192.168.1.178:2375 TESTCONTAINERS_RYUK_DISABLED=true pnpm --filter @loop/api test:integration
```


If you have a remote Docker, when needed, then set the following variables:

```shell
SET DOCKER_HOST=tcp://192.168.1.178:2375
SET DATABASE_URL=postgresql://loop:loop@192.168.1.178:5432/loop?schema=public
SET TESTCONTAINERS_HOST_OVERRIDE=192.168.1.178
SET TESTCONTAINERS_RYUK_DISABLED=true
SET E2E_API=1
SET MAILPIT_URL=http://192.168.1.178:8025
```

### Admin TOTP
You can now sign in on desktop without an authenticator app.

__Dev command__: pass the base32 key from the login screen and it prints the current 6-digit code and roughly how long it stays valid:

```bash
pnpm --filter @loop/api totp YOUR_BASE32_KEY
```
