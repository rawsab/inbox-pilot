FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json biome.json ./
COPY packages ./packages
COPY services ./services
COPY apps ./apps
COPY fixtures ./fixtures
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @inbox-pilot/contracts build \
 && pnpm --filter @inbox-pilot/db build \
 && pnpm --filter @inbox-pilot/parser build \
 && pnpm --filter @inbox-pilot/policy build \
 && pnpm --filter @inbox-pilot/jev build \
 && pnpm --filter @inbox-pilot/gmail build \
 && pnpm --filter @inbox-pilot/api build \
 && pnpm --filter @inbox-pilot/worker build

FROM base AS api
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter @inbox-pilot/db migrate && node services/api/dist/index.js"]

FROM base AS worker
ENV NODE_ENV=production
CMD ["node", "services/worker/dist/index.js"]
