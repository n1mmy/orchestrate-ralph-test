# Add the `sub` subcommand

Status: ready-for-agent

## What to build

A new subcommand `sub` for the `calc` CLI. `calc sub A B` prints `A - B` for
two integers A and B.

- Create `commands/sub.sh`. It receives the arguments as `$1` and `$2` and
  prints the difference — `echo "$(( $1 - $2 ))"`.
- Create `tests/sub.test.sh` — a test file that invokes
  `bash "$(dirname "$0")/../calc.sh" sub ...` and exits non-zero on a mismatch.

Do NOT edit `calc.sh` — it auto-discovers `commands/*.sh`. Do NOT edit
`test.sh` — it auto-discovers `tests/*.test.sh`.

## Acceptance criteria

- [ ] `calc sub 5 3` prints `2`
- [ ] `calc sub 1 4` prints `-3`
- [ ] `tests/sub.test.sh` exists and asserts both cases
- [ ] `bash check.sh` passes
