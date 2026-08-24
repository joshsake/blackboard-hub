import { thresholdsFor, runSet } from './lib/config.js'

// Baseline profile: the reference load shape. Ramp to 10 virtual users, hold
// for a minute, ramp down, across the target's FULL journey set against the
// budgets that set declares in targets/<name>/load/journeys.json. Numbers
// from a baseline run are the comparison point for any future "did it get
// slower".
//
// k6 does not start the app. Point it at an already-running instance:
//   npm run test:load                                (skips, exit 0, if no target)
//   k6 run -e BASE_URL=http://localhost:3000 tests/load/baseline.js

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 0 }
  ],
  thresholds: thresholdsFor('full')
}

export default function () {
  runSet('full')
}
