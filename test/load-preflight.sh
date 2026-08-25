#!/usr/bin/env bash
# Regression suite for the k6 preflight's skip semantics (contract_feda9def).
# Every clause here was once verified only by an author demo quoted in a
# finding; this makes them repeatable checks (task_562c1646, from the first
# audit's UNCOVERED list).
#
# CI-safe by construction: nothing sends a byte beyond 127.0.0.1 and no k6
# profile ever runs -- k6 is exercised through `k6 inspect`, which parses the
# init context and makes no requests. The k6-dependent checks SKIP visibly
# when k6 is not installed; the node-level preflight checks always run.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
check () { # check <label> <actual> <expected>
  if [ "$2" = "$3" ]; then echo "  PASS  $1"
  else echo "  FAIL  $1 -- got '$2', want '$3'"; fail=1; fi
}
has () { # has <label> <haystack> <needle>
  if printf '%s' "$2" | grep -qF "$3"; then echo "  PASS  $1"
  else echo "  FAIL  $1 -- output lacks '$3'"; fail=1; fi
}

# The unmistakable-skip line every skip case must carry verbatim.
NOT_A_PASS='SKIPPED is not a pass: 0 requests were sent, nothing was measured.'

# Env hygiene: the suite must behave the same on a workstation with
# BASE_URL/TARGET exported as it does in CI.
pf () { env -u BASE_URL -u TARGET -u APP_DIR "$@" node tests/load/preflight.mjs baseline; }

echo "load preflight skip-semantics test"

# 1. Default target resolves local-build; the preflight never builds or
#    starts apps and must skip deterministically with zero traffic.
rc=0; out=$(pf 2>&1) || rc=$?
check "local-build resolution skips with exit 0" "$rc" "0"
has "local-build skip names the mode" "$out" "resolved to local-build"
has "local-build skip is unmistakable" "$out" "$NOT_A_PASS"

# 2. A journey-less target (example ships without targets/example/load/)
#    skips before any probe.
rc=0; out=$(pf TARGET=example 2>&1) || rc=$?
check "journey-less target skips with exit 0" "$rc" "0"
has "journey-less skip names the missing file" "$out" "has no load journeys (expected targets/example/load/journeys.json)"
has "journey-less skip is unmistakable" "$out" "$NOT_A_PASS"
has "resolver fallback note is printed" "$out" "falling back to deployedUrl"

# 3. A reachable-shaped but dead loopback URL: bind an ephemeral port to
#    learn a number, release it, probe the now-closed port.
PORT=$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>console.log(p))})')
rc=0; out=$(pf BASE_URL="http://127.0.0.1:$PORT" 2>&1) || rc=$?
check "unreachable target skips with exit 0" "$rc" "0"
has "unreachable skip names the probe" "$out" "did not answer the preflight probe"
has "unreachable skip is unmistakable" "$out" "$NOT_A_PASS"

# 4. Misconfiguration is loud, never a skip.
rc=0; out=$(pf TARGET=definitely-not-a-target 2>&1) || rc=$?
check "unknown TARGET exits 1" "$rc" "1"
has "unknown TARGET is a named resolver error" "$out" 'target "definitely-not-a-target" not found'

rc=0; out=$(env -u BASE_URL node tests/load/preflight.mjs no-such-profile 2>&1) || rc=$?
check "unknown profile exits 1" "$rc" "1"
has "unknown profile names the valid ones" "$out" "smoke, baseline, stress"

# 5. Direct-k6 guards, via `k6 inspect` only (init/parse, zero requests).
if command -v k6 >/dev/null 2>&1; then
  rc=0; out=$(k6 inspect tests/load/smoke.js 2>&1) || rc=$?
  check "direct k6 without BASE_URL aborts non-zero" "$([ "$rc" -ne 0 ] && echo nonzero)" "nonzero"
  has "no-BASE_URL abort says why" "$out" "BASE_URL is not set"

  rc=0; out=$(k6 inspect -e BASE_URL=deployed -e TARGET=wayfarer tests/load/smoke.js 2>&1) || rc=$?
  check "literal BASE_URL=deployed is rejected by k6 side" "$([ "$rc" -ne 0 ] && echo nonzero)" "nonzero"
  has "sentinel rejection says who resolves it" "$out" "resolver sentinel"

  rc=0; out=$(k6 inspect -e BASE_URL=https://something.vercel.app -e TARGET=wayfarer tests/load/stress.js 2>&1) || rc=$?
  check "stress refuses a vercel.app host" "$([ "$rc" -ne 0 ] && echo nonzero)" "nonzero"
  has "vercel refusal is absolute" "$out" "stress profile refuses"

  rc=0; out=$(k6 inspect -e BASE_URL=https://example.com -e TARGET=wayfarer tests/load/stress.js 2>&1) || rc=$?
  check "stress refuses non-loopback without the ack" "$([ "$rc" -ne 0 ] && echo nonzero)" "nonzero"
  has "non-loopback refusal names the ack" "$out" "STRESS_ALLOW_REMOTE"

  rc=0; k6 inspect -e BASE_URL=https://example.com -e TARGET=wayfarer -e STRESS_ALLOW_REMOTE=i-own-this-target tests/load/stress.js >/dev/null 2>&1 || rc=$?
  check "stress parses on a non-loopback host with the ack" "$rc" "0"

  # Journey wiring: every profile parses with the wayfarer data via open().
  for p in smoke baseline stress; do
    rc=0; k6 inspect -e BASE_URL=http://localhost:3000 -e TARGET=wayfarer "tests/load/$p.js" >/dev/null 2>&1 || rc=$?
    check "$p parses with wayfarer journeys on loopback" "$rc" "0"
  done

  rc=0; out=$(k6 inspect -e BASE_URL=http://localhost:3000 -e TARGET=example tests/load/smoke.js 2>&1) || rc=$?
  check "direct k6 on a journey-less target fails loudly" "$([ "$rc" -ne 0 ] && echo nonzero)" "nonzero"
  has "journey-less direct failure names the expected file" "$out" "targets/example/load/journeys.json"
else
  echo "  SKIP  k6 not installed -- 14 direct-k6 guard checks not run (preflight checks above still cover the npm path)"
fi

echo
if [ "$fail" -ne 0 ]; then echo "FAILURES in load preflight test"; exit 1; fi
echo "all checks passed"
