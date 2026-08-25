// Helper for test/resolver.sh — the committed form of the resolver-contract
// regression matrix (contract_8f9d0915). This existed first as a hand-run
// seven-case check reported in a finding; the audit refused author-memory as
// coverage, so it lives here now and test:board runs it every time.
//
// Two halves:
//   - the resolution matrix, driven through resolveTarget(env) with explicit
//     env objects (the export is pure in env, so no subprocesses needed)
//   - the registry rules from contract_d350537b over the COMMITTED targets/
//     tree: every target.json name matches its directory, and the config
//     default names a target that exists
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveTarget, specPatterns, TargetError } from '../tests/lib/target.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`  ${ok ? 'PASS ' : 'FAIL '} ${name}${ok ? '' : ` -- got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
  if (!ok) fail = 1
}

const wayfarer = JSON.parse(readFileSync(join(ROOT, 'targets', 'wayfarer', 'target.json'), 'utf8'))

// --- the resolution matrix (the hand-run seven, committed) ------------------

const dflt = resolveTarget({})
check('default resolves local-build on the default target',
  [dflt.name, dflt.mode, dflt.baseURL, dflt.note],
  ['wayfarer', 'local-build', wayfarer.localUrl, null])

check('local-build webServer carries the descriptor start verbatim',
  [dflt.webServer.command, dflt.webServer.url, dflt.webServer.timeoutMs,
    dflt.webServer.cwd.replace(/\\/g, '/').endsWith('/wayfarer')],
  [wayfarer.start.command, wayfarer.localUrl, wayfarer.start.timeoutMs, true])

const sentinel = resolveTarget({ BASE_URL: 'deployed' })
check('BASE_URL=deployed resolves the sentinel to deployedUrl, no webServer',
  [sentinel.mode, sentinel.baseURL, sentinel.webServer],
  ['deployed', wayfarer.deployedUrl, null])

const explicit = resolveTarget({ BASE_URL: 'http://127.0.0.1:9999' })
check('an explicit BASE_URL wins verbatim',
  [explicit.mode, explicit.baseURL],
  ['explicit-url', 'http://127.0.0.1:9999'])

const appdir = resolveTarget({ APP_DIR: '/somewhere/else' })
check('APP_DIR overrides the descriptor appDir',
  appdir.webServer.cwd, '/somewhere/else')

const example = resolveTarget({ TARGET: 'example' })
check('a start-less target falls back to deployedUrl and says so',
  [example.mode, example.baseURL, typeof example.note === 'string' && example.note.includes('deployedUrl')],
  ['deployed', 'https://example.com', true])

const exampleSentinel = resolveTarget({ TARGET: 'example', BASE_URL: 'deployed' })
check('the sentinel on a start-less target is not a fallback (no note)',
  [exampleSentinel.baseURL, exampleSentinel.note],
  ['https://example.com', null])

let thrown = null
try { resolveTarget({ TARGET: 'nope' }) } catch (e) { thrown = e }
check('an unknown target throws TargetError, never a guess',
  [thrown instanceof TargetError, thrown?.name],
  [true, 'TargetError'])

// --- specPatterns shape (wave-2 lanes consume this blind) -------------------

check('specPatterns returns target tree plus starter tree, in that order',
  specPatterns('api', 'example'),
  ['targets/example/api/**/*.spec.ts', 'tests/api/starter/**/*.spec.ts'])

// --- registry rules over the committed tree (contract_d350537b) -------------

const targetsDir = join(ROOT, 'targets')
const dirs = readdirSync(targetsDir).filter(n => statSync(join(targetsDir, n)).isDirectory())
const mismatches = dirs
  .filter(n => existsSync(join(targetsDir, n, 'target.json')))
  .map(n => [n, JSON.parse(readFileSync(join(targetsDir, n, 'target.json'), 'utf8')).name])
  .filter(([dir, name]) => dir !== name)
const missing = dirs.filter(n => !existsSync(join(targetsDir, n, 'target.json')))
check('every committed target.json name matches its directory',
  [mismatches, missing], [[], []])

const cfg = JSON.parse(readFileSync(join(targetsDir, 'config.json'), 'utf8'))
check('the config default names a target that exists',
  existsSync(join(targetsDir, cfg.default, 'target.json')), true)

process.exit(fail)
