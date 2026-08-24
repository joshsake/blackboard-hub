import { sleep } from 'k6'
import { SMOKE_THRESHOLDS, visitStaticRoutes } from './lib/config.js'

// Smoke profile: is the target up and the framework wired? One virtual user,
// a few seconds, prerendered routes only (/ and /plan) -- roughly two
// requests a second, polite enough to point at a shared public deployment.
// It deliberately skips the server-rendered /results journey: smoke is a
// pulse check, not coverage, and must stay harmless even while the target's
// data backend is down (blocker_a3ba1690).
//
// This is not a performance test. Duration budgets live in baseline;
// smoke only fails when requests fail.
//
//   npm run test:load:smoke                       (skips, exit 0, if no target)
//   k6 run -e BASE_URL=<url> tests/load/smoke.js  (aborts if BASE_URL unset)

export const options = {
  vus: 1,
  duration: '10s',
  thresholds: SMOKE_THRESHOLDS
}

export default function () {
  visitStaticRoutes()
  sleep(1)
}
