# ui lane — browser tests

Playwright specs that drive the app under test (wayfarer) through a real
browser: the `/plan` preference wizard and the `/results` page it emits.
The HTTP surface of `/results` belongs to the api lane (contract_1f5a871e,
`tests/api/`); this lane owns the half only a browser can see — that the
wizard actually emits a URL of the promised shape, and that the page the
traveller lands on renders what the URL says.

## Structure

```
tests/ui/
  fixtures.ts                shared test object: page-object fixtures and the
                             /results health probe (one GET per worker)
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

Two modes, chosen by whether `BASE_URL` is set
(see `playwright.config.ts` at the repo root).

**Local build** — self-contained; Playwright builds and serves the app:

```sh
npm run test:ui
```

Needs the wayfarer checkout beside this repo (override with `APP_DIR`) and a
`.env.local` in it, copied from wayfarer's `.env.example` and filled in —
`/results` loads its catalog from the database at build time, so without that
config the build itself fails (blocker_a3ba1690).

**Deployed target** — no build, no credentials; Playwright starts nothing:

```sh
BASE_URL=https://wayfarer-xi.vercel.app npm run test:ui
```

## What skips, and when

`fixtures.ts` probes `GET /results` once per worker. Bare `/results` is
guaranteed 200 by contract_1f5a871e, so any other answer means the data
backend cannot serve the catalog. While that is true, the 6 specs that need
`/results` to render skip — each names blocker_a3ba1690 in its skip reason —
and the 3 pure-wizard specs still run:

| spec | needs /results? | with backend down |
| --- | --- | --- |
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
red. With a healthy target the gate is open and all 9 specs run.

## Assertion discipline

- **Per-param URL assertions, never whole-query-string equality.** `/results`
  is order-independent; two silent traps (a repeated param reverts to its
  default; `splurges` is one comma-joined value, and the repeated form parses
  as *no selection*) change the ranking without erroring. See
  contract_1f5a871e and finding_26d5ef1f.
- **Verified to fail.** Each of the 5 contract specs was shown to go red
  against a deliberately broken wizard before it counted as coverage
  (finding_e24f4931). Keep that property: a new contract spec is not done
  until you have watched it fail. `PlanPage.complete()` is the exact sequence
  those verifications ran through — change it only with a re-verification.
- Selectors are the app's deliberate `data-testid`s only; nothing depends on
  styling or DOM shape.
