#!/usr/bin/env node
// Load-lane run wrapper. Makes `npm run test:load` self-contained: boot the app
// under test, wait until it actually serves, run k6 against it, tear down what
// we started -- pass or fail, including on Ctrl-C.
//
// k6 has no equivalent of Playwright's webServer block; it runs on its own
// runtime and expects a URL to already exist. That gap is what this file fills,
// and it deliberately mirrors playwright.config.ts rather than inventing a
// second convention: same APP_DIR, same BASE_URL override, same port, same
// build-then-start command, same reuse-an-existing-server behaviour.
//
//   node bin/run-load.mjs              boot, run k6, tear down
//   node bin/run-load.mjs --check      boot, probe, tear down -- everything
//                                      except k6. Works without k6 installed.
//   BASE_URL=https://... npm run test:load    target a deployed environment,
//                                             start and stop nothing.
//
// Any extra arguments are forwarded to k6, so `npm run test:load -- --vus 50`
// works.
import { spawn, execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { connect } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

// Lanes run from their own worktrees, so a path relative to this file resolves
// differently in each one. --git-common-dir returns the main checkout's .git
// from every worktree, so anchoring on it gives one answer everywhere. Same
// helper as playwright.config.ts and bin/board.mjs.
function mainCheckout () {
  try {
    const common = execSync('git rev-parse --path-format=absolute --git-common-dir', {
      cwd: HERE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
    return common ? dirname(common) : REPO
  } catch { return REPO }
}

const APP_DIR = process.env.APP_DIR || resolve(join(mainCheckout(), '..', 'wayfarer'))
const LOCAL_PORT = 3000
const LOCAL_URL = `http://localhost:${LOCAL_PORT}`
const LOAD_SCRIPT = join(REPO, 'tests', 'load', 'baseline.js')
const READY_TIMEOUT_MS = 180_000   // matches the playwright webServer timeout
const REUSE_TIMEOUT_MS = 30_000    // a server already up should answer soon
const READY_POLL_MS = 500

// Mirrors the routes tests/load/baseline.js requests. Kept as its own list
// rather than imported from the k6 script: baseline.js runs on the k6 runtime,
// and nothing here is allowed to change under a runtime this wrapper cannot
// execute. --check exists to prove the app boots and serves, not to stand in
// for k6 coverage.
const CHECK_PATHS = [
  '/',
  '/plan',
  '/results?party=couple&vibe=local&splurges=food&detail=essentials'
]

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const k6Args = args.filter(a => a !== '--check')

const log = (...m) => console.log('[run-load]', ...m)
const fail = (...m) => { console.error('[run-load]', ...m) }

async function probe (url, timeoutMs = 2000) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: 'manual' })
    return res.status
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

// "Is anything listening" and "is it answering HTTP yet" are different
// questions, and conflating them started a second server on top of a healthy
// one: a cold `next start` can take several seconds to answer its first
// request, so a short HTTP probe reports the port as free when it is not.
// A TCP connect answers the first question in milliseconds either way, so the
// HTTP probe that follows can afford to be patient.
function portOpen (host, port, timeoutMs = 1000) {
  return new Promise((done) => {
    const sock = connect({ host, port })
    const finish = (result) => { sock.destroy(); done(result) }
    sock.setTimeout(timeoutMs)
    sock.once('connect', () => finish(true))
    sock.once('timeout', () => finish(false))
    sock.once('error', () => finish(false))
  })
}

// Kill the whole tree. `npm run start` on Windows is cmd -> npm -> node, so
// killing the pid we hold orphans the server that actually owns the port; the
// next run then silently reuses a server nobody is tracking. taskkill /T is the
// only reliable way down that chain, and POSIX gets the process group.
function killTree (child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' })
    } else {
      process.kill(-child.pid, 'SIGTERM')
    }
  } catch { /* already gone */ }
}

async function waitForReady (url, child, timeoutMs = READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(`the app exited with code ${child.exitCode} before it began serving`)
    }
    const status = await probe(url, 2000)
    if (status !== null) return status
    await new Promise(r => setTimeout(r, READY_POLL_MS))
  }
  throw new Error(`${url} did not respond within ${timeoutMs / 1000}s`)
}

