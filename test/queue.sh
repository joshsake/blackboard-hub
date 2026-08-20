#!/usr/bin/env bash
# Verification for blockers, human-queue fan-out, and derived per-lane status.
# Runs against a throwaway board so it never touches real shared state.
set -euo pipefail
cd "$(dirname "$0")/.."

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/entries"
cp board/lanes.json "$TMP/lanes.json"
export BLACKBOARD_DIR="$TMP"
b () { node bin/board.mjs "$@"; }

fail=0
check () { # check <label> <actual> <expected>
  if [ "$2" = "$3" ]; then echo "  PASS  $1"
  else echo "  FAIL  $1 -- got '$2', want '$3'"; fail=1; fi
}

echo "queue + status test"

# --waiting-on only accepts "human" or a known lane.
if b append --lane load --type blocker --waiting-on nobody --title x >/dev/null 2>&1
then echo "  FAIL  bogus --waiting-on accepted"; fail=1
else echo "  PASS  bogus --waiting-on rejected"; fi

# One blocker gating two different lanes is the case worth getting right:
# unblocking it releases both, and the queue must make that visible.
B=$(b append --lane load --type blocker --waiting-on human --title "staging credential not published")
b append --lane load --type task --title "corpus rename" --status blocked --refs "$B" >/dev/null
b append --lane ui   --type task --title "video error cases" --status blocked --refs "$B" >/dev/null
S=$(b append --lane api --type blocker --waiting-on ui --title "need service names")
b append --lane api --type task --title "contract assertions" --status blocked --refs "$S" >/dev/null

gating=$(b queue --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const q=JSON.parse(d).blockers.find(x=>x.title==="staging credential not published");
  console.log(q.gating.join(","));
})')
check "human blocker reports fan-out across lanes" "$gating" "load,ui"

human=$(b queue --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>
  console.log(JSON.parse(d).blockers.filter(x=>x.waitingOn==="human").length))')
check "exactly one blocker waiting on human" "$human" "1"

# A resolved blocker must drop out of the queue entirely.
b append --lane load --id "$B" --type blocker --status done >/dev/null
left=$(b queue --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>
  console.log(JSON.parse(d).blockers.filter(x=>x.waitingOn==="human").length))')
check "resolved blocker leaves the queue" "$left" "0"

# The lane-to-lane blocker is unaffected by resolving the human one.
laneq=$(b queue --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>
  console.log(JSON.parse(d).blockers.filter(x=>x.waitingOn!=="human").length))')
check "lane-to-lane blocker still queued" "$laneq" "1"

# Repoint two lanes so both degraded paths are exercised regardless of which
# worktrees happen to exist on this machine. `api` keeps its real worktree.
node -e '
const fs=require("fs"), p=process.env.BLACKBOARD_DIR+"/lanes.json";
const j=JSON.parse(fs.readFileSync(p,"utf8"));
j.lanes.docs.worktree="../hub-lanes/deliberately-absent";
j.lanes.ui.worktree="tests/ui";
fs.writeFileSync(p, JSON.stringify(j,null,2));
'

# Status must degrade rather than crash when a lane checkout does not exist.
missing=$(b status --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  console.log(JSON.parse(d).find(x=>x.lane==="docs").git.state);
})')
check "missing lane checkout reported, not fatal" "$missing" "missing"

# A lane pointed at a plain subfolder of the hub checkout has no branch state
# of its own. Reporting the hub's state as that lane's would be a silent lie,
# so it must be flagged rather than shown as ok.
shared=$(b status --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  console.log(JSON.parse(d).find(x=>x.lane==="ui").git.state);
})')
check "plain subfolder flagged, not passed off as lane state" "$shared" "shares-hub-checkout"

# A lane with its own worktree reports that worktree's branch, not the hub's.
read -r st br < <(b status --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const g=JSON.parse(d).find(x=>x.lane==="api").git;
  console.log(g.state, g.branch);
})')
check "worktree-backed lane reports ok"        "$st" "ok"
check "worktree-backed lane reports its lane"  "$br" "lane/api"

inbox=$(b status --json | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const r=JSON.parse(d).find(x=>x.lane==="ui");
  console.log(r.blockers);
})')
check "ui owns no blockers" "$inbox" "0"

# An open question is a blocked decision and must appear in the queue. The hub
# protocol only requires `status` and `queue`, so a question visible nowhere but
# an inbox is a question the hub will miss -- which is exactly what happened.
Q=$(b append --lane api --type question --to hub --title "which anchor should deriveGit use?")
inq=$(b queue --json | QID="$Q" node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>
  console.log(JSON.parse(d).questions.filter(q=>q.id===process.env.QID).length))')
check "an open question shows in the queue" "$inq" "1"

b append --lane api --id "$Q" --type question --status answered >/dev/null
gone=$(b queue --json | QID="$Q" node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>
  console.log(JSON.parse(d).questions.filter(q=>q.id===process.env.QID).length))')
check "an answered question leaves the queue" "$gone" "0"

echo
[ "$fail" -eq 0 ] && echo "all checks passed" || { echo "FAILURES"; exit 1; }
