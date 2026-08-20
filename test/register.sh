#!/usr/bin/env bash
# Lane self-registration. A lane declares where it is running; the hub does not
# predict it. This exists because the first real dispatch attempt failed: the
# lane session was opened somewhere the path convention never anticipated, and
# every path-based matcher missed it silently.
set -euo pipefail
cd "$(dirname "$0")/.."

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/entries"
cp board/lanes.json "$TMP/lanes.json"
export BLACKBOARD_DIR="$TMP"
b () { node bin/board.mjs "$@"; }

fail=0
check () {
  if [ "$2" = "$3" ]; then echo "  PASS  $1"
  else echo "  FAIL  $1 -- got '$2', want '$3'"; fail=1; fi
}

echo "registration test"

# Everything starts unregistered, and says so rather than looking configured.
none=$(b registrations --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>
  console.log(JSON.parse(d).filter(r=>r.registeredAt).length))')
check "nothing is registered initially" "$none" "0"

if b register --lane nope >/dev/null 2>&1
then echo "  FAIL  unknown lane accepted"; fail=1; else echo "  PASS  unknown lane rejected"; fi

if b register --lane api --cwd "$TMP/definitely-not-here" >/dev/null 2>&1
then echo "  FAIL  nonexistent cwd accepted"; fail=1; else echo "  PASS  nonexistent cwd rejected"; fi

# The whole point: a lane may register from a location the registry never
# predicted, and status must then follow the lane rather than the guess.
# Compare against node's view of the path: Git Bash rewrites POSIX-style
# arguments into Windows form, and node is what actually records the value.
HERE=$(node -e 'console.log(process.cwd())')
b register --lane api >/dev/null

read -r cwd branch < <(b registrations --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const r=JSON.parse(d).find(x=>x.lane==="api");
  console.log(r.cwd, r.branch);
})')
check "registered cwd is recorded"    "$cwd" "$HERE"
check "branch is derived, not typed"  "$branch" "$(git rev-parse --abbrev-ref HEAD)"

followed=$(b status --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const r=JSON.parse(d).find(x=>x.lane==="api");
  console.log(r.registered ? r.registered.cwd : "none");
})')
check "status follows the registration" "$followed" "$HERE"

# Re-registering must move the lane, not append a second conflicting record.
b register --lane api --cwd "$HERE/tests" >/dev/null
count=$(b registrations --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>
  console.log(JSON.parse(d).filter(r=>r.lane==="api" && r.registeredAt).length))')
check "re-registering replaces, not duplicates" "$count" "1"

# The hub compares a session's reported cwd against cwdKey, so backslash and
# case variants of the same path must collapse to one key.
keys=$(b registrations --json | node test/_cwdkey-check.mjs)
check "backslash+uppercase path folds to the same key" "$keys" "match"

still=$(b status --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const r=JSON.parse(d).find(x=>x.lane==="ui");
  console.log(r.registered === null ? "unregistered" : "registered");
})')
check "other lanes stay unregistered" "$still" "unregistered"

echo
[ "$fail" -eq 0 ] && echo "all checks passed" || { echo "FAILURES"; exit 1; }
