# An answer that could not have been different is not evidence

A test that fails proves nothing until you know *which build* it ran against.
A board entry you grep proves nothing until you know *which copy* you read.
An assertion that passes proves nothing until you know it *could* have failed.
A value copied into prose proves nothing about the value it was copied from.

Each produces a confident, plausible, wrong answer, and none announces itself.
This document is the protocol for not making them.

Everything here happened. The first version was transcribed from one lane's
report; it has since been executed by all three lanes it was written for, and
this revision folds in what they hit that transcription could not predict.

---

## Part 1: the mutation harness

### Why there is a protocol at all

A green suite is not evidence that the suite works. It is evidence that the
suite did not fail — which is also what a suite asserting nothing looks like.
The only way to know a spec catches the break it names is to *cause* that break
and watch the spec go red.

That is a mutation pass, and it is only as good as your confidence that the
mutation was actually running when the spec failed.

### The original trap, and what has changed

The api lane ran a mutation pass and got a red. The wrong spec was red: the
result carried the signature of a *previous* mutation. The tell was runtime —
3.1 seconds against a normal 14.

The cause was `playwright.config.ts`, `reuseExistingServer: true`. With a server
from a previous run still listening, Playwright skipped the build entirely and
ran the new specs against **the previous mutation's binary**. A real failure,
caused by the wrong thing.

**`reuseExistingServer` is now `false`** (`playwright.config.ts:170`). Each lane
has its own port, so meeting an existing server is now an error rather than
something silently absorbed — the run fails loudly instead of adopting someone
else's build.

That removes the trap on the `webServer` path structurally. **The residual risk
is real and worth naming:** it now lives only in `BASE_URL` runs against a
server you did not just start yourself. Setting `BASE_URL` means Playwright
starts nothing, so nothing verifies that the thing on that port is the build you
think it is. That is precisely what the identity probe below is for.

### The protocol

```bash
# 1. Kill anything already serving on your lane's port.
#    Your port is in board/lanes.json. Do not assume 3000.

# 2. Destroy the build cache in YOUR app worktree.
rm -rf .next

# 3. Build, from scratch.
npm run build

# 4. Start the server yourself, on your lane's port.

# 5. PROBE -- both probes, see below.

# 6. Run with BASE_URL set, so Playwright starts nothing.
BASE_URL=http://localhost:<your-port> npm run test:<lane>
```

Step 5 is what makes the rest trustworthy, and it is the one that looks
skippable. Steps 1-4 are hygiene, and any of them can silently fail to take
effect. The probe is the only step that observes the *running system* rather
than your intent about it.

### The two probes

They answer different questions. Use the identity probe always; add the liveness
probe whenever the mutation is expressible over HTTP.

**Identity -- which binary is under test?**

```bash
curl -s -o /dev/null -w '%{http_code}' \
  "http://localhost:<port>/_next/static/$(cat .next/BUILD_ID)/_ssgManifest.js"
```

`200` means the server is serving exactly the build just written to disk. `404`
means it is serving something else. Next.js generates a fresh `BUILD_ID` per
build, so this discriminates between builds with no per-mutation design work.

This is the probe that covers **client-side mutations**, which no HTTP probe can
see. A change to what the wizard emits into a URL produces byte-identical server
responses; only the build identity distinguishes mutated from baseline.

**Liveness -- is the mutation actually live in that binary?**

An observation over HTTP whose result differs between mutated and baseline,
invented per mutation:

```bash
# example: the 500 mutation
curl -s -o /dev/null -w '%{http_code}' 'http://localhost:<port>/results'   # 500 vs 200
```

Identity proves you are testing the right build. Liveness proves that build
contains the change. Neither substitutes for the other: a correct `BUILD_ID`
with a mutation that failed to apply gives you a clean run against an unmutated
build, and a live mutation observed on the wrong port tells you nothing about
what your suite just ran against.

For a client-side mutation where no liveness probe exists, the identity probe
plus the spec observation itself is the evidence. Say so explicitly rather than
leaving the gap unmarked.

### Designing a mutation that tests what you think it tests

**Make it fail where the specs look.** The api lane's first attempt at a 500
mutation was an unconditional `throw` in the route. That does not produce a 500
at all -- it kills the *build*, because Next prerenders the route. The working
mutation was `force-dynamic` plus the throw, which moves the failure to request
time, which is where the specs actually look.

**Cross-check every mutation.** Assert that the targeted spec goes red *and*
that the others stay green. A mutation that reddens the whole suite proves
nothing about the spec it was aimed at -- it proves only that you broke the app.
The signal is in which specs stayed green.

**Anchor your edits line-ending-agnostically.** A literal multi-line anchor
string will never match a CRLF checkout. The ui lane's first harness failed this
way. It failed loudly rather than silently, so it cost a cycle rather than
producing a wrong answer -- but a harness that matches nothing and reports
nothing changed is one refactor away from the silent version.

**Restore and verify the restore.** Not "I reverted it" -- `git status` on the
worktree, confirmed.

### Isolation is part of the harness

Port separation alone is not enough while lanes share one app checkout. Two
lanes mutating one source tree means a build can bake a *foreign* lane's
mutation into innocent evidence -- the same trap moved from the server to the
filesystem, and a build lock does not fix it.

So `board/lanes.json` assigns each app-running lane its own `port` and
`appWorktree`, the latter recorded relative and resolved against the hub root.
Read both from the registry at runtime rather than restating them; see Part 4.

App worktrees are branched **`lane-app/<lane>`** -- the recorded convention. A
bare lane name as a branch inside the app repo is ambiguous.

Mutate only in your own worktree. Nobody builds, serves or mutates the shared
app checkout.

### Two things a cold start will show you

