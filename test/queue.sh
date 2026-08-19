#!/usr/bin/env bash
# Verification for blockers, human-queue fan-out, and derived per-layer status.
# Runs against a throwaway board so it never touches real shared state.
set -euo pipefail
cd "$(dirname "$0")/.."

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/entries"
cp board/layers.json "$TMP/layers.json"
export BLACKBOARD_DIR="$TMP"
b () { node bin/board.mjs "$@"; }

fail=0
check () { # check <label> <actual> <expected>
  if [ "$2" = "$3" ]; then echo "  PASS  $1"
  else echo "  FAIL  $1 -- got '$2', want '$3'"; fail=1; fi
}

echo "queue + status test"

# --waiting-on only accepts "human" or a known layer.
if b append --layer load --type blocker --waiting-on nobody --title x >/dev/null 2>&1
then echo "  FAIL  bogus --waiting-on accepted"; fail=1
else echo "  PASS  bogus --waiting-on rejected"; fi

# One blocker gating two different layers is the case worth getting right:
# unblocking it releases both, and the queue must make that visible.
B=$(b append --layer load --type blocker --waiting-on human --title "staging credential not published")
b append --layer load --type task --title "corpus rename" --status blocked --refs "$B" >/dev/null
b append --layer ui   --type task --title "video error cases" --status blocked --refs "$B" >/dev/null
S=$(b append --layer api --type blocker --waiting-on ui --title "need service names")
b append --layer api --type task --title "contract assertions" --status blocked --refs "$S" >/dev/null

gating=$(b queue --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const q=JSON.parse(d).find(x=>x.title==="staging credential not published");
  console.log(q.gating.join(","));
})')
check "human blocker reports fan-out across layers" "$gating" "load,ui"

human=$(b queue --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>
  console.log(JSON.parse(d).filter(x=>x.waitingOn==="human").length))')
check "exactly one blocker waiting on human" "$human" "1"

# A resolved blocker must drop out of the queue entirely.
b append --layer load --id "$B" --type blocker --status done >/dev/null
left=$(b queue --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>
  console.log(JSON.parse(d).filter(x=>x.waitingOn==="human").length))')
check "resolved blocker leaves the queue" "$left" "0"

# The layer-to-layer blocker is unaffected by resolving the human one.
layerq=$(b queue --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>
  console.log(JSON.parse(d).filter(x=>x.waitingOn!=="human").length))')
check "layer-to-layer blocker still queued" "$layerq" "1"

# Status must degrade rather than crash when a layer folder does not exist.
missing=$(b status --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const r=JSON.parse(d).find(x=>x.layer==="api");
  console.log(r.git.state);
})')
check "missing layer dir reported, not fatal" "$missing" "missing"

inbox=$(b status --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const r=JSON.parse(d).find(x=>x.layer==="ui");
  console.log(r.blockers);
})')
check "ui owns no blockers" "$inbox" "0"

echo
[ "$fail" -eq 0 ] && echo "all checks passed" || { echo "FAILURES"; exit 1; }
