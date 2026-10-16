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
