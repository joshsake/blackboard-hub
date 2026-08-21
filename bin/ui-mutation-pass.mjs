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
    alsoApi: true,
    why: 'The seed is the only reason an unpicked splurges is emitted at all. Deleting it looks like tidy-up, still returns 200, and leaves the api suite fully green -- only a browser can see the param vanish. The api-suite-green half is the load-bearing claim of the advisory, so this mutation runs BOTH suites against one mutated tree.'
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
  },
  {
    id: 'M6-highlights-gone',
    file: RESULTS,
    find: '                {rec.destination.highlights.map((highlight) => (\n                  <li key={highlight}>{highlight}</li>\n                ))}\n                <li className="text-stone-400">\n                  Rough budget: ~${rec.destination.dailyCost}/day per person\n                </li>',
    replace: '',
    expect: 'detail=essentials leaves every card collapsed',
    why: 'Added after the api lane found a spec of theirs passing while every response was a 500, because it compared two empty extractions. The collapsed-case spec had the same shape: not.toBeVisible() is satisfied by an element that does not exist, so rendering NO highlights looked identical to a correctly collapsed card. CORRECTION to what the commit message for this mutation claims: it did NOT leave the suite fully green. detail=everything asserts toBeVisible() on the same element, so that spec would have caught the missing highlights. The collapsed-case spec alone was blind; the suite was not. The guard still earns its place -- a spec that cannot fail on its own subject is worth fixing, and the pair should not depend on one half covering for the other -- but the claim is narrower than stated. EXPECT COLLATERAL: with the guard in place this mutation correctly reddens detail=everything as well.'
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

/** Run one Playwright project against the server we control and return which
 *  specs passed and which failed, BY TITLE.
 *
 *  The JSON reporter rather than scraping the list reporter: a mutation pass is
 *  only as trustworthy as its ability to say WHICH spec went red, and a regex
 *  over human-readable output is the wrong place to be approximately right. */
function runSuite (project) {
  const cmd = `npx playwright test --project=${project} --reporter=json`
  let stdout
  try {
    stdout = execSync(cmd, {
      cwd: SUITE, encoding: 'utf8', env: { ...process.env, BASE_URL: BASE }, stdio: ['ignore', 'pipe', 'pipe']
    })
  } catch (e) {
    stdout = e.stdout || ''
  }
  const start = stdout.indexOf('{')
  if (start < 0) throw new Error(`${project}: no JSON report produced -- refusing to guess which specs ran`)
  const report = JSON.parse(stdout.slice(start))

  const passed = []
  const failed = []
  const walk = (node) => {
    for (const spec of node.specs || []) {
      (spec.ok ? passed : failed).push(spec.title)
    }
    for (const child of node.suites || []) walk(child)
  }
  for (const s of report.suites || []) walk(s)
  if (!passed.length && !failed.length) throw new Error(`${project}: the report contains no specs -- a run that executed nothing must not be recorded as a result`)
  return { passed, failed }
}

async function once (label, mutation) {
  const record = { label, anchorApplied: mutation ? false : null, build: null, ui: null, api: null, reverted: null }

  if (mutation) {
    const src = readFileSync(mutation.file, 'utf8')
    const re = anchorRe(mutation.find)
    if (!re.test(src)) {
      throw new Error(`${mutation.id}: anchor text not found in ${mutation.file} -- the app changed under this harness, so fix the mutation rather than reporting a result`)
    }
    const next = src.replace(re, mutation.replace)
    writeFileSync(mutation.file, next, 'utf8')
    // Applied means the file actually changed, not that a replace was called.
    record.anchorApplied = next !== src
    if (!record.anchorApplied) throw new Error(`${mutation.id}: replacement left the file byte-identical -- nothing was mutated`)
  }

  let started = false
  try {
    sh('npm run build', APP)
    await serve()
    started = true
    record.build = await assertServingOurBuild()
    record.ui = runSuite('ui')
    // M1 carries the api half: the seed deletion must leave the api suite
    // fully green, because that is the whole point -- the param vanishes at the
    // browser while every /results URL stays legal at the HTTP layer.
    if (mutation?.alsoApi) record.api = runSuite('api')
  } finally {
    if (started) {
      try { sh(`npx --yes kill-port ${PORT}`, APP) } catch { /* port already free */ }
    }
    if (mutation) {
      sh('git checkout -- .', APP)
      record.reverted = clean()
    }
  }
  return record
}

/** Report shape per tests/docs/mutation-evidence-protocol.md: for every run,
 *  anchor applied, build identity, red list, green list, revert verified. */
function report (r, expect) {
  console.log(`\n=== ${r.label} ===`)
  if (r.anchorApplied !== null) console.log(`  anchor applied : ${r.anchorApplied}`)
  console.log(`  BUILD_ID probe : ${r.build} (200 -- server is serving this build)`)
  console.log(`  ui red         : ${r.ui.failed.length ? r.ui.failed.join(' | ') : '(none)'}`)
  console.log(`  ui green       : ${r.ui.passed.length ? r.ui.passed.join(' | ') : '(none)'}`)
  if (r.api) {
    console.log(`  api red        : ${r.api.failed.length ? r.api.failed.join(' | ') : '(none)'}`)
    console.log(`  api green      : ${r.api.passed.length} spec(s)`)
  }
  if (r.reverted !== null) console.log(`  revert verified: ${r.reverted}`)
  if (expect) {
    const hit = r.ui.failed.some(f => f.includes(expect))
    console.log(`  VERDICT        : ${hit ? 'CAUGHT' : 'BLIND -- the targeted spec did not fail'}`)
  }
}

const main = async () => {
  if (!clean()) throw new Error(`${APP} is dirty -- refusing to start`)
  if (await get('/plan') === 200) throw new Error(`something is already listening on ${PORT} -- refusing to start`)

  const baseline = await once('BASELINE', null)
  report(baseline, null)
  if (baseline.ui.failed.length) {
    throw new Error(`baseline is not green (${baseline.ui.failed.join(', ')}) -- a mutation pass on a red baseline proves nothing`)
  }

  const results = []
  for (const m of MUTATIONS) {
    const r = await once(m.id, m)
    report(r, m.expect)
    results.push({
      id: m.id,
      hit: r.ui.failed.some(f => f.includes(m.expect)),
      collateral: r.ui.failed.filter(f => !f.includes(m.expect)),
      apiGreen: r.api ? r.api.failed.length === 0 : null,
      reverted: r.reverted
    })
  }

  console.log('\n--- SUMMARY ---')
  for (const r of results) {
    const extra = r.collateral.length ? `  (also red: ${r.collateral.join(' | ')})` : ''
    const api = r.apiGreen === null ? '' : `  api-suite=${r.apiGreen ? 'GREEN' : 'RED -- the claim this mutation exists to prove has failed'}`
    console.log(`${r.id.padEnd(20)} ${r.hit ? 'CAUGHT' : 'BLIND'}${api}${extra}`)
  }
  if (!clean()) console.log(`\nWARNING: ${APP} left dirty -- restore it before reporting anything`)
  process.exitCode = results.every(r => r.hit && r.reverted && r.apiGreen !== false) ? 0 : 1
}

main().catch(e => {
  console.error(String(e.message || e))
  process.exitCode = 1
})
