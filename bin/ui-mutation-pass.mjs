#!/usr/bin/env node
// ui lane -- mutation pass for tests/ui/results-contract.spec.ts.
//
// A green suite cannot report that it is blind. This breaks the app in five
// targeted ways, one per spec, and checks that exactly the intended spec goes
// red. It exists because the previous pass cannot be trusted: it may have run
// through Playwright's webServer with reuseExistingServer:true, which silently
// serves the PREVIOUS mutation's build (api, question_5fcf9c0e).
//
// Two guards make that failure unrepeatable here:
//   1. BASE_URL is always set, so Playwright starts nothing and can reuse
//      nothing. The webServer branch of playwright.config.ts never executes.
//   2. Before every suite run, the LIVE SERVER is probed for the build id just
//      written to disk. GET /_next/static/<BUILD_ID>/_ssgManifest.js returns
//      200 only if the server is serving that exact build, and 404 otherwise --
//      verified both ways against a real server. That proves WHICH BINARY is
//      under test without needing a per-mutation observable, which matters
//      because most of these mutations are client-side and invisible to curl.
//
// Fully isolated per finding_663e7231: own app worktree, own port. This never
// touches C:/automation/wayfarer.

import { execSync, spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const APP = 'C:/automation/wayfarer-lanes/ui'
const SUITE = 'C:/automation/hub-lanes/ui'
const PORT = 3102
const BASE = `http://localhost:${PORT}`

const WIZARD = `${APP}/src/components/Wizard.tsx`
const RESULTS = `${APP}/src/app/results/page.tsx`

// One mutation per spec. `expect` names the spec that MUST go red; every other
// spec must stay green, because a mutation that reddens the whole suite proves
// nothing about the spec it was aimed at.
const MUTATIONS = [
  {
    id: 'M1-seed-deleted',
    file: WIZARD,
    find: '  const [answers, setAnswers] = useState<Record<string, string | string[]>>({\n    splurges: [],\n  });',
    replace: '  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});',
    expect: 'a completed wizard emits all five params, including an empty splurges',
    why: 'The seed is the only reason an unpicked splurges is emitted at all. Deleting it looks like tidy-up, still returns 200, and leaves the api suite fully green -- only a browser can see the param vanish.'
  },
  {
    id: 'M2-splurges-repeated',
    file: WIZARD,
    find: '      params.set(key, Array.isArray(value) ? value.join(",") : value);',
    replace: '      if (Array.isArray(value)) { for (const v of value) params.append(key, v); } else { params.set(key, value); }',
    expect: 'multi-select emits one comma-joined splurges, never the repeated form',
    why: 'The repeated form parses as NO selection, so the page still renders fine with a different ranking and nothing errors.'
  },
  {
    id: 'M3-every-param-twice',
    file: WIZARD,
    find: '      params.set(key, Array.isArray(value) ? value.join(",") : value);',
    replace: '      params.append(key, Array.isArray(value) ? value.join(",") : value);\n      params.append(key, Array.isArray(value) ? value.join(",") : value);',
    expect: 'no param is ever emitted twice',
    why: 'A repeated param silently reverts to its default -- the ranking changes with no error anywhere.'
  },
  {
    id: 'M4-never-expands',
    file: RESULTS,
    find: '<details className="mt-4 group" open={showEverything}>',
    replace: '<details className="mt-4 group" open={false}>',
    expect: 'detail=everything expands every card in the browser',
    why: 'detail=everything silently stops honouring the request.'
  },
  {
    id: 'M5-always-expands',
    file: RESULTS,
    find: '<details className="mt-4 group" open={showEverything}>',
    replace: '<details className="mt-4 group" open={true}>',
    expect: 'detail=essentials leaves every card collapsed',
    why: 'The mirror of M4. Without a collapsed-case spec, always-open content would satisfy the expanded-case spec too -- this is what gives that pair teeth.'
  }
]

const sh = (cmd, cwd) => execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const clean = () => sh('git status --porcelain', APP).trim() === ''

// The app checkout uses CRLF. Anchors are written with plain \n above because
// that is how the source reads, so every anchor is matched line-ending-agnostic
// rather than duplicated in two forms. A literal-string match silently found
// nothing here and would have aborted the pass with "the app changed".
const anchorRe = (literal) =>
  new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n'))

async function get (path) {
  try {
    const r = await fetch(`${BASE}${path}`)
    return r.status
  } catch {
    return 0
  }
}

async function serve () {
  const p = spawn('npm', ['run', 'start'], {
    cwd: APP, env: { ...process.env, PORT: String(PORT) }, shell: true, stdio: 'ignore'
  })
  for (let i = 0; i < 60; i++) {
    if (await get('/plan') === 200) return p
    await new Promise(r => setTimeout(r, 500))
  }
  p.kill()
  throw new Error('server never became ready')
}

/** The guard that makes this pass trustworthy: prove the server is serving the
 *  build just made, not a survivor from the previous mutation. */
async function assertServingOurBuild () {
  const id = readFileSync(`${APP}/.next/BUILD_ID`, 'utf8').trim()
  const status = await get(`/_next/static/${id}/_ssgManifest.js`)
  if (status !== 200) {
    throw new Error(`server is NOT serving build ${id} (probe returned ${status}) -- aborting rather than recording a result about an unknown binary`)
  }
  return id
}

function runSuite () {
  try {
    execSync('npm run test:ui', {
      cwd: SUITE, encoding: 'utf8', env: { ...process.env, BASE_URL: BASE }, stdio: ['ignore', 'pipe', 'pipe']
    })
    return []
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}`
    return [...out.matchAll(/^\s*(?:not ok|x)\s*\d*\s*\[ui\][^>]*>[^>]*>\s*(.+?)(?:\s*\(\d+ms\))?\s*$/gm)].map(m => m[1].trim())
  }
}

async function once (label, mutation) {
  if (mutation) {
    const src = readFileSync(mutation.file, 'utf8')
    const re = anchorRe(mutation.find)
    if (!re.test(src)) {
      throw new Error(`${mutation.id}: anchor text not found in ${mutation.file} -- the app changed under this harness, so fix the mutation rather than reporting a result`)
    }
    writeFileSync(mutation.file, src.replace(re, mutation.replace), 'utf8')
  }
  let started = false
  try {
    sh('npm run build', APP)
    await serve()
    started = true
    const build = await assertServingOurBuild()
    const failed = runSuite()
    console.log(`${label.padEnd(20)} build=${build} failed=${failed.length ? failed.join(' | ') : '(none)'}`)
    return failed
  } finally {
    if (started) {
      try { sh(`npx --yes kill-port ${PORT}`, APP) } catch { /* port already free */ }
    }
    if (mutation) sh('git checkout -- .', APP)
  }
}

const main = async () => {
  if (!clean()) throw new Error(`${APP} is dirty -- refusing to start`)
  if (await get('/plan') === 200) throw new Error(`something is already listening on ${PORT} -- refusing to start`)

  const baseline = await once('BASELINE', null)
  if (baseline.length) {
    throw new Error(`baseline is not green (${baseline.join(', ')}) -- a mutation pass on a red baseline proves nothing`)
  }

  const results = []
  for (const m of MUTATIONS) {
    const failed = await once(m.id, m)
    results.push({
      id: m.id,
      hit: failed.some(f => f.includes(m.expect)),
      collateral: failed.filter(f => !f.includes(m.expect))
    })
  }

  console.log('\n--- VERDICT ---')
  for (const r of results) {
    const extra = r.collateral.length ? `  (also red: ${r.collateral.join(' | ')})` : ''
    console.log(`${r.id.padEnd(20)} ${r.hit ? 'CAUGHT' : 'BLIND -- the spec did not fail'}${extra}`)
  }
  if (!clean()) console.log(`\nWARNING: ${APP} left dirty -- restore it before reporting anything`)
  process.exitCode = results.every(r => r.hit) ? 0 : 1
}

main().catch(e => {
  console.error(String(e.message || e))
  process.exitCode = 1
})
