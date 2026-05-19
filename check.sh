#!/usr/bin/env bash
# Gate — syntax-check every script, then run the test suite.
set -euo pipefail

cd "$(cd "$(dirname "$0")" && pwd)"

echo "[check] syntax"
for f in calc.sh test.sh check.sh commands/*.sh tests/*.test.sh; do
  [ -e "$f" ] || continue
  bash -n "$f"
done

echo "[check] tests"
bash test.sh

echo "[check] ok"
