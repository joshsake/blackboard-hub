import http from 'k6/http'
import { check, group } from 'k6'

// Target-agnostic k6 engine config. k6 runs its own JS runtime, not Node, so
// this stays plain JS with k6 imports only.
//
// JOURNEYS ARE DATA, NOT CODE (task_16c3eb07). k6 module imports are static,
// so per-target journey *code* cannot be loaded dynamically. The pattern
// chosen instead: each target declares its journeys as JSON at
// targets/<name>/load/journeys.json, read here at init time via open() with
// a computed path. open() resolves relative to this module's directory.
//
// journeys.json schema (this file is the schema authority):
//   target   string -- must equal the target directory name
//   groups   { <groupName>: { paths: [string, ...],
//                             budgetMs?: { p95?: ms, p99?: ms } } }
//            Group names become the k6 `route` tag and the per-route
//            http_req_duration threshold keys. budgetMs is the target's own
//            performance budget; omit it and the group gets availability
//            checks only.
//   sets     { smoke: [groupName, ...], full: [groupName, ...] }
//            Which groups each profile family touches. smoke must stay cheap
//            and safe against a shared public deployment; baseline and
//            stress run the full set.
//   _comment keys are ignored everywhere.
//
// TARGET AND BASE_URL arrive via -e from tests/load/preflight.mjs, which
// resolves them through the shared resolver tests/lib/target.mjs
// (contract_8f9d0915). Direct k6 runs must pass -e BASE_URL=<real url>;
// -e TARGET falls back to the targets/config.json "default".

if (!__ENV.BASE_URL) {
  throw new Error(
    'BASE_URL is not set -- k6 has no target and will not guess one. ' +
    'Use `npm run test:load` or `npm run test:load:smoke` (they resolve the ' +
    'target and skip cleanly when nothing answers), or set one: ' +
    'k6 run -e BASE_URL=<url> ...'
  )
}
if (__ENV.BASE_URL === 'deployed') {
  throw new Error(
    'BASE_URL=deployed is a resolver sentinel, resolved by the npm scripts ' +
    'via tests/lib/target.mjs. Direct k6 runs need a real URL: ' +
    'k6 run -e BASE_URL=<url> ...'
  )
}

export const BASE_URL = __ENV.BASE_URL.replace(/\/+$/, '')

// Paths are relative to THIS file (tests/load/lib/), so the repo root is
// three levels up.
const ROOT_REL = '../../..'

export const TARGET_NAME = __ENV.TARGET || defaultTarget()

function defaultTarget () {
  let name
  try {
    name = JSON.parse(open(`${ROOT_REL}/targets/config.json`)).default
  } catch (e) {
    throw new Error(`TARGET is unset and targets/config.json could not be read: ${e.message}`)
  }
  if (!name) throw new Error('TARGET is unset and targets/config.json has no "default"')
  return name
}

export const JOURNEYS = loadJourneys(TARGET_NAME)

function loadJourneys (name) {
  const repoRel = `targets/${name}/load/journeys.json`
  let raw
  try {
    raw = open(`${ROOT_REL}/${repoRel}`)
  } catch (e) {
    throw new Error(
      `target "${name}" has no load journeys (expected ${repoRel}). ` +
      'The npm scripts skip this case with exit 0; direct k6 runs fail loudly.'
    )
  }
  let data
  try {
    data = JSON.parse(raw)
  } catch (e) {
    throw new Error(`${repoRel} is not valid JSON: ${e.message}`)
  }
  if (data.target !== name) {
    throw new Error(`${repoRel} declares target "${data.target}", expected "${name}"`)
  }
  const groups = data.groups || {}
  const groupNames = Object.keys(groups)
  if (!groupNames.length) throw new Error(`${repoRel} declares no groups`)
  for (const g of groupNames) {
    if (!Array.isArray(groups[g].paths) || !groups[g].paths.length) {
      throw new Error(`${repoRel} group "${g}" has no paths`)
    }
  }
  for (const setName of ['smoke', 'full']) {
    const set = data.sets && data.sets[setName]
    if (!Array.isArray(set) || !set.length) {
      throw new Error(`${repoRel} sets.${setName} is missing or empty`)
    }
    for (const g of set) {
      if (!groups[g]) throw new Error(`${repoRel} sets.${setName} references unknown group "${g}"`)
    }
  }
  return data
}

// ENGINE CONSTANTS
// Thresholds are the point of a load test: without them a run cannot fail,
// and a test that cannot fail is a report, not a test.
const FAILURE_RATE = ['rate<0.01']
// Smoke asks "is the target up and the framework wired", not "is it fast" --
// generous so one cold start does not read as a regression.
const SMOKE_P95_MS = 2000

// Baseline/stress thresholds: global failure rate plus each group's own
// budget from journeys.json, keyed by its route tag.
export function thresholdsFor (setName) {
  const th = { http_req_failed: FAILURE_RATE }
  for (const g of JOURNEYS.sets[setName]) {
    const b = JOURNEYS.groups[g].budgetMs
    if (!b) continue
    const budgets = []
    if (b.p95 != null) budgets.push(`p(95)<${b.p95}`)
    if (b.p99 != null) budgets.push(`p(99)<${b.p99}`)
    if (budgets.length) th[`http_req_duration{route:${g}}`] = budgets
  }
  return th
}

// Smoke thresholds: availability-focused, engine-owned lax duration budget.
export function smokeThresholds () {
  const th = { http_req_failed: FAILURE_RATE, checks: ['rate>0.99'] }
  for (const g of JOURNEYS.sets.smoke) {
    th[`http_req_duration{route:${g}}`] = [`p(95)<${SMOKE_P95_MS}`]
  }
  return th
}

// One iteration over a journey set: every group, every path, expecting 200.
export function runSet (setName) {
  for (const g of JOURNEYS.sets[setName]) {
    group(g, () => {
      for (const path of JOURNEYS.groups[g].paths) {
        const res = http.get(`${BASE_URL}${path}`, { tags: { route: g } })
        check(res, { [`${path} is 200`]: (r) => r.status === 200 })
      }
    })
  }
}
