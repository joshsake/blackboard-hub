import { sleep } from 'k6'
import { smokeThresholds, runSet } from './lib/config.js'

// Smoke profile: is the target up and the framework wired? One virtual user,
// a few seconds, roughly one journey per second -- polite enough to point at
// a shared public deployment. WHICH routes it touches is target data: the
// "smoke" set in targets/<name>/load/journeys.json, which is where a target
// keeps risky or backend-dependent routes out (wayfarer excludes its
// server-rendered /results there, citing blocker_a3ba1690).
//
// This is not a performance test. Duration budgets live in baseline;
// smoke only fails when requests fail.
//
//   npm run test:load:smoke                       (skips, exit 0, if no target)
//   k6 run -e BASE_URL=<url> tests/load/smoke.js  (aborts if BASE_URL unset)

export const options = {
  vus: 1,
  duration: '10s',
  thresholds: smokeThresholds()
}

export default function () {
  runSet('smoke')
  sleep(1)
}
