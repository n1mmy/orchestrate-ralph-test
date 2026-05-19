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
pnpm lint
pnpm test
pnpm build
```

The DB integration suite (`pnpm test:db`) is deliberately **not** in the gate —
it needs a live Postgres server, which a worker worktree does not have. The
unit suite (`pnpm test`) runs DB-free; the lazy `postgres-js` client and
`force-dynamic` data pages let `pnpm build` succeed with no `DATABASE_URL`.

## Env bootstrap

A fresh worktree checks out committed source only — `node_modules/` and `.env`
are gitignored. Before the gate will pass, perform in order:

1. `pnpm install` — install dependencies into this worktree.
2. `cp .env.example .env` — materialise the env file from the committed
   template. Skip if `.env.example` is absent: the scaffold issue (01) is what
   creates it, so until that issue lands there is nothing to copy.

The worker performs these first thing; the orchestrator performs them before
the gate.

## Parallelism

`parallel-safe: true`

The issue tracker exposes a dependency relation the orchestrator can read —
each issue's `## Blocked by` section, see the "Ralph loop" section of
`docs/agents/issue-tracker.md`. An issue is eligible for a wave only once every
issue it is blocked by has `Status: done`, so parallel waves are safe: no
worker is dispatched against an unmerged dependency.

## Protected paths

Never modified by a worker or the orchestrator:

- `.ralph/` — the orchestrator's worker settings.
- `docs/agents/ralph.md` — this file.
