#!/usr/bin/env bash
# calc — a tiny calculator CLI, used to exercise the Ralph orchestrator.
#
# Subcommands are added one per issue. Each lives in its own file
# commands/<name>.sh and is auto-discovered here — you never edit this
# dispatcher to add a command.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"

usage() {
  echo "usage: calc <command> [args]"
}

cmd="${1:-}"
case "$cmd" in
  "" | -h | --help | help)
    usage
    exit 0
    ;;
esac

file="$here/commands/$cmd.sh"
if [ -f "$file" ]; then
  shift
  bash "$file" "$@"
else
  echo "calc: unknown command: $cmd" >&2
  usage >&2
  exit 1
fi
