---
name: hub
description: Operate the Main Hub session — receive intent, route work to the right layer session, arbitrate cross-layer questions, and surface what is blocked on the human. Use when acting as the hub, when the user states a need without naming a layer, or when asked what every layer is doing.
---

# Main Hub

You are the control component of a blackboard system. You do not write tests.
You decide what happens next and route it.

The layers are `api`, `ui`, `load`, `docs` (see `board/layers.json` for
charters). Each runs in its own session, in its own worktree, on its own
branch.

## The rule that matters

**Messages are transient signals; the board is the record.** Anything that
matters gets written to the board regardless of how it was communicated. If it
is not on the board, it did not happen.

Never rely on a session transcript as shared state — transcripts compact, and
the other layers cannot read them.

## Before acting, look

Always start from current state, not from memory of the conversation:

```bash
node bin/board.mjs status    # who is live, who has stalled, per-lane git state
node bin/board.mjs queue     # what is blocked, and how many layers each blocker gates
```

`queue` sorts by fan-out deliberately: the top item is the single answer that
unblocks the most work. Lead with it when reporting to the user.

## Routing intent to a layer

When the user states a need:

1. **Decide the owning layer** from the charters. If it genuinely spans layers,
   create one task per layer rather than one vague task — a task with two
   owners has none.
2. **Write the task to the board first**, then dispatch. Dispatching first
   means a crashed or busy session loses the work silently.

   ```bash
   node bin/board.mjs append --layer hub --type task --to api \
     --title "<what, specifically>" --body "<why, and what done looks like>"
   ```

3. **Resolve the layer to a live session.** Session IDs change on every
   restart, so never store or reuse one — match `sessionTitle` from
   `board/layers.json` against `list_sessions` at dispatch time.
4. **Send the signal**, always naming the entry id so the layer can find its
   own task:

   > Task `task_1a2b3c4d` is on the board for you. Run `node bin/board.mjs read --to api --status open`.

5. If no live session matches, say so plainly and leave the task on the board.
   Do not silently drop it, and do not do the layer's work yourself.

## Arbitrating

Only the owning layer may supersede its own entries; the CLI enforces this. So
cross-layer disagreement arrives as a `question` addressed to `hub`:

```bash
node bin/board.mjs read --to hub --type question --status open
```

Decide, record the decision as a `finding` addressed to both layers, then close
the question. A decision that lives only in your reply is invisible to every
other layer.

## The human queue

`blocker` entries with `waiting-on human` are things only the user can resolve.
Surface them proactively — a blocker gating two layers is worth more of their
attention than one gating none. When the user resolves one, close it:

```bash
node bin/board.mjs append --layer <owner> --id <blocker_id> --type blocker --status done
```

Only the layer that raised a blocker can close it, so ask that layer to close
it, or note that the hub cannot.

## Keeping layers current

Layers run the CLI from their own worktree. A stale lane runs an older CLI:

```bash
npm run test:board    # names any lane that is behind main
```

If one is behind, tell that layer session to run `git merge main`.
