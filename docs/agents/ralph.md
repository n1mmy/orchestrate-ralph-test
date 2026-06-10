# Ralph loop configuration

Project-specific configuration for the Ralph orchestrator (the
`orchestrate-ralph` skill). Written by `setup-ralph`; edit by hand any time.

The orchestrator and its workers read this file at the start of every run.

## Verification gate

The ordered list of commands every change must pass. A worker runs the gate
before committing; the orchestrator re-runs it on the integration branch after
each round. Every command must exit zero. Order matters — cheap checks first.

```
bash check.sh
```

`check.sh` is the project's single gate: it `bash -n` syntax-checks every
script (`calc.sh`, `test.sh`, `check.sh`, `commands/*.sh`, `tests/*.test.sh`),
then runs `test.sh`, which executes every `tests/*.test.sh`.

## Env bootstrap

None.

<!-- If a fresh worktree needs a step before the gate will pass — e.g.
materialising a gitignored `.env` from a committed `.env.example` — describe
that one step here, and delete the "None." line above. The worker performs it
first thing; the orchestrator performs it before the gate. -->

## Parallelism

`parallel-safe: true`

<!-- True because the issue tracker exposes a dependency relation the
orchestrator can read: a `**Blocked by:** #N` line in each issue body (see the
"Ralph loop" section of `docs/agents/issue-tracker.md`). This repo does NOT use
GitHub's native issue dependencies — the body line is the machine-readable
convention. Set `false` to force single-worker mode. -->

## Protected paths

Never modified by a worker or the orchestrator:

- `.ralph/` — the orchestrator's worker settings.
- `docs/agents/ralph.md` — this file.
