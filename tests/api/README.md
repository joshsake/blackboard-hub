# api lane — two layers, one contract

The api lane tests the HTTP surface of the app under test (wayfarer) and the
contracts it publishes on the board. It runs two layers with a hard division
of labor:

| layer | runner | files | crosses the network? |
| --- | --- | --- | --- |
| live HTTP | Playwright, `project=api` | `*.spec.ts` | yes — request fixture, no browser |
| no-network | Jest | `*.test.ts` | never |

**Jest owns** contract-shape validators, query-param builders and the oracles
the lane maintains — everything in `lib/` plus the `*.test.ts` files that lock
its semantics. **Playwright owns** everything that needs a real server:
status codes, rendered card counts, cross-request ranking comparisons.

The file-pattern split is what keeps the runners apart: `jest.config.mjs`
matches only `*.test.ts`, and the `api` project in `playwright.config.ts`
matches only `*.spec.ts`. Without that, Playwright's default pattern would
load the Jest files and fail on their `@jest/globals` imports. Do not mix the
suffixes.

## Running

```bash
npm run test:api:jest   # Jest, no network — always runnable
npm run test:api        # Playwright against BASE_URL (or a local build)
npm run test:api:all    # both, Jest first
```

Jest runs as ESM (the repo is `type: module`), which is why `test:api:jest`
invokes node with `--experimental-vm-modules`. It needs no target and no
environment — it must stay green on a machine with no network at all.

Playwright picks its target the usual way: `BASE_URL` set means test that
deployment and start nothing; unset means build and serve the app locally
(see `playwright.config.ts`, and `APP_DIR` to point at a different checkout).

## Health gating (finding_98889256)

`/results` renders from a data backend, and while that backend is down every
`/results` shape returns 500 by design — an environment outage that is not a
contract regression. Specs asserting the live `/results` contract therefore
call `gateOnResultsHealth()` (from `health.ts`) inside their describe: one
memoised probe per worker, and anything but a 200 skips the block with a
reason citing `blocker_a3ba1690`. The static surface (`/`, `/plan`, the 404
page) is deliberately ungated so real regressions stay visible during an
outage.

A dead environment must read as SKIPPED with the blocker named — never as red.

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
