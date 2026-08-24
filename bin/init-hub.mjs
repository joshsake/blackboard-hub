#!/usr/bin/env node
// Reset an instantiated template copy to a blank hub (contract_d350537b).
//
//   node bin/init-hub.mjs            show what WOULD change (dry-run, default)
//   node bin/init-hub.mjs --force    actually do it
//
// A hub instantiated from the GitHub template arrives carrying this project's
// engagement: its board history and its registered targets. A new engagement
// starts from neither — but deleting is destructive, so nothing happens
// until --force.
//
// What it does:
//   - clears board/entries/*.jsonl        (the previous engagement's record)
//   - clears board/registrations/*.json   (machine-local runtime state)
//   - removes every targets/<name> except "example" (the zero-knowledge
//     proof target stays so the fresh hub has one working target)
//   - resets targets/config.json default to "example"
//
// --root <dir> points at a different checkout; it exists for the test suite
// (test/init-hub.sh) and is not needed in normal use.
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const force = argv.includes('--force')
const rootIdx = argv.indexOf('--root')
const ROOT = rootIdx !== -1 && argv[rootIdx + 1]
  ? argv[rootIdx + 1]
  : join(dirname(fileURLToPath(import.meta.url)), '..')

const unknown = argv.filter((a, i) =>
  a !== '--force' && a !== '--root' && !(rootIdx !== -1 && i === rootIdx + 1))
if (unknown.length) {
  console.error(`init-hub: unknown argument(s): ${unknown.join(' ')}`)
  console.error('usage: node bin/init-hub.mjs [--force] [--root <dir>]')
  process.exit(1)
}

const KEEP_TARGET = 'example'
const actions = [] // { desc, run }

function listFiles (dir, suffix) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(f => f.endsWith(suffix)).map(f => join(dir, f))
}

for (const f of listFiles(join(ROOT, 'board', 'entries'), '.jsonl')) {
  actions.push({ desc: `remove ${rel(f)}`, run: () => rmSync(f) })
}
for (const f of listFiles(join(ROOT, 'board', 'registrations'), '.json')) {
  actions.push({ desc: `remove ${rel(f)}`, run: () => rmSync(f) })
}

const targetsDir = join(ROOT, 'targets')
if (existsSync(targetsDir)) {
  for (const name of readdirSync(targetsDir)) {
    const dir = join(targetsDir, name)
    if (!statSync(dir).isDirectory() || name === KEEP_TARGET) continue
    actions.push({ desc: `remove ${rel(dir)}/ (registered target "${name}")`, run: () => rmSync(dir, { recursive: true }) })
  }
}

const configPath = join(targetsDir, 'config.json')
if (existsSync(configPath)) {
  let current = null
  try { current = JSON.parse(readFileSync(configPath, 'utf8')).default } catch { /* rewrite it */ }
  if (current !== KEEP_TARGET) {
    actions.push({
      desc: `reset ${rel(configPath)} default "${current}" -> "${KEEP_TARGET}"`,
      run: () => writeFileSync(configPath, JSON.stringify({
        _comment: 'Which target a run is about when TARGET is unset. Resolution lives in tests/lib/target.mjs.',
        default: KEEP_TARGET
      }, null, 2) + '\n')
    })
  }
}

function rel (p) {
  return p.startsWith(ROOT) ? p.slice(ROOT.length + 1).replace(/\\/g, '/') : p
}

if (!actions.length) {
  console.log('init-hub: nothing to do — this already looks like a blank hub.')
} else {
  for (const a of actions) {
    if (force) a.run()
    console.log(`  ${force ? 'done ' : 'would'}  ${a.desc}`)
  }
}

if (!force && actions.length) {
  console.log('\nDRY RUN — nothing was changed. Re-run with --force to apply.')
}

if (force || !actions.length) {
  console.log(`
Blank hub. Next steps:
  1. git config core.hooksPath .githooks        enable the disclosure guard
  2. node bin/board.mjs register --lane <name>  from each lane session
  3. Register your first target:
       mkdir targets/<name>
       write targets/<name>/target.json (schema: the design contract entry;
       fields are optional except name — omit rather than invent)
       set it as default in targets/config.json
  4. npm install && npm run test:board          prove the plumbing is green
`)
}
