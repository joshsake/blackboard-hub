import { THRESHOLDS, visitStaticRoutes, visitResults, BASE_URL } from './lib/config.js'

// Stress profile: LOCAL OR DEDICATED TARGETS ONLY.
//
// This ramp (50 virtual users, several minutes, every route including the
// server-rendered /results) is designed to find the point where the app
// degrades. Pointed at the public deployment it is indistinguishable from an
// attack: it burns a hobby plan's quota, pollutes its logs, and measures the
// platform's rate limiting rather than the app. It must only ever run
// against a target you own outright -- a local build or an instance
// provisioned for load testing.
//
// Two guards enforce that below. They are the reason this file is safe to
// exist; do not remove them to make a run "work".
//
//   k6 run -e BASE_URL=http://localhost:3000 tests/load/stress.js
//   (no npm script on purpose -- running stress should be a deliberate act)

const host = (BASE_URL.match(/^https?:\/\/([^/:]+)/i) || [])[1] || ''
const LOOPBACK = ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']

// Guard 1: never a *.vercel.app host, no override. The project's public
// deployment lives there, and any sibling deployment shares its plan limits.
if (/\.vercel\.app$/i.test(host)) {
  throw new Error(
    `stress profile refuses ${host}: *.vercel.app is the public deployment's ` +
    'platform. Heavier profiles never point at the public deployment. ' +
    'Use a local build or a dedicated load-testing instance.'
  )
}

// Guard 2: any other non-loopback host needs an explicit acknowledgement
// that the target is yours to saturate.
if (!LOOPBACK.includes(host.toLowerCase()) &&
    __ENV.STRESS_ALLOW_REMOTE !== 'i-own-this-target') {
  throw new Error(
    `stress profile refuses non-local target ${host}. If this instance is ` +
    'provisioned for load testing and you own it, re-run with ' +
    '-e STRESS_ALLOW_REMOTE=i-own-this-target'
  )
}

export const options = {
  stages: [
    { duration: '1m', target: 20 },
    { duration: '2m', target: 50 },
    { duration: '2m', target: 50 },
    { duration: '1m', target: 0 }
  ],
  thresholds: THRESHOLDS
}

export default function () {
  visitStaticRoutes()
  visitResults()
}
