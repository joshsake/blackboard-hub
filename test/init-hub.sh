#!/usr/bin/env bash
# init-hub is destructive by purpose, so its safety property is the one under
# test: DRY-RUN (the default) must change NOTHING, byte for byte, and --force
# must do exactly what it printed it would. Runs against a fixture tree via
# --root; the real checkout is never touched.
set -euo pipefail
cd "$(dirname "$0")/.."

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

fail=0
check () {
  if [ "$2" = "$3" ]; then echo "  PASS  $1"
  else echo "  FAIL  $1 -- got '$2', want '$3'"; fail=1; fi
}

echo "init-hub test"

# A fixture shaped like an instantiated template: board history, machine
# registrations, two engagement targets plus the example proof target.
mkdir -p "$TMP/board/entries" "$TMP/board/registrations" \
         "$TMP/targets/example" "$TMP/targets/wayfarer/api" "$TMP/targets/other"
echo '{"id":"finding_00000001","seq":"2026-01-01"}' > "$TMP/board/entries/api.jsonl"
echo '{"id":"task_00000002","seq":"2026-01-02"}'    > "$TMP/board/entries/hub.jsonl"
echo '{"lane":"api"}' > "$TMP/board/registrations/api.json"
echo '{"name":"example","deployedUrl":"https://example.com"}' > "$TMP/targets/example/target.json"
echo '{"name":"wayfarer"}' > "$TMP/targets/wayfarer/target.json"
echo 'spec' > "$TMP/targets/wayfarer/api/routes.spec.ts"
echo '{"name":"other"}' > "$TMP/targets/other/target.json"
echo '{"default":"wayfarer"}' > "$TMP/targets/config.json"

# Byte-level fingerprint: every path plus every file's content hash.
snapshot () {
  (cd "$TMP" && find . | LC_ALL=C sort && find . -type f | LC_ALL=C sort | xargs shasum)
}

before=$(snapshot)
out=$(node bin/init-hub.mjs --root "$TMP")
after=$(snapshot)

check "dry-run exits 0 and changes nothing" "$after" "$before"
case "$out" in
  *"DRY RUN"*) echo "  PASS  dry-run says it is a dry run" ;;
  *) echo "  FAIL  dry-run output never says DRY RUN"; fail=1 ;;
esac
case "$out" in
  *would*) echo "  PASS  dry-run lists what it would do" ;;
  *) echo "  FAIL  dry-run lists no would-actions"; fail=1 ;;
esac

if node bin/init-hub.mjs --root "$TMP" --bogus >/dev/null 2>&1
then echo "  FAIL  unknown flag accepted"; fail=1
else echo "  PASS  unknown flag rejected"; fi

forced=$(node bin/init-hub.mjs --root "$TMP" --force)
check "force removes board entries"       "$(ls "$TMP/board/entries" | wc -l | tr -d ' ')" "0"
check "force removes registrations"       "$(ls "$TMP/board/registrations" | wc -l | tr -d ' ')" "0"
check "force keeps only the example target" "$(ls "$TMP/targets" | grep -v config.json | tr '\n' ' ' | xargs)" "example"
check "force resets the default target" \
  "$(node -e "console.log(JSON.parse(require('fs').readFileSync('$TMP/targets/config.json','utf8')).default)")" "example"
case "$forced" in
  *"Next steps"*) echo "  PASS  force prints next steps" ;;
  *) echo "  FAIL  force output has no next steps"; fail=1 ;;
esac

# Idempotent: a second force finds a blank hub and destroys nothing further.
again=$(node bin/init-hub.mjs --root "$TMP" --force)
case "$again" in
  *"nothing to do"*) echo "  PASS  second force is a no-op" ;;
  *) echo "  FAIL  second force still acts"; fail=1 ;;
esac

echo
[ "$fail" -eq 0 ] && echo "all checks passed" || { echo "FAILURES"; exit 1; }
