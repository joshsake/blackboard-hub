#!/usr/bin/env node
// npm-level preflight for the k6 profiles: resolve the target through the
// shared resolver, verify it declares load journeys, probe it, then either
// exec k6 or SKIP with exit 0.
//
//   node tests/load/preflight.mjs [smoke|baseline|stress] [extra k6 args...]
//
// TARGET RESOLUTION (contract_8f9d0915 / contract_d350537b): TARGET env
// selects the target, targets/config.json "default" otherwise. BASE_URL wins
// verbatim; the literal sentinel "deployed" resolves to the target's
// deployedUrl. With no BASE_URL, a start+appDir target resolves local-build
// and a start-less one falls back to deployedUrl with a printed note.
//
// SKIP CASES (exit 0, contract_feda9def -- a message nobody can misread as a
// pass):
//   - the resolved target declares no load journeys
//     (no targets/<name>/load/journeys.json); nothing is probed
//   - resolution landed in local-build mode: the preflight never builds or
//     starts an app, and probing the localUrl instead would load-test
//     whatever unrelated service happens to hold that port; nothing is probed
//   - nothing answers a probe of the target's root at the network level
//     (explicit-url and deployed modes)
// A target answering ANY HTTP status -- including 500 -- runs and is
// measured; an unhealthy target must be measured red, not skipped.
//
// PROBE ROUTE: always the target root "/", deliberately NOT target.json
// healthRoute. The probe asks "is anything listening", not "is the stack
// healthy" (the api lane's health gate owns that question), and wayfarer's
// healthRoute is its known-broken /results shape while blocker_a3ba1690
// stands -- a route load traffic must not touch on the public deployment.
//
// Exit codes:
//   0      k6 ran and every threshold passed, OR the run was SKIPPED
//          (stdout says which, loudly)
//   1      misuse or misconfiguration: unknown profile, TargetError from the
//          resolver, k6 missing while a target IS reachable
//   other  k6's own exit code (threshold breach, script error), passed through

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveTarget } from '../lib/target.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROFILES = ['smoke', 'baseline', 'stress']

const [profile = 'baseline', ...k6Args] = process.argv.slice(2)

if (!PROFILES.includes(profile)) {
  console.error(
    `load preflight: unknown profile "${profile}" (expected one of: ${PROFILES.join(', ')})`
  )
  process.exit(1)
}

function skip (reason) {
  console.log(`load tests SKIPPED -- ${reason}`)
  console.log('SKIPPED is not a pass: 0 requests were sent, nothing was measured.')
  console.log('To run: point BASE_URL at a reachable deployment (BASE_URL=deployed uses the target\'s deployedUrl), e.g. BASE_URL=deployed npm run test:load')
  process.exit(0)
}

let target
try {
  target = resolveTarget()
} catch (err) {
  if (err.name === 'TargetError') {
    // Misconfiguration, not a missing environment: fail loudly.
    console.error(`load preflight: ${err.message}`)
    process.exit(1)
  }
  throw err
}
if (target.note) console.log(`load preflight: ${target.note}`)

// Journey check comes BEFORE the probe: a journey-less target is a skip and
// deserves zero traffic.
if (!existsSync(join(target.dir, 'load', 'journeys.json'))) {
  skip(`target "${target.name}" has no load journeys (expected targets/${target.name}/load/journeys.json)`)
}

const base = target.baseURL.replace(/\/+$/, '')

// local-build resolutions SKIP without any traffic. The resolver contract
// says this mode means nothing is running unless you start it, and offers
// exactly this choice ("treat that as your skip case or require
// BASE_URL/deployed"). Probing the localUrl instead was tried and proved
// hazardous: whatever unrelated service happens to be squatting that port
// answers the probe and then takes a full profile of load traffic. Load
// against a local instance is one explicit env var away, which is the right
// amount of deliberate.
if (target.mode === 'local-build') {
  skip(
    `target "${target.name}" resolved to local-build (${base}) and the ` +
    'preflight does not build or start apps. Start the app yourself and ' +
    'pass BASE_URL=<url>, or use BASE_URL=deployed'
  )
}

// Probe the target's root (explicit-url and deployed modes only). Any HTTP
// response -- even an error status -- means something is listening, so the
// profile should run and measure it. Only a network-level failure (nothing
// listening, no such host, timeout) reads as "no target" and skips.
try {
  await fetch(`${base}/`, { redirect: 'manual', signal: AbortSignal.timeout(10_000) })
} catch (err) {
  // fetch wraps network errors: TypeError -> cause (sometimes AggregateError).
  const cause = err.cause?.code || err.cause?.errors?.[0]?.code ||
    err.cause?.message || err.name
  skip(`target "${target.name}" (${base}) did not answer the preflight probe (${cause})`)
}

console.log(`load preflight: ${target.name} at ${base} answered; running the ${profile} profile`)

// Path relative to the caller's cwd keeps k6's own output free of absolute
// machine paths, which must never end up pasted into board entries.
// BASE_URL and TARGET go through -e explicitly rather than relying on k6's
// include-system-env-vars default, which differs between k6 subcommands.
const script = relative(process.cwd(), join(HERE, `${profile}.js`))
const res = spawnSync(
  'k6',
  ['run', '-e', `BASE_URL=${base}`, '-e', `TARGET=${target.name}`, script, ...k6Args],
  { stdio: 'inherit' }
)

if (res.error && res.error.code === 'ENOENT') {
  console.error(
    'load preflight: k6 is not installed but the target IS reachable -- ' +
    'this is an environment defect, NOT a skip. Install k6: https://k6.io/docs/'
  )
  process.exit(1)
}
process.exit(res.status ?? 1)
