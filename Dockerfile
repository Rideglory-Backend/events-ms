# ── Stage 1: BUILD ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /build
COPY rideglory-common-lib ./rideglory-common-lib
COPY rideglory-contracts ./rideglory-contracts

WORKDIR /build/rideglory-common-lib
RUN npm install --ignore-scripts && npm run build

WORKDIR /build/rideglory-contracts
RUN npm install --ignore-scripts && npm run build

WORKDIR /build/events-ms
COPY events-ms/package.json events-ms/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY events-ms/ .
RUN DATABASE_URL=postgresql://x:x@localhost/x pnpm exec prisma generate
RUN pnpm build

# ── Stage 2: RUNTIME ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /build/events-ms

COPY --from=builder /build/events-ms/node_modules ./node_modules
COPY --from=builder /build/events-ms/dist ./dist
COPY events-ms/prisma ./prisma
COPY events-ms/prisma.config.ts ./prisma.config.ts
COPY events-ms/healthcheck.js ./healthcheck.js

USER node

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node healthcheck.js

CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main"]
