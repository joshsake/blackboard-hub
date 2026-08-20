# Blackboard Hub — Design

## Problem

Multi-session Claude Code work (one session per lane) has no shared memory.
The human currently *is* the message bus, relaying state between sessions by
hand. Transcripts are the only cross-session state, and they are lossy: they
compact, they are prose, and they cannot be queried for facts.

## Shape

Classic blackboard architecture:

- **Board** — durable structured shared state.
- **Knowledge sources** — the lane sessions (API, UI, Load, Docs). Each reads
  the whole board, contributes only in its own domain.
- **Control** — the Main Hub session. Reads the board, decides what happens
  next, dispatches to lanes.

## What already exists

The `ccd_session_mgmt` MCP already provides the control plumbing. No code needed:

| Primitive | Role |
|---|---|
| `list_sessions` | discover lane sessions |
| `list_events` | read a lane's transcript |
| `search_session_transcripts` | full-text search across lanes |
| `send_message` | dispatch into a lane (arrives as a user turn) |

This project builds the missing half: **the board itself**.

## Key decisions

### 1. The board lives outside the branch topology

Code uses one repo, a folder per lane, and a worktree+branch per session.
The board must NOT live on those branches — branch isolation would give each
lane a divergent view of shared state, defeating the purpose.

The board is a separate store with a single checkout that all sessions read
and write directly. It is also the only arrangement compatible with the hub
being reusable across projects.

### 2. Per-lane append-only logs, derived read model

Each lane appends only to its own file (`board/entries/<lane>.jsonl`).
No file is ever written by two sessions. Write conflicts become structurally
impossible rather than something to lock around.

The queryable board state is *derived* by folding those logs — last write per
entry id wins, ordered by sequence.

### 3. Single-owner entries

Every entry declares an owning lane. Other lanes read it; only the owner
supersedes it. Cross-lane disagreement becomes an explicit `question`
entry addressed to the hub, not a silent overwrite.

### 4. Messages are signals; the board is the record

Lanes may message each other directly (`send_message` is any-to-any, not
hub-mediated). But a side conversation between two lanes is exactly the
invisible state this project exists to remove.

So direct comms are allowed as a *wake signal* only. Anything that matters --
an answer, a decision, a contract change -- is written to the board regardless
of how it was communicated. If it is not on the board, it did not happen.

### 5. Routing resolves late, because session IDs are ephemeral

A session's ID changes whenever it restarts, so the registry must never store
one. `board/lanes.json` keys lanes on stable identity (name, folder,
expected session title); the hub resolves a lane to a live session at
dispatch time via `list_sessions`.

### 6. Superseding is a partial update

An entry is revised by re-appending under the same `id`. Fields not supplied
inherit from the prior revision. Replacing wholesale would mean a lane that
merely closed a question silently destroyed its routing, body and refs.

### 7. Git as the audit log

The board is its own git repo. History, blame, and rollback come free, and
`pull`/`push` becomes the sync mechanism if it ever needs to span machines.

## Entry types

| Type | Purpose | Typical owner |
|---|---|---|
| `contract` | shared interface facts — endpoint shapes, selectors, env config | the lane that owns the surface |
| `task` | work assigned to a lane, with status | hub |
| `finding` | results, failures, blockers | any lane |
| `question` | open cross-lane question awaiting an answer | any lane |

Common fields: `id`, `type`, `owner`, `seq`, `status`, `title`, `body`, `refs`.

## Known constraints

- `send_message` is unavailable to and from unattended sessions (scheduled
  and remote runs). Cron-driven lanes can write to the board but cannot be
  woken by the hub, and cannot notify it.
- Nothing watches the board for changes. Activation is push (hub dispatches)
  or manual, not change-triggered. Polling would need `Monitor` or `/loop`.

## Open questions

- What state genuinely needs to cross lanes? The entry types above are a
  hypothesis and should be validated against one real workstream.
- Should the hub read lane state from the board only, or also fold in
  `list_events` transcripts?

## Borrowed from the prior art

The prior art (a working system on another machine) surfaced three ideas
this design originally missed. Adopted here; no compatibility is maintained
with it, since the two are independent.

### Derived state beats declared state

The dashboard scrapes branch, ahead/dirty counts, PRs and ticket counts rather
than having each lane type them. Only `focus` and `blocked` are narrative.

That split is now explicit here. `board status` derives git state per lane by
shelling out; lanes cannot write it. Hand-maintained facts rot silently while
`git status` never lies, so anything a tool already knows is never a board
entry.

### The human is a queued resource, and blockers fan out

The dashboard's "Waiting on Josh" list is the real bottleneck, and one item
(`REDACTED_CREDENTIAL`) gated two lanes at once. A design that only records
"this lane is blocked" cannot show that a single unblock releases several
lanes.

So `blocker` is an entry type, carrying `waitingOn: human | <lane>`. Other
entries `refs` it, and `board queue` reports fan-out -- how many distinct
lanes each blocker gates -- sorted with the widest first. That ordering is
the point: it tells the human which single answer buys the most.

### Liveness

`idle 2m` versus `waiting 25h` is the difference between a healthy lane and
one stalled for a day. `board status` reports time since each lane's last
board write, so the hub can tell who to poke rather than guessing.

## Not yet built

- The hub and lane skills that encode the protocol (receive intent, resolve
  lane, dispatch, record; and read board, work, write back, signal).
- Scraping beyond git. PRs and tickets are derived state in the dashboard and
  should be here too, but need `gh`/tracker access to be worth adding.
- Nothing watches the board; activation remains push-only.

## Worktree layout

Each lane session works in its own linked worktree on its own branch, so
lanes cannot collide in one working tree and `board status` reports real
per-lane branch state:

```
C:/automation/blackboard_hub     main       <- hub session, and the one board
C:/automation/hub-lanes/api      lane/api
C:/automation/hub-lanes/ui       lane/ui
C:/automation/hub-lanes/load     lane/load
C:/automation/hub-lanes/docs     lane/docs
```

`board/lanes.json` therefore carries two paths per lane: `worktree` (the
checkout, where git state is read from) and `dir` (where that lane's code
lives inside it).

A worktree is a full checkout, not a subdirectory view, so each lane needs its
own `npm ci`. Playwright browsers are cached per user rather than per project,
so only the package tree is duplicated.

### The board must not follow the worktrees

`board/` lives inside the repo, so `git worktree` gives every lane its own copy
of it. Resolving the board relative to the CLI's own location therefore
produced five private boards that silently never saw each other -- lanes
appended happily and read back nothing.

`git rev-parse --git-common-dir` points at the main checkout's `.git` from
inside any linked worktree, so the CLI resolves the board from there and every
lane shares one. `board where` prints the resolved path; if two lanes disagree,
they are isolated. `test/shared-board.sh` asserts this, because the bug was
found by hand and nothing in the suite would have caught it.

Lanes must be kept current with main (`git merge main`) or they run an older
CLI. The shared-board test reports a stale lane by name.
