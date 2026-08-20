---
name: lane
description: Operate a lane session (api, ui, load, or docs) in a blackboard system — read your inbox from the board, do the work in your own worktree, write results back, and raise blockers. Use when acting as a lane session rather than the hub.
---

# Lane session

You own exactly one lane. Identify which from your worktree: `lane/api` means
you are `api`. Charters are in `board/lanes.json`.

You share a board with the other lanes and the hub. You do **not** share a
working tree — yours is your own branch, so commit freely without coordinating.

## The rule that matters

**Messages are transient signals; the board is the record.** A conclusion you
only put in a chat reply is invisible to every other lane. Write it to the
board.

## Register first, once per session

The hub cannot route to you until you say where you are. Do this before
anything else:

```bash
node bin/board.mjs register --lane <you>
```

It records your working directory and branch, and re-registering just moves
you — safe to run every session. If you are working outside the hub checkout,
call it by absolute path:

```bash
node C:/automation/blackboard_hub/bin/board.mjs register --lane <you>
```

You may live anywhere; the hub finds you by what you registered, not by where
it expected you to be. An unregistered lane is unreachable — the hub will say
so rather than guess.

## Start every session by reading

```bash
node bin/board.mjs read --to <you> --status open   # your inbox
node bin/board.mjs read --type contract            # what other lanes guarantee
node bin/board.mjs queue                           # what is blocking whom
```

Check `node bin/board.mjs where` if entries seem to be missing — every lane
must resolve to the same path. If yours differs, your worktree is stale: run
`git merge main`.

## Working

Do the work in your own worktree, then record the outcome. Write the entry that
another lane would need, not a summary of your activity:

```bash
# A guarantee others can build against. Publish these generously --
# an untold contract is why the ui lane asserts against the wrong shape.
node bin/board.mjs append --lane <you> --type contract \
  --title "POST /checkout returns 201 with {orderId, total}" \
  --body "409 when the cart is empty. orderId is stable across retries."

# A result: a failure, a measurement, an answer to another lane's question.
node bin/board.mjs append --lane <you> --type finding --to ui \
  --title "orderId is stable across retries" --refs question_1a2b3c4d

# Close your own task when it is done.
node bin/board.mjs append --lane <you> --id task_1a2b3c4d --type task --status done
```

Updates are partial: passing `--status` alone preserves title, body, refs and
routing. You never need to retype an entry to change its state.

## When you need something from another lane

Ask on the board, addressed to them. You may also `send_message` their session
to wake them — but the question and its answer both belong on the board.

```bash
node bin/board.mjs append --lane <you> --type question --to api \
  --title "Is orderId stable across retries?" --refs contract_1a2b3c4d
```

**Never supersede another lane's entry.** Only its owner may, and the CLI will
refuse you. If you believe another lane's contract is wrong, raise a
`question` addressed to `hub` and let the hub arbitrate. Silent overwrites are
exactly what this system exists to prevent.

## When you are blocked

Raise a blocker and say who can clear it. Then reference it from the work it
stops, so fan-out is visible — one blocker gating three lanes should look
different from one gating none:

```bash
B=$(node bin/board.mjs append --lane <you> --type blocker --waiting-on human \
      --title "staging BASE_URL not published")
node bin/board.mjs append --lane <you> --type task \
  --title "smoke suite against staging" --status blocked --refs "$B"
```

Use `--waiting-on human` only for things a person must decide or supply
(credentials, an environment, a go/no-go). If another lane can unblock you,
use `--waiting-on <lane>` and ask them directly.

Close your blocker when it clears — nobody else can:

```bash
node bin/board.mjs append --lane <you> --id "$B" --type blocker --status done
```

## Running your tests

```bash
npm run test:api     # Playwright, project=api
npm run test:ui      # Playwright, project=ui
npm run test:load    # k6
```

Specs skip while `BASE_URL` is unset. If you need a target and do not have one,
that is a blocker — raise it rather than inventing a URL or leaving tests red.
