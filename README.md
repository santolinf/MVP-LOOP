# LOOP Contractor MVP

pnpm + Turborepo monorepo. Architecture rules and conventions are in [CLAUDE.md](CLAUDE.md); all other documentation is
under [docs/](docs/README.md).

```bash
pnpm install
docker compose up -d
cp .env.example .env
pnpm db:migrate && pnpm db:seed
pnpm dev
```

Run `pnpm lint && pnpm typecheck && pnpm test` before committing.

| Documentation | Where |
| --- | --- |
| Design and planning (plan, phases, ADRs) | [docs/design-and-planning](docs/design-and-planning/) |
| Local development environment | [docs/local-development](docs/local-development/README.md) |
| Cloud environment (dev/test VM, deploy, CI/CD) | [docs/cloud-environment](docs/cloud-environment/) |
