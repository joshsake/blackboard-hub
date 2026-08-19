import http from 'k6/http'
import { check } from 'k6'

// k6 runs on its own runtime, not Node -- this stays plain JS with k6 imports
// and is invoked by `k6 run`, never by Playwright.
//
// Baseline shape only. Thresholds are the point of a load test: without them
// a run cannot fail, and a test that cannot fail is a report, not a test.

const BASE_URL = __ENV.BASE_URL

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 0 }
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500', 'p(99)<1500']
  }
}

export function setup () {
  if (!BASE_URL) {
    throw new Error('BASE_URL is required: k6 run -e BASE_URL=https://... tests/load/baseline.js')
  }
}

export default function () {
  const res = http.get(`${BASE_URL}/health`)
  check(res, {
    'status is 200': (r) => r.status === 200
  })
}
