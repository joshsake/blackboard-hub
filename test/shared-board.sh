#!/usr/bin/env bash
# The single most important property: every lane worktree must resolve to ONE
# board. This regressed once already -- board/ lives inside the repo, so
# `git worktree` hands each lane its own copy, and resolving the board relative
# to the script's own root silently produced five private boards.
#
# Deliberately runs WITHOUT BLACKBOARD_DIR, since the env override would mask
# exactly the resolution logic under test. It only reads, never writes.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
check () {
  if [ "$2" = "$3" ]; then echo "  PASS  $1"
  else echo "  FAIL  $1 -- got '$2', want '$3'"; fail=1; fi
}

echo "shared-board test"

unset BLACKBOARD_DIR || true
hub=$(node bin/board.mjs where)

lanes=0
for wt in $(git worktree list --porcelain | awk '/^worktree /{print $2}'); do
  # Skip the main checkout; we are comparing linked worktrees against it.
  [ "$(cd "$wt" && git rev-parse --git-dir)" = "$(git rev-parse --git-dir)" ] && continue
  [ -f "$wt/bin/board.mjs" ] || continue
  lanes=$((lanes + 1))
  name=$(basename "$wt")
  got=$(cd "$wt" && node bin/board.mjs where 2>/dev/null | head -1)
  # A lane running an older CLI has no `where` and prints usage instead. That
  # lane is genuinely broken -- it would write to a private board -- so say so
  # plainly rather than diffing a wall of help text.
  # Test for a real directory rather than glob the string: paths use backslashes
  # on Windows, and the usage banner's first line is literally "blackboard",
  # which any *board pattern would happily match.
  if [ -d "$got" ]; then
    check "$name resolves to the hub board" "$got" "$hub"
  else
    echo "  FAIL  $name is behind main (no 'where' command) -- run: cd $wt && git merge main"
    fail=1
  fi
done

if [ "$lanes" -eq 0 ]; then
  echo "  SKIP  no lane worktrees present (run: git worktree add -b lane/api ../hub-lanes/api)"
fi

echo
[ "$fail" -eq 0 ] && echo "all checks passed" || { echo "FAILURES"; exit 1; }
