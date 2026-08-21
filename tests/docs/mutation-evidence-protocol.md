# Evidence gathered against the wrong instance reads clean

A test that fails proves nothing until you know *which build* it ran against.
A board entry you grep proves nothing until you know *which copy* you read.

Both mistakes produce a confident, plausible, wrong answer, and neither
announces itself. This document is the protocol for not making them. It exists
because both have already happened here, to lanes that were being careful.

---

## Part 1: the mutation harness

### Why there is a protocol at all

A green test suite is not evidence that the suite works. It is evidence that
the suite did not fail — which is also what a suite asserting nothing looks
like. The only way to know a spec catches the break it names is to *cause* that
break and watch the spec go red.

That is a mutation pass, and it is only as good as your confidence that the
mutation was actually running when the spec failed.

### The trap, as it actually happened

The api lane ran a mutation pass and got a red. The wrong spec was red: the
result carried the signature of a *previous* mutation, not the one just
applied. The tell was runtime — 3.1 seconds against a normal 14.

The cause is `playwright.config.ts`, `reuseExistingServer: true`. If a server
from the previous run is still listening, Playwright skips the build entirely
and runs the new specs against **the previous mutation's binary**.

Nothing errors. The suite runs, reports a failure, and that failure is real —
it is just not caused by the mutation you are testing. Reported as-is, it would
have been mutation theatre: the ceremony of the pass with none of its evidential
value.

The runtime tell is luck. Do not rely on noticing it.

### The protocol that survives it

Every step exists because skipping it lets a stale instance answer for a fresh
one.

```bash
# 1. Kill anything already serving on your lane's port.
#    Your port is in board/lanes.json; do not assume 3000.

# 2. Destroy the build cache in YOUR app worktree.
rm -rf .next

# 3. Build, from scratch.
npm run build

# 4. Start the server yourself, on your lane's port.

# 5. PROBE the live server and prove the mutation is being served.
#    Not "the file is edited" -- that the running process reflects it.
curl -s 'http://localhost:<your-port>/results?party=couple' | ...

# 6. Run with BASE_URL set, so Playwright starts nothing
#    and therefore cannot reuse anything.
BASE_URL=http://localhost:<your-port> npm run test:api
```

**Step 5 is the one that makes the rest trustworthy**, and it is the one that
looks skippable. Steps 1–4 are hygiene; any of them can silently fail to take
effect. The probe is the only step that observes the *running system* rather
than your intent about it. Choose a probe whose output differs between mutated
and baseline, and record that output alongside the result — a mutation report
without its probe output is an assertion, not evidence.

Step 6 removes the failure mode structurally rather than avoiding it by care.
With `BASE_URL` set there is no `webServer` and no reuse path to get wrong.

### Isolation is part of the harness

Port separation alone is not enough while lanes share one app checkout. Two
lanes mutating one source tree means a build can bake a *foreign* lane's
mutation into innocent evidence — the same trap, moved from the server to the
filesystem, and a build lock does not fix it.

So `board/lanes.json` assigns each app-running lane its own `port` and its own
`appWorktree`. Mutate only in your own worktree; restore it clean after every
pass and confirm the restore rather than assuming it. Nobody builds, serves or
mutates the shared app checkout.

### What a mutation report has to contain

- **Which break, at which file and line**, precisely enough to reapply.
- **Which specs went red, and which stayed green.** A break that reddens
  everything tells you less than one that reddens exactly its target.
- **The probe output** proving the mutation was live when the specs ran.
- **Confirmation the tree was restored**, verified, not assumed.
- **Which specs you did NOT mutation-verify**, and why.

That last one matters more than it looks. Specs left unverified are the ones
that will be assumed covered a year from now.

### One real result, to show what the pass buys

A duplicate-detection spec was written with a single value selected. A wizard
emitting the repeated form would have had nothing to repeat, so the spec passed
while being structurally blind to the thing it existed to catch. Only the
mutation pass found it. A spec that cannot fail reads exactly like a spec that
keeps passing.

---

## Part 2: the same trap, in the filesystem

### Every worktree carries its own stale copy of the board

`board/` is committed. `git worktree` therefore gives every lane its own copy of
it, frozen at whatever that branch last merged. It looks exactly like the board.
It answers queries. It is out of date.

The api lane hit this while auditing: grepping `board/entries/*.jsonl` relative
to its own working directory returned an entry as `open` that was in fact
`done`. Nothing errored. The audit simply answered from history.

### The rule

**Every read of board state goes through the CLI, or through the path
`board where` resolves to.** Never a relative path into `board/` from a lane
worktree.

```bash
node bin/board.mjs read --id finding_1a2b3c4d   # correct: CLI resolves the shared board
node bin/board.mjs where                        # prints the one real path
grep -r . board/entries/                        # WRONG from a lane worktree: reads history
```

The CLI resolves the board from the main checkout via
`git rev-parse --git-common-dir`, which is why it is correct from anywhere and a
relative path is not. This is the same mechanism that stops five lanes from
silently keeping five private boards.

### Why it is the same lesson

Both failures have one shape:

> An instance that is not the live one answered, and the answer looked normal.

The stale server was a real server. The stale board copy is a real board. Each
returned a well-formed, plausible answer to the question asked. Neither could be
detected by reading the output — only by knowing which instance produced it.

The defence is the same in both cases and it is not care: it is **making the
wrong instance unreachable**. `BASE_URL` removes the reuse path. The CLI removes
the stale-copy path. Both replace a rule you have to remember with a route you
cannot take.

---

## Provenance

Compiled by the docs lane from other lanes' first-hand reports, not re-run here.

**Cited, not re-executed:** the stale-server discovery, the 3.1s-vs-14s tell,
the six-break mutation pass and the invalidated first pass are the api lane's
results (board entry `finding_d56fb593`). The stale-board-copy discovery is also
api's (`finding_f6ad67b7`). The blind duplicate-spec example is the ui lane's
(`finding_e24f4931`). The isolation assignments are the hub's ruling
(`finding_663e7231`).

**Verified while writing:** that `board/lanes.json` carries `port` and
`appWorktree` for api, ui and load, read from the file; that the CLI exposes
`where`; and that `board/` is tracked in git and therefore duplicated per
worktree.

**Not done:** I have not run a mutation pass myself, and have not reproduced
either trap. The steps above are transcribed from the lane that rebuilt its
harness after being caught, not independently re-derived.
