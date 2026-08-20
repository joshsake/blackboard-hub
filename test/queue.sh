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

# Repoint two layers so both degraded paths are exercised regardless of which
# worktrees happen to exist on this machine. `api` keeps its real worktree.
node -e '
const fs=require("fs"), p=process.env.BLACKBOARD_DIR+"/layers.json";
const j=JSON.parse(fs.readFileSync(p,"utf8"));
j.layers.docs.worktree="../hub-lanes/deliberately-absent";
j.layers.ui.worktree="tests/ui";
fs.writeFileSync(p, JSON.stringify(j,null,2));
'

# Status must degrade rather than crash when a layer checkout does not exist.
missing=$(b status --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  console.log(JSON.parse(d).find(x=>x.layer==="docs").git.state);
})')
check "missing layer checkout reported, not fatal" "$missing" "missing"

# A layer pointed at a plain subfolder of the hub checkout has no branch state
# of its own. Reporting the hub's state as that layer's would be a silent lie,
# so it must be flagged rather than shown as ok.
shared=$(b status --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  console.log(JSON.parse(d).find(x=>x.layer==="ui").git.state);
})')
check "plain subfolder flagged, not passed off as lane state" "$shared" "shares-hub-checkout"

# A layer with its own worktree reports that worktree's branch, not the hub's.
read -r st br < <(b status --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const g=JSON.parse(d).find(x=>x.layer==="api").git;
  console.log(g.state, g.branch);
})')
check "worktree-backed layer reports ok"        "$st" "ok"
check "worktree-backed layer reports its lane"  "$br" "lane/api"

inbox=$(b status --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const r=JSON.parse(d).find(x=>x.layer==="ui");
  console.log(r.blockers);
})')
check "ui owns no blockers" "$inbox" "0"

echo
[ "$fail" -eq 0 ] && echo "all checks passed" || { echo "FAILURES"; exit 1; }
