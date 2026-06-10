# calc — a tiny calculator CLI

A throwaway project for exercising the Ralph orchestrator end to end. `calc`
is a pure-shell CLI; each subcommand is one small, independently-implementable
issue.

## Layout

- `calc.sh` — the dispatcher. Auto-discovers `commands/<name>.sh`; never edited
  to add a command.
- `commands/<name>.sh` — one file per subcommand.
- `tests/<name>.test.sh` — one test file per subcommand.
- `test.sh` — runs every `tests/*.test.sh`.
- `check.sh` — the gate: syntax-checks all scripts, then runs `test.sh`.

## Issues

- `01-add` — the `add` subcommand.
- `02-sub` — the `sub` subcommand.
- `03-mul` — the `mul` subcommand.
- `04-apply` — the `apply` subcommand; dispatches to the other three, so it is
  blocked by 01–03.

`01`–`03` are independent — one parallel wave. `04` runs alone in a second
round once they are `done`.
