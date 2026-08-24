# ui lane, wayfarer target — browser tests

This directory is the **wayfarer** target's ui suite: Playwright specs that
drive the app through a real browser — the `/plan` preference wizard and the
`/results` page it emits. Target-agnostic pieces live under `tests/ui/` at the
repo root: the shared fixture core with the health gate (`tests/ui/fixtures.ts`)
and the starter spec (`tests/ui/starter/`), which runs for every registered
target. Everything resolves its target through `tests/lib/target.mjs`
(contract_8f9d0915).

The HTTP surface of `/results` belongs to the api lane (contract_1f5a871e,
`targets/wayfarer/api/`); this suite owns the half only a browser can see —
that the wizard actually emits a URL of the promised shape, and that the page
the traveller lands on renders what the URL says.

## Structure

```
targets/wayfarer/ui/
  fixtures.ts                wayfarer fixture layer: page objects on top of
                             the shared core's test object
  pages/
    plan-page.ts             PlanPage — the /plan wizard. PlanPage.complete()
                             drives all five steps and returns the emitted URL
    results-page.ts          ResultsPage — recommendation cards and their
                             expandable details
  wizard.spec.ts             wizard behaviour: entry, auto-advance, back
                             navigation, completion
  results-contract.spec.ts   conformance of the emitted URL and rendered page
                             to contract_1f5a871e (5 specs, each one
                             mutation-verified — see below)
```

Specs import `{ test, expect }` from `./fixtures`, never from
`@playwright/test` directly. Page objects expose **locators**, not
assert-methods: the assertion is the load-bearing part of a spec and stays in
the spec where a reviewer can see exactly what is guaranteed.

## Running

Which app a run is about is the target registry's decision, resolved the same
way by every runner (`tests/lib/target.mjs`):

```sh
npm run test:ui                     # default target; wayfarer builds and
                                    # serves locally (needs the app checkout
                                    # beside this repo plus its .env.local —
                                    # see blocker_a3ba1690)
BASE_URL=deployed npm run test:ui   # wayfarer's deployedUrl; starts nothing
BASE_URL=<url> npm run test:ui      # an explicit URL; starts nothing
TARGET=example npm run test:ui      # a different registered target
                                    # (collects only the starter spec)
```

## What skips, and when

The shared core probes the target's `healthRoute` (from
`targets/wayfarer/target.json`) once per worker. Specs that need the full
stack rendering call `skipUnlessTargetHealthy` first thing; the skip reason
quotes the target's `notes` line, which is where the operational truth lives
— wayfarer's cites `blocker_a3ba1690`. While the data backend is down:

| spec | needs /results? | with backend down |
| --- | --- | --- |
| starter: page loads with a non-empty title | no | runs |
| wizard: landing page leads into the wizard | no | runs |
| wizard: single-select auto-advances | no | runs |
| wizard: back keeps the answer | no | runs |
| wizard: completed flow → shareable URL | yes | skips |
| contract: all five params emitted | yes | skips |
| contract: splurges comma-joined | yes | skips |
| contract: no param emitted twice | yes | skips |
| contract: detail=everything expands cards | yes | skips |
| contract: detail=essentials collapses cards | yes | skips |

Why even the URL-only contract specs are gated: completing the wizard ends in
a client-side navigation to `/results`, and when the backend is down that
navigation **never commits** — the URL stays on `/plan` — so the specs cannot
observe the emitted URL at all (verified against the deployed target,
2026-08-24, finding_e732d2db). A dead environment must read as blocked, not
red. With a healthy target the gate is open and all 10 specs run.

## Assertion discipline

- **Per-param URL assertions, never whole-query-string equality.** `/results`
  is order-independent; two silent traps (a repeated param reverts to its
  default; `splurges` is one comma-joined value, and the repeated form parses
  as *no selection*) change the ranking without erroring. See
  contract_1f5a871e and finding_26d5ef1f — api's
  `targets/wayfarer/api/lib/results-url.ts` is the executable oracle for both.
- **Verified to fail.** Each of the 5 contract specs was shown to go red
  against a deliberately broken wizard before it counted as coverage
  (finding_e24f4931). Keep that property: a new contract spec is not done
  until you have watched it fail. `PlanPage.complete()` is the exact sequence
  those verifications ran through — change it only with a re-verification.
- Selectors are the app's deliberate `data-testid`s only; nothing depends on
  styling or DOM shape.
