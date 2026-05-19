# Add the `apply` subcommand

Status: ready-for-agent
Blocked by: 01-add, 02-sub, 03-mul

## What to build

A new subcommand `apply` for the `calc` CLI. `calc apply OP A B` runs the `OP`
subcommand on A and B — e.g. `calc apply add 2 3` prints `5`. It dispatches to
the `add` / `sub` / `mul` command files, so it depends on issues 01–03.

- Create `commands/apply.sh`. The first argument is the operation name; the
  rest are its arguments. Dispatch to the matching command file:
  `op="$1"; shift; exec bash "$(dirname "$0")/$op.sh" "$@"`.
- Create `tests/apply.test.sh` — a test file that invokes
  `bash "$(dirname "$0")/../calc.sh" apply ...` and exits non-zero on a
  mismatch.

Do NOT edit `calc.sh` — it auto-discovers `commands/*.sh`. Do NOT edit
`test.sh` — it auto-discovers `tests/*.test.sh`.

## Acceptance criteria

- [ ] `calc apply add 2 3` prints `5`
- [ ] `calc apply mul 4 3` prints `12`
- [ ] `tests/apply.test.sh` exists and asserts both cases
- [ ] `bash check.sh` passes