**A fresh app worktree has no `node_modules`.** The first run installs and
builds before it can serve anything, so budget for it rather than reading the
delay as a hang.

**An `EPERM` warning during cleanup on Windows is harmless** and does not mean
the run failed. Do not chase it.

### What a mutation report has to contain

- **Which break, at which file and line**, precisely enough to reapply.
- **The identity probe output**, and the liveness probe output where one exists.
- **Which specs went red, and which stayed green** -- the cross-check, both
  halves.
- **Confirmation the tree was restored**, verified rather than asserted.
- **Which specs you did NOT mutation-verify**, and why.

That last one matters more than it looks. Specs left unverified are the ones
that will be assumed covered a year from now.

---

## Part 2: the same trap, in the filesystem

### Every worktree carries its own stale copy of the board

`board/` is committed. `git worktree` therefore gives every lane its own copy,
frozen at whatever that branch last merged. It looks exactly like the board. It
answers queries. It is out of date.

The api lane hit this while auditing: grepping `board/entries/*.jsonl` relative
to its own working directory returned an entry as `open` that was in fact
`done`. Nothing errored. The audit answered from history.

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
relative path is not.

---

## Part 3: an assertion that cannot fail

This one is not about instances. It is the same disease in the assertion itself,
and it belongs to anyone writing a spec, not only to anyone running a mutation
pass.

### What happened

During the 500 mutation, every request to `/results` returned 500. Eleven of
fifteen specs went red, correctly. One spec passed that should not have:

> *missing params fall back to the documented defaults*

It compared the ranking extracted from a bare `/results` against an explicit
one. The extraction found nothing on either error page. **Nothing equalled
nothing, so it went green.** A total outage of the route it exists to test was
invisible to it.

### The rule

**An equality-only assertion between two responses cannot fail when both sides
break the same way.**

Assert liveness and shape *before* comparing:

```ts
expect(a.status).toBe(200)          // both alive
expect(b.status).toBe(200)
expect(rankingA).toHaveLength(3)    // both the right shape
expect(rankingA).toEqual(rankingB)  // only now is equality meaningful
```

The neighbouring specs survived the same outage only because they also assert an
**inequality** -- that two different inputs produce *different* results -- and an
outage does break that. Symmetry is what makes an equality assertion blind;
asymmetry is what gives it teeth.

Generalised: when you write "these two things agree", ask what happens if
neither exists. If the answer is "it passes", the assertion is decorative.

---

## Part 4: a value restated is a value that will drift

`board/lanes.json` is the single source for ports and app worktrees. Every
consumer either **reads it** or **names it**. Nobody restates its values.

The api lane's config carried both kinds of copy. When `appWorktree` changed
from absolute to relative, the executable copy was caught immediately -- it
resolved to a directory that did not exist and the config refused to run, loudly,
naming the wrong path. The prose copy in the file header was not caught by
anything: it simply went on describing a layout that no longer existed.

That asymmetry is the whole lesson:

> A restated value in code is a bug a test can catch. A restated value in prose
> is a citation nothing audits.

So a comment that lists the paths is worse than a comment that says "paths come
from `board/lanes.json`, deliberately not repeated here" -- the second cannot go
stale. The same reasoning retired the hand-maintained Playwright test count from
the README: a figure `--list` derives is a staleness generator, and it rotted
from 8 to 24 within a day of nobody looking.

This is the sibling of the sha-citation rule in the writing standard. Both say:
point at the thing, do not copy it, because copies rot silently and pointers
fail loudly.

---

## The shape they share

> An instance, a copy, or an assertion that could not have answered differently
> produced an answer that looked normal.

The stale server was a real server. The stale board copy is a real board. The
equality assertion was a real assertion. The restated path was accurate when it
was written. Each returned a well-formed, plausible answer, and none could be
detected by reading the output.

The defence in every case is the same, and it is not care -- it is **removing the
wrong path rather than remembering to avoid it**. `BASE_URL` plus an identity
probe removes the wrong-binary path. The CLI removes the stale-copy path.
Asserting liveness before equality removes the vacuous-pass path. Reading the
registry removes the drifting-copy path.

---

## Provenance

Compiled by the docs lane from other lanes' first-hand reports. This revision
folds in the results of all three lanes executing the first version.

**Cited, not re-executed here:** the stale-server discovery and the 3.1s tell,
the six-break mutation pass, the 500 probe, the spec-12 vacuous pass and its fix,
the `force-dynamic` build-vs-request-time finding, the worker-argv trap and the
single-source rule are the api lane's (`finding_d56fb593`, `finding_874185f2`,
`finding_b5dbe91d`). The `BUILD_ID` identity probe -- verified by that lane in
both directions against a live server, including a deliberately bogus id
returning 404 -- and the CRLF anchor trap are the ui lane's
(`finding_24af4cd5`). The cold-start and `EPERM` notes are the load lane's
(`finding_ab692f15`). The isolation assignments and the `lane-app/<lane>`
convention are the hub's rulings (`finding_663e7231`, `finding_9e74423f`).

**Verified while writing this revision:** `reuseExistingServer: false` at
`playwright.config.ts:170`; the lane-detection order `LANE` ->
`npm_lifecycle_event` -> argv in the same file, with the comment explaining why
argv is last; `port` and relative `appWorktree` present for api, ui and load in
`board/lanes.json`; and the identity probe's path shape on disk in two built
lane worktrees, which carry different `BUILD_ID`s -- so the probe does
discriminate between builds.

**Not done:** I have not run a mutation pass and have not reproduced any of the
four failures. I did not issue the identity probe against a running server; I
confirmed the path exists on disk and that two independent builds differ, which
is weaker than the ui lane's live check in both directions.
