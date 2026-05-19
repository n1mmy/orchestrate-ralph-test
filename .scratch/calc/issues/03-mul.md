# Add the `mul` subcommand

Status: ready-for-agent

## What to build

A new subcommand `mul` for the `calc` CLI. `calc mul A B` prints `A * B` for
two integers A and B.

- Create `commands/mul.sh`. It receives the arguments as `$1` and `$2` and
  prints the product — `echo "$(( $1 * $2 ))"`.
- Create `tests/mul.test.sh` — a test file that invokes
  `bash "$(dirname "$0")/../calc.sh" mul ...` and exits non-zero on a mismatch.

Do NOT edit `calc.sh` — it auto-discovers `commands/*.sh`. Do NOT edit
`test.sh` — it auto-discovers `tests/*.test.sh`.

## Acceptance criteria

- [ ] `calc mul 4 3` prints `12`
- [ ] `calc mul -2 5` prints `-10`
- [ ] `tests/mul.test.sh` exists and asserts both cases
- [ ] `bash check.sh` passes
