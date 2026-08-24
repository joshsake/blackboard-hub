# api lane, wayfarer target — two layers, one contract

This directory is the **wayfarer** target's api suite. Target-agnostic pieces
live under `tests/` at the repo root: the shared health gate (`tests/api/health.ts`),
the starter specs (`tests/api/starter/`), and the resolver everything routes
through (`tests/lib/target.mjs`, API published as a board contract).

The lane runs two layers with a hard division of labor:

| layer | runner | files | crosses the network? |
| --- | --- | --- | --- |
| live HTTP | Playwright, `project=api` | `*.spec.ts` | yes — request fixture, no browser |
| no-network | Jest | `*.test.ts` | never |

**Jest owns** contract-shape validators, query-param builders and the oracles
the lane maintains — everything in `lib/` plus the `*.test.ts` files that lock
its semantics. **Playwright owns** everything that needs a real server:
status codes, rendered card counts, cross-request ranking comparisons.

The file-pattern split is what keeps the runners apart: `jest.config.mjs`
matches only `*.test.ts`, and Playwright's projects match only `*.spec.ts`.
Without that, Playwright's default pattern would load the Jest files and fail
on their `@jest/globals` imports. Do not mix the suffixes.

## Running

```bash
npm run test:api:jest   # Jest, no network — always runnable
npm run test:api        # Playwright against the resolved target
npm run test:api:all    # both, Jest first
```

Which app a run is about is the target registry's decision, resolved the same
way by every runner (`tests/lib/target.mjs`):

```bash
npm run test:api                       # default target (targets/config.json)
TARGET=example npm run test:api        # a different registered target
BASE_URL=deployed npm run test:api     # this target's deployedUrl
BASE_URL=<url> npm run test:api        # an explicit URL, start nothing
```

With no `BASE_URL`, a target that declares `start` + `appDir` (wayfarer does)
is built and served locally by Playwright; `APP_DIR` overrides the checkout
location. Jest needs no target at all — it must stay green on a machine with
no network.

## Health gating

`/results` renders from a data backend, and while that backend is down every
`/results` shape returns 500 by design — an environment outage, not a
contract regression. Specs asserting the live `/results` contract therefore
call `gateOnTargetHealth()` (from `tests/api/health.ts`) inside their
describe: one memoised probe of the target's `healthRoute` per worker, and
anything but a 200 skips the block naming the target and its `notes` line
(wayfarer's notes cite `blocker_a3ba1690`). The static surface (`/`, `/plan`,
the 404 page) and the starter specs are deliberately ungated so real
regressions stay visible during an outage.

A dead environment must read as SKIPPED with the cause named — never as red.

## The shared library

`lib/results-url.ts` is the executable form of `contract_1f5a871e`:

- `buildResultsUrl(answers)` — the URL a completed wizard emits: all five
  params always present, `splurges` first and comma-joined (`%2C`), never a
  repeated key.
- `effectiveResultsParams(url)` — the oracle: what any `/results` URL means
  to the app, including the silent traps (repeated param reverts to its
  default; repeated `splurges` parses as no selection; unknown `splurges`
  token still counts as a selection; `detail` is case-sensitive).

`results-url.test.ts` locks those semantics under Jest. Playwright specs (and
the ui lane's, via the board contract) can import the builder to construct
correct URLs instead of hand-assembling query strings and hitting the traps.
If the app drifts from the oracle, that is a board conversation about the
contract — not an edit to make the oracle agree with the app.
