# syntax=docker/dockerfile:1
FROM node:26-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates     && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

FROM base AS build
# React Router prerender requests http://localhost:<port>; force IPv4 so it matches the listener.
ENV NODE_OPTIONS=--dns-result-order=ipv4first
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN pnpm --filter @loop/api deploy --prod /out
# deploy prunes prisma (devDependency), so carry the generated client across.
RUN pnpm --filter @loop/db exec prisma generate
RUN for src in /repo/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma; do       dst=/out/node_modules/.pnpm/$(basename "$(dirname "$(dirname "$src")")")/node_modules/.prisma;       cp -r "$src" "$dst";     done

# One-shot migration job: needs the Prisma CLI, which the pruned runtime image lacks.
FROM build AS migrate
CMD ["pnpm", "--filter", "@loop/db", "migrate:deploy"]

FROM node:26-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates     && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production APP_ROLE=all PORT=3000
WORKDIR /app
COPY --from=build /out ./
COPY --from=build /repo/apps/web/build/client ./web
COPY --from=build /repo/apps/admin/dist ./admin
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