function startApp () {
  if (!existsSync(APP_DIR)) {
    throw new Error(
      `the app under test is not at ${APP_DIR}\n` +
      '  Set APP_DIR to its checkout, or set BASE_URL to target a running instance.'
    )
  }
  // Build then start, exactly as playwright.config.ts does. The build is what
  // makes a run work in CI, where the checkout arrives with no .next.
  log(`starting the app under test in ${APP_DIR}`)
  return spawn('npm run build && npm run start', {
    cwd: APP_DIR,
    shell: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'inherit', 'inherit']
  })
}

// Checked BEFORE the app is started, so a missing binary costs nothing instead
// of a full next build first. The spawn-time ENOENT handler below cannot carry
// this on Windows: with shell:true a missing command is cmd.exe exiting 1 with
// its own message, not an ENOENT event, so the guidance never reached anyone.
function k6Missing () {
  const probeCmd = process.platform === 'win32' ? 'where k6' : 'command -v k6'
  try {
    execSync(probeCmd, { stdio: 'ignore', shell: true })
    return false
  } catch {
    return true
  }
}

function reportK6Missing () {
  fail('k6 is not installed, so the load run cannot start.')
  fail('  winget install k6.k6   (or: choco install k6)')
  fail('  Then open a new shell so PATH picks it up.')
  fail('  Everything else -- boot, readiness, teardown -- works without it;')
  fail('  `npm run test:load:check` exercises exactly that much.')
}

function runK6 (baseUrl) {
  return new Promise((done) => {
    const child = spawn('k6', ['run', '-e', `BASE_URL=${baseUrl}`, ...k6Args, LOAD_SCRIPT], {
      stdio: 'inherit',
      shell: process.platform === 'win32'
    })
    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reportK6Missing()
        done(127)
      } else {
        fail(`could not launch k6: ${err.message}`)
        done(1)
      }
    })
    child.on('close', (code) => done(code === null ? 1 : code))
  })
}

async function runCheck (baseUrl) {
  log('--check: probing the routes the load script requests (k6 is not invoked)')
  let bad = 0
  for (const path of CHECK_PATHS) {
    const status = await probe(baseUrl + path, 10_000)
    const ok = status === 200
    if (!ok) bad++
    log(`  ${ok ? 'ok  ' : 'FAIL'} ${status ?? 'no response'}  ${path}`)
  }
  return bad === 0 ? 0 : 1
}

async function main () {
  // Two modes, the same split playwright.config.ts uses: an explicit BASE_URL
  // means a target already exists and is not ours to start or stop.
  const external = process.env.BASE_URL
  let child = null
  const baseUrl = external || LOCAL_URL

  // Fail before doing any expensive work. --check is the one mode that is
  // designed to run without k6, so it skips this gate.
  if (!checkOnly && k6Missing()) {
    reportK6Missing()
    return 127
  }

  if (external) {
    log(`using BASE_URL=${external}; not starting anything locally`)
    const status = await probe(external, 10_000)
    if (status === null) throw new Error(`BASE_URL ${external} is not responding`)
    log(`target responded ${status}`)
  } else {
    // Reuse whatever is already serving, so a dev server left running is not
    // fought over -- and so we never kill a server we did not start. Starting a
    // second server on an occupied port is worse than it looks: Next.js moves
    // to another port, readiness then passes against the ORIGINAL server, and
    // the run measures a process this wrapper never started and cannot stop.
    const occupied = await portOpen('localhost', LOCAL_PORT)
    if (occupied) {
      log(`something is already listening on ${LOCAL_URL}; waiting for it to answer`)
      const existing = await waitForReady(LOCAL_URL, null, REUSE_TIMEOUT_MS)
      log(`reusing it (responded ${existing})`)
    } else {
      child = startApp()
      const status = await waitForReady(LOCAL_URL, child)
      log(`app is serving ${LOCAL_URL} (responded ${status})`)
    }
  }

  const onSignal = () => { killTree(child); process.exit(130) }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)

  try {
    return checkOnly ? await runCheck(baseUrl) : await runK6(baseUrl)
  } finally {
    if (child) {
      log('stopping the app under test')
      killTree(child)
    }
  }
}

main()
  .then(code => process.exit(code))
  .catch(err => { fail(err.message); process.exit(1) })
