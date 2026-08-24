import http from 'k6/http'
import { check, group } from 'k6'

// Shared config for every k6 profile in this lane. k6 runs its own JS
// runtime, not Node, so this stays plain JS with k6 imports only.
//
// TARGET RESOLUTION
// BASE_URL is the only way a profile learns its target, and there is
// deliberately no localhost default. The old baseline dialed 127.0.0.1:3000
// whenever BASE_URL was unset and produced a red run indistinguishable at a
// glance from a real performance regression (finding_71ec3f2e). Now:
//   - `npm run test:load` and `npm run test:load:smoke` go through
//     tests/load/preflight.mjs, which SKIPS with exit 0 when no target is
//     configured or reachable.
//   - invoking `k6 run` directly without BASE_URL aborts here, immediately,
//     with this message. It never dials a target that is not there.
if (!__ENV.BASE_URL) {
  throw new Error(
    'BASE_URL is not set -- k6 has no target and will not guess one. ' +
    'Use `npm run test:load` or `npm run test:load:smoke` (they skip cleanly ' +
    'when no target is configured), or set one: k6 run -e BASE_URL=<url> ...'
  )
}

export const BASE_URL = __ENV.BASE_URL.replace(/\/+$/, '')

// ROUTES AND TAGS
// Every request carries a `route` tag so thresholds can budget prerendered
// and server-rendered pages separately.
export const STATIC_PATHS = ['/', '/plan']
export const RESULTS_PATH =
  '/results?party=couple&vibe=local&splurges=food&detail=essentials'

// THRESHOLDS
// Baseline and stress budgets. Thresholds are the point of a load test:
// without them a run cannot fail, and a test that cannot fail is a report,
// not a test. The static routes are prerendered; /results is server-rendered
// per request, so it gets a looser budget rather than dragging the global one.
export const THRESHOLDS = {
  http_req_failed: ['rate<0.01'],
  'http_req_duration{route:static}': ['p(95)<300', 'p(99)<800'],
  'http_req_duration{route:results}': ['p(95)<800', 'p(99)<2000']
}

// Smoke asks "is the target up and the framework wired", not "is it fast".
// Duration budgets stay generous so one cold start on a small deployment does
// not read as a regression; performance budgets belong to baseline.
export const SMOKE_THRESHOLDS = {
  http_req_failed: ['rate<0.01'],
  checks: ['rate>0.99'],
  'http_req_duration{route:static}': ['p(95)<2000']
}

// JOURNEYS
// Shared between profiles so smoke, baseline and stress send the same
// requests and differ only in volume.

// Prerendered routes only. Safe against any live target, including a shared
// public deployment, and deliberately the whole of the smoke profile.
export function visitStaticRoutes () {
  group('static routes', () => {
    for (const path of STATIC_PATHS) {
      const res = http.get(`${BASE_URL}${path}`, { tags: { route: 'static' } })
      check(res, { [`${path} is 200`]: (r) => r.status === 200 })
    }
  })
}

// Server-rendered /results. NOT part of smoke: it needs the app's data
// backend, and while that backend is down every shape of /results returns
// 500 (blocker_a3ba1690) -- loading an erroring route proves nothing and
// pollutes the target's error logs.
export function visitResults () {
  group('dynamic results', () => {
    const res = http.get(`${BASE_URL}${RESULTS_PATH}`, {
      tags: { route: 'results' }
    })
    check(res, { 'results is 200': (r) => r.status === 200 })
  })
}
