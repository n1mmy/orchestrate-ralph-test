# Add the `add` subcommand

Status: ready-for-agent

## What to build

A new subcommand `add` for the `calc` CLI. `calc add A B` prints the integer
sum of two integers A and B.

- Create `commands/add.sh`. It receives the subcommand's arguments as `$1` and
  `$2` and prints their integer sum — `echo "$(( $1 + $2 ))"`.
- Create `tests/add.test.sh` — a test file that invokes
  `bash "$(dirname "$0")/../calc.sh" add ...` and exits non-zero on a mismatch.

Do NOT edit `calc.sh` — it auto-discovers `commands/*.sh`. Do NOT edit
`test.sh` — it auto-discovers `tests/*.test.sh`.

## Acceptance criteria

- [ ] `calc add 2 3` prints `5`
- [ ] `calc add -4 1` prints `-3`
- [ ] `tests/add.test.sh` exists and asserts both cases
- [ ] `bash check.sh` passes
