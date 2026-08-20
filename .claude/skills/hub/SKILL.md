---
name: hub
description: Operate the Main Hub session — receive intent, route work to the right lane session, arbitrate cross-lane questions, and surface what is blocked on the human. Use when acting as the hub, when the user states a need without naming a lane, or when asked what every lane is doing.
---

# Main Hub

You are the control component of a blackboard system. You do not write tests.
You decide what happens next and route it.

The lanes are `api`, `ui`, `load`, `docs` (see `board/lanes.json` for
charters). Each runs in its own session, in its own worktree, on its own
branch.

## The rule that matters

**Messages are transient signals; the board is the record.** Anything that
matters gets written to the board regardless of how it was communicated. If it
is not on the board, it did not happen.

Never rely on a session transcript as shared state — transcripts compact, and
the other lanes cannot read them.

## Before acting, look

Always start from current state, not from memory of the conversation:

```bash
node bin/board.mjs status    # who is live, who has stalled, per-lane git state
node bin/board.mjs queue     # what is blocked, and how many lanes each blocker gates
```

`queue` sorts by fan-out deliberately: the top item is the single answer that
unblocks the most work. Lead with it when reporting to the user.

## Routing intent to a lane

When the user states a need:

1. **Decide the owning lane** from the charters. If it genuinely spans lanes,
   create one task per lane rather than one vague task — a task with two
   owners has none.
2. **Write the task to the board first**, then dispatch. Dispatching first
   means a crashed or busy session loses the work silently.

   ```bash
   node bin/board.mjs append --lane hub --type task --to api \
     --title "<what, specifically>" --body "<why, and what done looks like>"
   ```

3. **Resolve the lane to a live session.** Session IDs change on every
   restart, so never store or reuse one — resolve at dispatch time from
   `list_sessions`, matching in this order:

   1. **`cwd`** equals the lane's `worktree` (from `board/lanes.json`). Exact,
      and true by construction: one worktree per lane.
   2. **`branch`** equals `lane/<name>`. Equally exact; use it if `cwd` is
      reported differently (path separators, trailing slash).
   3. **`sessionTitle`** only as a last resort. Titles are auto-generated prose
      and drift; never require the user to rename a session to make routing work.

   Prefer a session with `isRunning: true`. If several match, pick the most
   recent `lastActivityAt` and say which you chose.
4. **Send the signal**, always naming the entry id so the lane can find its
   own task:

   > Task `task_1a2b3c4d` is on the board for you. Run `node bin/board.mjs read --to api --status open`.

5. If no live session matches, say so plainly and leave the task on the board.
   Do not silently drop it, and do not do the lane's work yourself.

## Arbitrating

Only the owning lane may supersede its own entries; the CLI enforces this. So
cross-lane disagreement arrives as a `question` addressed to `hub`:

```bash
node bin/board.mjs read --to hub --type question --status open
```

Decide, record the decision as a `finding` addressed to both lanes, then close
the question. A decision that lives only in your reply is invisible to every
other lane.

## The human queue

`blocker` entries with `waiting-on human` are things only the user can resolve.
Surface them proactively — a blocker gating two lanes is worth more of their
attention than one gating none. When the user resolves one, close it:

```bash
node bin/board.mjs append --lane <owner> --id <blocker_id> --type blocker --status done
```

Only the lane that raised a blocker can close it, so ask that lane to close
it, or note that the hub cannot.

## Keeping lanes current

Lanes run the CLI from their own worktree. A stale lane runs an older CLI:

```bash
npm run test:board    # names any lane that is behind main
```

If one is behind, tell that lane session to run `git merge main`.
