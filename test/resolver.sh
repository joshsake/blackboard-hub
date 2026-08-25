#!/usr/bin/env bash
# Resolver-contract regression suite (contract_8f9d0915) plus the registry
# rules from contract_d350537b, over the committed targets/ tree. The checks
# themselves live in _resolver-checks.mjs -- they are import-based assertions,
# and node is the honest place for those; this wrapper keeps test:board's
# all-bash chain and its output style.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "resolver + registry test"
if node test/_resolver-checks.mjs; then
  echo
  echo "all checks passed"
else
  echo
  echo "FAILURES"
  exit 1
fi
