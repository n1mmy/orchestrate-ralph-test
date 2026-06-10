#!/usr/bin/env bash
# Test runner — runs every tests/*.test.sh and reports. Each command issue
# adds its own tests/<name>.test.sh; this runner is never edited.
set -uo pipefail

cd "$(cd "$(dirname "$0")" && pwd)"

fail=0
ran=0
for t in tests/*.test.sh; do
  [ -e "$t" ] || continue
  ran=$((ran + 1))
  if bash "$t"; then
    echo "ok   $t"
  else
    echo "FAIL $t"
    fail=1
  fi
done

echo "$ran test file(s) run"
exit "$fail"
