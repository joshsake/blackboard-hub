#!/usr/bin/env node
// npm-level preflight for the k6 profiles: probe the target, then either
// exec k6 or skip with exit 0.
//
//   node tests/load/preflight.mjs [smoke|baseline|stress] [extra k6 args...]
//
// Why this exists: k6 cannot express "skipped" -- an abort from setup() or
// init still exits non-zero -- and the old behaviour (default the target to
// localhost:3000 and run regardless) turned "no app on this machine" into a
// red run indistinguishable from a real performance regression
// (finding_71ec3f2e). The requirement from task_b9db4231: a run with no
// reachable target must exit 0 and print a message nobody can misread as a
// pass. That decision has to live above k6, so it lives here, and the npm
// scripts test:load / test:load:smoke route through this file.
//
// Exit codes:
//   0      k6 ran and every threshold passed, OR the run was SKIPPED
//          (stdout says which, loudly)
//   1      preflight misuse: unknown profile, or k6 missing while a target
//          IS reachable (that is an environment defect, not a skip)
//   other  k6's own exit code (threshold breach, script error), passed through

import { spawnSync } from 'node:child_process'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

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
  console.log('To run: point BASE_URL at a reachable deployment, e.g. BASE_URL=<url> npm run test:load')
  process.exit(0)
}

const base = (process.env.BASE_URL || '').replace(/\/+$/, '')
if (!base) skip('no target: BASE_URL is not set')

// Probe the target's root. Any HTTP response -- even an error status --
// means something is listening, so the profile should run and measure it.
// Only a network-level failure (nothing listening, no such host, timeout)
// reads as "no target" and skips.
try {
  await fetch(`${base}/`, { redirect: 'manual', signal: AbortSignal.timeout(10_000) })
} catch (err) {
  // fetch wraps network errors: TypeError -> cause (sometimes AggregateError).
  const cause = err.cause?.code || err.cause?.errors?.[0]?.code ||
    err.cause?.message || err.name
  skip(`target ${base} did not answer the preflight probe (${cause})`)
}

console.log(`load preflight: ${base} answered; running the ${profile} profile`)

// Path relative to the caller's cwd keeps k6's own output free of absolute
// machine paths, which must never end up pasted into board entries.
const script = relative(process.cwd(), join(HERE, `${profile}.js`))
// BASE_URL goes through -e explicitly rather than relying on k6's
// include-system-env-vars default, which differs between k6 subcommands.
const res = spawnSync('k6', ['run', '-e', `BASE_URL=${base}`, script, ...k6Args], {
  stdio: 'inherit'
})

if (res.error && res.error.code === 'ENOENT') {
  console.error(
    'load preflight: k6 is not installed but the target IS reachable -- ' +
    'this is an environment defect, NOT a skip. Install k6: https://k6.io/docs/'
  )
  process.exit(1)
}
process.exit(res.status ?? 1)
