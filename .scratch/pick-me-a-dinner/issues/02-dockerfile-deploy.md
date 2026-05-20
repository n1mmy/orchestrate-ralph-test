# 02 — Dockerfile, GHCR workflow, startup checks

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

The deployment artifacts for self-hosting on Kubernetes (PRD §3).

A multi-stage **Dockerfile** building the Next.js app with pnpm: a `deps` stage
(`pnpm install --frozen-lockfile`), a `builder` stage (`pnpm build` — Next.js
`standalone` output), and a slim `runner` stage on `node:22-alpine` running as a
non-root `nextjs` user. The runner copies the `.next/standalone` bundle, the
`.next/static` assets, and the `drizzle/` migration files, and its `CMD` **just
runs the app** (`node server.js`) — it does not migrate. Schema migrations are
applied out of band by the operator; the image bundles the migration files only
so the startup schema check can compare them against the DB.

A **GitHub Actions workflow** (`.github/workflows/build.yml`) that builds the
image and pushes it to GHCR (`ghcr.io/<owner>/<repo>`) on push to `main` and on
tags, deriving image tags via `docker/metadata-action` (`latest` + a `sha` tag
on the default branch, a `ref` tag on a tag push) and using GHA build cache.

Two **startup gates**, run from `instrumentation.ts`'s `register()` in the
Node.js runtime. First, the **config check** (`lib/check-env.ts`):
`envProblems` inspects the environment — `DATABASE_URL`, `APP_SECRET`,
`APP_PASSWORD`, `APP_TZ` all required, and `APP_TZ` must be an IANA zone the
runtime's `Intl` accepts — and `checkEnvOnBoot` logs every problem loudly and
`process.exit(1)` on any. Then the **schema check** (`lib/schema-check.ts`): it
counts the migration files bundled in the image (from `drizzle/meta/
_journal.json`) and the migrations the DB has applied (from `drizzle.
__drizzle_migrations`, a brand-new DB's missing schema/table reading as zero).
`schemaCheckResult` decides: a DB **behind** the bundled migrations logs a loud,
specific error ("DB schema N migrations behind — run drizzle-kit migrate") and
`process.exit(1)`, so the pod crash-loops visibly; a DB **ahead** is tolerated;
a **DB unreachable** at boot logs a warning and continues (a transient outage
must not crash-loop the fleet — the `/api/ready` probe holds traffic off the
pod instead). Add the `/api/ready` route handler (`force-dynamic`) returning
200 when `select 1` succeeds and 503 when it fails, for the k8s readiness probe.

Env vars (`DATABASE_URL`, `APP_PASSWORD`, `APP_SECRET`, `APP_TZ`,
`GOOGLE_PLACES_API_KEY` optional) are injected from k8s Secrets; `.env.example`
carries placeholders only. The Postgres connection is plain (no
`sslmode=require`) — TLS terminates at the ingress and the app trusts
`X-Forwarded-Proto`.

## Acceptance criteria

- [ ] The multi-stage Dockerfile builds the app (pnpm, Next.js `standalone`)
      and the slim non-root `runner` `CMD` runs the app only — no migration
      step — bundling the `drizzle/` migration files for the schema check
- [ ] `.github/workflows/build.yml` builds and pushes the image to GHCR on
      push to `main` and on tags
- [ ] On boot, `checkEnvOnBoot` exits non-zero with a loud message on a missing
      required env var or an invalid `APP_TZ`
- [ ] On boot, a DB behind the bundled migrations produces the loud specific
      `schema-check` message and a non-zero exit; a DB at the current migration
      boots normally; an unreachable DB logs a warning and continues
- [ ] The `/api/ready` route returns 200 when the DB is reachable, 503 when not

## Blocked by

- 01 — Walking skeleton: scaffold, schema, design foundation
