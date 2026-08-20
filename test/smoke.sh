#!/usr/bin/env bash
# Repeatable verification of the board's load-bearing properties.
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

echo "board smoke test"

T=$(b append --lane hub --type task --to api --title "Cover checkout endpoint" --body "assert POST /checkout")
C=$(b append --lane api --type contract --title "POST /checkout" --body "201 -> {orderId,total}" --refs "$T")
Q=$(b append --lane ui --type question --to api --title "orderId stable across retries?" --refs "$C")

# Single-owner rule: a non-owner must not be able to supersede an entry.
if b append --lane ui --id "$C" --type contract --status done >/dev/null 2>&1
then echo "  FAIL  ownership guard let a non-owner supersede"; fail=1
else echo "  PASS  ownership guard refuses non-owner"; fi

# Unknown lane and unknown type must be rejected, not silently accepted.
if b append --lane nope --type task --title x >/dev/null 2>&1
then echo "  FAIL  unknown lane accepted"; fail=1; else echo "  PASS  unknown lane rejected"; fi
if b append --lane api --type bogus --title x >/dev/null 2>&1
then echo "  FAIL  unknown type accepted"; fail=1; else echo "  PASS  unknown type rejected"; fi

# Partial update must merge, not replace.
b append --lane ui --id "$Q" --type question --status answered >/dev/null
read -r n st to ti < <(BLACKBOARD_DIR="$TMP" Q="$Q" node -e '
const {execSync}=require("child_process");
const a=JSON.parse(execSync("node bin/board.mjs read --json").toString()).filter(x=>x.id===process.env.Q);
const r=a[0]||{};
console.log(a.length, r.status, r.to, JSON.stringify(r.refs));
')
check "fold collapses revisions to one entry" "$n" "1"
check "status updated"                        "$st" "answered"
check "routing preserved through update"      "$to" "api"
check "refs preserved through update"         "$ti" "[\"$C\"]"

# History must retain every revision even though fold shows one.
h=$(b show "$Q" --json | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).length))')
check "history retains both revisions" "$h" "2"

echo
[ "$fail" -eq 0 ] && echo "all checks passed" || { echo "FAILURES"; exit 1; }
