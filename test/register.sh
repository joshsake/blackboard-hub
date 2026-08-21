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

# Compare against node's view of the path: Git Bash rewrites POSIX-style
# arguments into Windows form, and node is what actually records the value.
HERE=$(node -e 'console.log(process.cwd())')

# Everything starts unregistered, and says so rather than looking configured.
none=$(b registrations --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>
  console.log(JSON.parse(d).filter(r=>r.registeredAt).length))')
check "nothing is registered initially" "$none" "0"

if b register --lane nope >/dev/null 2>&1
then echo "  FAIL  unknown lane accepted"; fail=1; else echo "  PASS  unknown lane rejected"; fi

if b register --lane api --worktree "$TMP/definitely-not-here" >/dev/null 2>&1
then echo "  FAIL  nonexistent worktree accepted"; fail=1
else echo "  PASS  nonexistent worktree rejected"; fi

# --cwd let a lane record a directory that was not its own, which silently made
# it unroutable. It must refuse, not be quietly ignored.
if b register --lane api --cwd "$HERE" >/dev/null 2>&1
then echo "  FAIL  --cwd still accepted"; fail=1; else echo "  PASS  --cwd rejected"; fi

b register --lane api >/dev/null

read -r cwd branch hasworktree < <(b registrations --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const r=JSON.parse(d).find(x=>x.lane==="api");
  console.log(r.cwd, r.branch, r.worktree ? "yes" : "no");
})')
check "registered cwd is recorded"    "$cwd" "$HERE"
check "branch is derived, not typed"  "$branch" "$(git rev-parse --abbrev-ref HEAD)"

# The split: cwd is where the SESSION runs, worktree is where the WORK is.
# They are different directories on any machine where sessions are launched
# outside the lane checkouts, so one field cannot serve both callers.
check "worktree is recorded alongside cwd" "$hasworktree" "yes"

followed=$(b status --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const r=JSON.parse(d).find(x=>x.lane==="api");
  console.log(r.registered ? r.registered.cwd : "none");
})')
check "status follows the registration" "$followed" "$HERE"

# Re-registering must move the lane, not append a second conflicting record.
b register --lane api --worktree "$HERE/tests" >/dev/null
count=$(b registrations --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>
  console.log(JSON.parse(d).filter(r=>r.lane==="api" && r.registeredAt).length))')
check "re-registering replaces, not duplicates" "$count" "1"

# The hub compares a session's reported cwd against cwdKey, so backslash and
# case variants of the same path must collapse to one key.
keys=$(b registrations --json | node test/_cwdkey-check.mjs)
check "backslash+uppercase path folds to the same key" "$keys" "match"

# A separate repository entirely proves two things at once: status derives git
# state from --worktree and not from cwd, and a worktree outside the hub repo
# is flagged rather than reported as though it were this project. Before the
# split, a lane pointed at an unrelated checkout reported a clean branch and
# nothing said otherwise.
FOREIGN="$TMP/foreign"
mkdir -p "$FOREIGN"
git -C "$FOREIGN" init -q -b elsewhere
git -C "$FOREIGN" -c user.email=t@example.com -c user.name=t commit -q --allow-empty -m init
b register --lane api --worktree "$FOREIGN" >/dev/null

read -r wbranch wforeign < <(b status --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const r=JSON.parse(d).find(x=>x.lane==="api");
  console.log(r.git.branch, r.git.foreign);
})')
check "git state comes from worktree, not cwd"   "$wbranch"  "elsewhere"
check "worktree outside the hub repo is flagged" "$wforeign" "true"

# ...and the routing half is untouched by any of it.
routed=$(b registrations --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const r=JSON.parse(d).find(x=>x.lane==="api");
  console.log(r.cwd);
})')
check "cwd still points at the session" "$routed" "$HERE"

still=$(b status --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const r=JSON.parse(d).find(x=>x.lane==="ui");
  console.log(r.registered === null ? "unregistered" : "registered");
})')
check "other lanes stay unregistered" "$still" "unregistered"

echo
[ "$fail" -eq 0 ] && echo "all checks passed" || { echo "FAILURES"; exit 1; }
