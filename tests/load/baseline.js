import http from 'k6/http'
import { check, group } from 'k6'

// load lane — k6 runs on its own runtime, not Node, so this stays plain JS
// with k6 imports and is invoked by `k6 run`, never by Playwright.
//
// Unlike the Playwright lanes, k6 does not start the app. Point it at an
// already-running instance:
//   k6 run -e BASE_URL=http://localhost:3000 tests/load/baseline.js

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 0 }
  ],
  // Thresholds are the point of a load test: without them a run cannot fail,
  // and a test that cannot fail is a report, not a test.
  thresholds: {
    http_req_failed: ['rate<0.01'],
    // The static routes are prerendered; /results is server-rendered per
    // request, so it gets a looser budget rather than dragging the global one.
    'http_req_duration{route:static}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{route:results}': ['p(95)<800', 'p(99)<2000']
  }
}

export default function () {
  group('static routes', () => {
    for (const path of ['/', '/plan']) {
      const res = http.get(`${BASE_URL}${path}`, { tags: { route: 'static' } })
      check(res, { [`${path} is 200`]: (r) => r.status === 200 })
    }
  })

  group('dynamic results', () => {
    const qs = 'party=couple&vibe=local&splurges=food&detail=essentials'
    const res = http.get(`${BASE_URL}/results?${qs}`, { tags: { route: 'results' } })
    check(res, { 'results is 200': (r) => r.status === 200 })
  })
}
