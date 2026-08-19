# Blackboard Hub — Design

## Problem

Multi-session Claude Code work (one session per layer) has no shared memory.
The human currently *is* the message bus, relaying state between sessions by
hand. Transcripts are the only cross-session state, and they are lossy: they
compact, they are prose, and they cannot be queried for facts.

## Shape

Classic blackboard architecture:

- **Board** — durable structured shared state.
- **Knowledge sources** — the layer sessions (API, UI, Load, Docs). Each reads
  the whole board, contributes only in its own domain.
- **Control** — the Main Hub session. Reads the board, decides what happens
  next, dispatches to layers.

## What already exists

The `ccd_session_mgmt` MCP already provides the control plumbing. No code needed:

| Primitive | Role |
|---|---|
| `list_sessions` | discover layer sessions |
| `list_events` | read a layer's transcript |
| `search_session_transcripts` | full-text search across layers |
| `send_message` | dispatch into a layer (arrives as a user turn) |

This project builds the missing half: **the board itself**.

## Key decisions

### 1. The board lives outside the branch topology

Code uses one repo, a folder per layer, and a worktree+branch per session.
The board must NOT live on those branches — branch isolation would give each
layer a divergent view of shared state, defeating the purpose.

The board is a separate store with a single checkout that all sessions read
and write directly. It is also the only arrangement compatible with the hub
being reusable across projects.

### 2. Per-layer append-only logs, derived read model

Each layer appends only to its own file (`board/entries/<layer>.jsonl`).
No file is ever written by two sessions. Write conflicts become structurally
impossible rather than something to lock around.

The queryable board state is *derived* by folding those logs — last write per
entry id wins, ordered by sequence.

### 3. Single-owner entries

Every entry declares an owning layer. Other layers read it; only the owner
supersedes it. Cross-layer disagreement becomes an explicit `question`
entry addressed to the hub, not a silent overwrite.

### 4. Messages are signals; the board is the record

Layers may message each other directly (`send_message` is any-to-any, not
hub-mediated). But a side conversation between two layers is exactly the
invisible state this project exists to remove.

So direct comms are allowed as a *wake signal* only. Anything that matters --
an answer, a decision, a contract change -- is written to the board regardless
of how it was communicated. If it is not on the board, it did not happen.

### 5. Routing resolves late, because session IDs are ephemeral

A session's ID changes whenever it restarts, so the registry must never store
one. `board/layers.json` keys layers on stable identity (name, folder,
expected session title); the hub resolves a layer to a live session at
dispatch time via `list_sessions`.

### 6. Superseding is a partial update

An entry is revised by re-appending under the same `id`. Fields not supplied
inherit from the prior revision. Replacing wholesale would mean a layer that
merely closed a question silently destroyed its routing, body and refs.

### 7. Git as the audit log

The board is its own git repo. History, blame, and rollback come free, and
`pull`/`push` becomes the sync mechanism if it ever needs to span machines.

## Entry types

| Type | Purpose | Typical owner |
|---|---|---|
| `contract` | shared interface facts — endpoint shapes, selectors, env config | the layer that owns the surface |
| `task` | work assigned to a layer, with status | hub |
| `finding` | results, failures, blockers | any layer |
| `question` | open cross-layer question awaiting an answer | any layer |

Common fields: `id`, `type`, `owner`, `seq`, `status`, `title`, `body`, `refs`.

## Known constraints

- `send_message` is unavailable to and from unattended sessions (scheduled
  and remote runs). Cron-driven layers can write to the board but cannot be
  woken by the hub, and cannot notify it.
- Nothing watches the board for changes. Activation is push (hub dispatches)
  or manual, not change-triggered. Polling would need `Monitor` or `/loop`.

## Open questions

- What state genuinely needs to cross layers? The entry types above are a
  hypothesis and should be validated against one real workstream.
- Should the hub read layer state from the board only, or also fold in
  `list_events` transcripts?
