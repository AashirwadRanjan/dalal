#!/bin/bash
# One command for all checks:  scripts/test.sh          engine tests + web typecheck
#                              scripts/test.sh --build  also run the production build
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

[[ -x .venv/bin/python ]] || { echo "Missing .venv. Create it first (see README)." >&2; exit 1; }

echo "== engine tests"
.venv/bin/python -m unittest discover -s engine/tests -t .

echo "== web typecheck"
(cd web && npx tsc --noEmit -p .)

if [[ "${1:-}" == "--build" ]]; then
  echo "== web build"
  (cd web && npm run build)
fi
echo "All checks passed."
