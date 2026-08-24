import { thresholdsFor, runSet, BASE_URL } from './lib/config.js'

// Stress profile: LOCAL OR DEDICATED TARGETS ONLY.
//
// This ramp (50 virtual users, several minutes, the target's full journey
// set) is designed to find the point where the app degrades. Pointed at a
// public deployment it is indistinguishable from an attack: it burns a hobby
// plan's quota, pollutes its logs, and measures the platform's rate limiting
// rather than the app. It must only ever run against a target you own
// outright -- a local build or an instance provisioned for load testing.
//
// Two guards enforce that below. They are the reason this file is safe to
// exist; do not remove them to make a run "work".
//
//   k6 run -e BASE_URL=http://localhost:3000 -e TARGET=<name> tests/load/stress.js
//   (no npm script on purpose -- running stress should be a deliberate act)

const host = (BASE_URL.match(/^https?:\/\/([^/:]+)/i) || [])[1] || ''
const LOOPBACK = ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']

// Guard 1: never a *.vercel.app host, no override. Registered targets deploy
// their public instances there, and any sibling deployment shares plan
// limits. Heavier profiles never point at a public deployment.
if (/\.vercel\.app$/i.test(host)) {
  throw new Error(
    `stress profile refuses ${host}: *.vercel.app hosts are public ` +
    'deployments. Heavier profiles never point at a public deployment. ' +
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
  thresholds: thresholdsFor('full')
}

export default function () {
  runSet('full')
}
