# Targets

This hub owns no product code. Product repos own their source; the hub
points at **registered targets** — descriptors under this directory that
tell the test lanes what to run against and how to reach it. wayfarer is
the first registered target, not a hardwired one, and an instantiated
copy of this template registers its own (bin/init-hub.mjs resets a fresh
copy; dry-run by default).

Design decided in board entry contract_d350537b. This document restates
that contract's schema and resolution order for people adding targets.
The shared resolver module's programmatic API is the api lane's contract
entry, published separately — if you find the implementation drifting
from what is written here, raise a question addressed to hub; never
silently adapt either document to match the other.

## Layout

    targets/config.json            { "default": "<name>" }
    targets/<name>/target.json     the target descriptor (schema below)
    targets/<name>/{api,ui,load}/  that target's specs, page objects,
                                   oracles, journeys
    tests/{api,ui,load}/           target-agnostic only: shared libs,
                                   starter specs, load engine
    tests/docs/                    templates and guides (target-agnostic)

Lane ownership runs by lane subdirectory across both trees: the api lane
owns tests/api AND targets/*/api, and likewise for ui and load. Heavier,
app-specific assertions live only under targets/<name>/ — the starter
specs in tests/ must stay generic enough to pass on any target.

## target.json, field by field

All fields optional except `name`. **Omit rather than invent** — an
absent field is information (the resolver falls back and says so); a
guessed one is a defect.

| field       | meaning                                                       |
| ----------- | ------------------------------------------------------------- |
| name        | string; must match the directory name under targets/          |
| repo        | public source URL of the product                              |
| appDir      | path to a local checkout, relative to the hub checkout        |
| deployedUrl | a live base URL                                               |
| localUrl    | base URL the local server answers on                          |
| start       | { command, timeoutMs } to build and serve from appDir         |
| healthRoute | one route that proves the full stack is up (health gates use it) |
| notes       | one line of operational truth (e.g. backend pauses)           |

Field notes:

- **name** is the identity everything else keys on; a mismatch with the
  directory is a configuration error, not a preference.
- **appDir + start** together enable local-build mode: build and serve
  the product from a checkout, then test against localUrl. Without both,
  there is no local mode for the target.
- **healthRoute** should exercise the full stack (app plus whatever it
  depends on), because health gates trust it: a static page that renders
  while the backend is down defeats the purpose. For a target with no
  backend, the root route is honest enough — that is what the example
  target uses.
- **notes** is for the one thing an operator needs to know before
  blaming their own setup — a backend that pauses when idle, a deploy
  that sleeps. One line; longer operational truth belongs in a board
  entry the line can cite.

## Resolution order

Uniform across playwright, jest, and the k6 preflight — all three answer
"which target, then which base URL" the same way:

1. `TARGET` env selects the target; absent, the `default` in
   targets/config.json applies.
2. `BASE_URL` env: an explicit URL wins as-is; the sentinel value
   `deployed` resolves to the target's deployedUrl.
3. No `BASE_URL`: a target with start+appDir runs local-build mode
   (unchanged wayfarer behavior); a target without start falls back to
   deployedUrl and says so; neither present is a clear error, not a
   guess.
4. `APP_DIR` env still overrides appDir.

## Adding a target, in three steps

1. **Describe it.** Create targets/<name>/ and write target.json with
   `name` matching the directory and only the fields you actually know —
   omit the rest. Choose the healthRoute deliberately (see field notes).
2. **Select it.** Run with TARGET=<name>, or make it the default in
   targets/config.json. Pick the base mode the target supports: explicit
   BASE_URL, the `deployed` sentinel, or start+appDir for local-build.
3. **Prove it.** Starter specs must go green against it with no edits —
   they are generic by design. Then work through
   tests/docs/templates/target-onboarding.md: per-lane suites planned
   under targets/<name>/, contracts published, operational notes
   recorded. Onboarding ends with a finding on the board, not a merged
   directory.

## The example target

targets/example (deployedUrl https://example.com, healthRoute /, no
start) exists to prove target switching with zero app knowledge. Starter
specs must be generic enough to pass on it — response under 500 on /,
page has a title — which makes it the standing guard against starter
specs quietly accreting wayfarer-specific assertions. Anything heavier
belongs in a per-target suite. It is deliberately a target nobody owns:
if a change breaks the example target, the change broke the harness, not
the app. (claudia-cms was probed and rejected for this role — 307s from
deployment protection; see contract_d350537b.)
