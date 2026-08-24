import { THRESHOLDS, visitStaticRoutes, visitResults } from './lib/config.js'

// Baseline profile: the reference load shape. Ramp to 10 virtual users, hold
// for a minute, ramp down, across every route -- prerendered and
// server-rendered -- against the budgets in lib/config.js. Numbers from a
// baseline run are the comparison point for any future "did it get slower".
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
  thresholds: THRESHOLDS
}

export default function () {
  visitStaticRoutes()
  visitResults()
}
