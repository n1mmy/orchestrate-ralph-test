# syntax=docker/dockerfile:1.7
#
# Multi-stage image for Pick Me a Dinner. The runner just runs the app —
# `node server.js` — and never migrates. Schema migrations are applied out of
# band by the operator with `pnpm db:migrate`; the image bundles `drizzle/`
# only so the boot-time schema check can compare the bundled migration count
# against `drizzle.__drizzle_migrations` in the DB.

# ----- deps: install pnpm and the locked dependency tree ---------------------
FROM node:22-alpine AS deps
WORKDIR /app

RUN apk add --no-cache libc6-compat
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ----- builder: produce the Next.js `standalone` bundle ----------------------
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ----- runner: slim image, non-root, runs the app only ----------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user — the runner never needs root and writing into the image as
# `nextjs` keeps an exploited process from rewriting the bundle.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# The standalone bundle bakes in only the traced subset of `node_modules` Next
# needs to boot, so the runner image stays small.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Bundle the migration files so the boot-time schema-check can read
# `drizzle/meta/_journal.json` and count them. The runner does NOT apply them.
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
