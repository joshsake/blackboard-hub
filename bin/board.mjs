#!/usr/bin/env node
// Blackboard CLI. Zero dependencies, no build step -- layer sessions invoke
// this directly from bash, so it must never require an install or compile.
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BOARD = process.env.BLACKBOARD_DIR || join(ROOT, 'board')
const ENTRIES = join(BOARD, 'entries')
const REGISTRY = join(BOARD, 'layers.json')

const TYPES = ['contract', 'task', 'finding', 'question']
const STATUSES = ['open', 'answered', 'blocked', 'done', 'superseded']

const die = (msg) => { console.error(`board: ${msg}`); process.exit(1) }

function layers () {
  if (!existsSync(REGISTRY)) die(`no registry at ${REGISTRY}`)
  return JSON.parse(readFileSync(REGISTRY, 'utf8')).layers
}

// Fold the per-layer append-only logs into current state.
// Each layer writes only its own file, so appends never conflict. Ordering is
// by `seq` across all logs; the last record for an id wins.
function fold () {
  if (!existsSync(ENTRIES)) return []
  const records = []
  for (const file of readdirSync(ENTRIES).filter(f => f.endsWith('.jsonl'))) {
    const raw = readFileSync(join(ENTRIES, file), 'utf8')
    raw.split('\n').filter(Boolean).forEach((line, i) => {
      try { records.push(JSON.parse(line)) } catch { die(`corrupt line ${i + 1} in ${file}`) }
    })
  }
  records.sort((a, b) => (a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0))
  const state = new Map()
  for (const r of records) state.set(r.id, r)
  return [...state.values()]
}

function history (id) {
  const out = []
  for (const file of readdirSync(ENTRIES).filter(f => f.endsWith('.jsonl'))) {
    readFileSync(join(ENTRIES, file), 'utf8').split('\n').filter(Boolean)
      .forEach(l => { const r = JSON.parse(l); if (r.id === id) out.push(r) })
  }
  return out.sort((a, b) => (a.seq < b.seq ? -1 : 1))
}

function args (argv) {
  const flags = {}, positional = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) flags[key] = true
      else { flags[key] = next; i++ }
    } else positional.push(argv[i])
  }
  return { flags, positional }
}

function cmdAppend (flags) {
  const registry = layers()
  const layer = flags.layer
  if (!layer) die('--layer is required')
  if (!registry[layer]) die(`unknown layer "${layer}". known: ${Object.keys(registry).join(', ')}`)
  if (!flags.type) die('--type is required')
  if (!TYPES.includes(flags.type)) die(`unknown type "${flags.type}". known: ${TYPES.join(', ')}`)
  if (!flags.title && !flags.id) die('--title is required (or --id, to supersede an existing entry)')
  if (flags.status && !STATUSES.includes(flags.status)) die(`unknown status "${flags.status}". known: ${STATUSES.join(', ')}`)

  // Single-owner rule: only the owning layer may supersede an entry.
  const id = flags.id || `${flags.type}_${randomUUID().slice(0, 8)}`
  let prior = null
  if (flags.id) {
    prior = fold().find(e => e.id === flags.id) || null
    if (prior && prior.owner !== layer) {
      die(`entry ${flags.id} is owned by "${prior.owner}"; "${layer}" cannot supersede it.\n` +
          `       raise a question entry addressed to the hub instead.`)
    }
  }

  // Superseding is a PARTIAL update: fields not passed inherit from the prior
  // revision. Replacing wholesale would silently drop `to`, `body` and `refs`
  // every time a layer merely changed a status.
  const opt = (name, fallback) =>
    flags[name] !== undefined && flags[name] !== true ? flags[name] : fallback
  const record = {
    id,
    type: flags.type,
    owner: layer,
    status: opt('status', prior ? prior.status : 'open'),
    title: opt('title', prior ? prior.title : ''),
    body: opt('body', prior ? prior.body : ''),
    refs: flags.refs && flags.refs !== true
      ? String(flags.refs).split(',').map(s => s.trim())
      : (prior ? prior.refs : []),
    to: opt('to', prior ? prior.to : null),
    seq: new Date().toISOString()
  }
  mkdirSync(ENTRIES, { recursive: true })
  appendFileSync(join(ENTRIES, `${layer}.jsonl`), JSON.stringify(record) + '\n')
  console.log(id)
}

function cmdRead (flags) {
  let entries = fold()
  if (flags.type) entries = entries.filter(e => e.type === flags.type)
  if (flags.owner) entries = entries.filter(e => e.owner === flags.owner)
  if (flags.status) entries = entries.filter(e => e.status === flags.status)
  if (flags.to) entries = entries.filter(e => e.to === flags.to)
  if (flags.id) entries = entries.filter(e => e.id === flags.id)
  entries.sort((a, b) => (a.seq < b.seq ? 1 : -1))

  if (flags.json) return console.log(JSON.stringify(entries, null, 2))
  if (!entries.length) return console.log('(board empty -- no entries match)')
  for (const e of entries) {
    const to = e.to ? ` -> ${e.to}` : ''
    console.log(`${e.id}  [${e.type}/${e.status}]  ${e.owner}${to}`)
    console.log(`  ${e.title}`)
    if (e.body) console.log(`  ${e.body.replace(/\n/g, '\n  ')}`)
    if (e.refs.length) console.log(`  refs: ${e.refs.join(', ')}`)
    console.log()
  }
}

function cmdShow (positional, flags) {
  const id = positional[0]
  if (!id) die('usage: board show <id>')
  const h = history(id)
  if (!h.length) die(`no entry with id "${id}"`)
  if (flags.json) return console.log(JSON.stringify(h, null, 2))
  console.log(`${id} -- ${h.length} revision(s), oldest first\n`)
  h.forEach((r, i) => {
    console.log(`  [${i + 1}] ${r.seq}  ${r.owner}  status=${r.status}`)
    console.log(`      ${r.title}`)
    if (r.body) console.log(`      ${r.body.replace(/\n/g, '\n      ')}`)
  })
}

function cmdLayers (flags) {
  const registry = layers()
  if (flags.json) return console.log(JSON.stringify(registry, null, 2))
  for (const [name, meta] of Object.entries(registry)) {
    console.log(`${name.padEnd(8)} ${meta.role}`)
    console.log(`         dir: ${meta.dir}   session title: "${meta.sessionTitle}"`)
  }
}

const { flags, positional } = args(process.argv.slice(3))
switch (process.argv[2]) {
  case 'append': cmdAppend(flags); break
  case 'read': cmdRead(flags); break
  case 'show': cmdShow(positional, flags); break
  case 'layers': cmdLayers(flags); break
  default:
    console.log(`blackboard

  board append --layer <l> --type <t> --title <s> [--body <s>] [--id <id>]
               [--status <s>] [--refs a,b] [--to <layer>]
  board read   [--type t] [--owner l] [--status s] [--to l] [--id x] [--json]
  board show   <id> [--json]
  board layers [--json]

types:    ${TYPES.join(', ')}
statuses: ${STATUSES.join(', ')}`)
}
