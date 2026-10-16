# syntax=docker/dockerfile:1
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @loop/db generate && pnpm build
RUN pnpm --filter @loop/api deploy --prod /out

FROM node:24-slim AS runtime
ENV NODE_ENV=production APP_ROLE=all PORT=3000
WORKDIR /app
COPY --from=build /out ./
COPY --from=build /repo/apps/web/build ./web
COPY --from=build /repo/apps/admin/dist ./admin
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
