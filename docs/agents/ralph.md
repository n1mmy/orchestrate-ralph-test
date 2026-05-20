# Ralph loop configuration

Project-specific configuration for the Ralph orchestrator (the
`orchestrate-ralph` skill). Written by `setup-ralph`; edit by hand any time.

The orchestrator and its workers read this file at the start of every run.

## Verification gate

The ordered list of commands every change must pass. A worker runs the gate
before committing; the orchestrator re-runs it on the integration branch after
each wave. Every command must exit zero. Order matters — cheap checks first.

```
pnpm typecheck
pnpm test
pnpm build
```

## Env bootstrap

```
cp .env.example .env
```

A fresh worktree has no `.env` (it is gitignored). The committed
`.env.example` carries placeholder values for `DATABASE_URL`, `APP_PASSWORD`,
`APP_SECRET`, `APP_TZ`, and `GOOGLE_PLACES_API_KEY` — enough for the gate
(`pnpm build` runs with no live `DATABASE_URL` because the Drizzle client is
lazy). The worker performs this step first thing; the orchestrator performs
it before the gate.

## Parallelism

`parallel-safe: true`

Issues carry a `Blocked by:` line naming the tickets they depend on, and the
local-markdown tracker exposes this readably (see the "Ralph loop" section of
`docs/agents/issue-tracker.md`). The dependency DAG is ~7 levels deep across
15 tickets, so the orchestrator can run several tickets per wave.

## Protected paths

Never modified by a worker or the orchestrator:

- `.ralph/` — the orchestrator's worker settings.
- `docs/agents/ralph.md` — this file.
