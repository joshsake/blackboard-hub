#!/usr/bin/env node
// Blackboard CLI. Zero dependencies, no build step -- lane sessions invoke
// this directly from bash, so it must never require an install or compile.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// The board must be ONE surface shared by every lane. Because it lives inside
// the repo, `git worktree` hands each lane its own copy -- so resolving the
// board relative to ROOT would give five private boards that never see each
// other, which is the exact failure this project exists to prevent.
//
// `git rev-parse --git-common-dir` returns the MAIN checkout's .git from
// inside any linked worktree, so its parent is the one canonical board.
function mainCheckout () {
  try {
    const common = execSync('git rev-parse --path-format=absolute --git-common-dir', {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
    return common ? dirname(common) : ROOT
  } catch { return ROOT }
}

// Every repo-relative path anchors here, not just the board. Resolved once:
// status derives git state per lane, and this shells out to git.
const MAIN = mainCheckout()

const BOARD = process.env.BLACKBOARD_DIR || join(MAIN, 'board')
const ENTRIES = join(BOARD, 'entries')
const REGISTRY = join(BOARD, 'lanes.json')

// Where each lane actually lives, as declared by the lane itself rather than
// guessed by the hub. One file per lane, so registrations never conflict for
// the same reason the entry logs never do.
const REGISTRATIONS = join(BOARD, 'registrations')

const TYPES = ['contract', 'task', 'finding', 'question', 'blocker']
const STATUSES = ['open', 'answered', 'blocked', 'done', 'superseded']

const die = (msg) => { console.error(`board: ${msg}`); process.exit(1) }

function lanes () {
  if (!existsSync(REGISTRY)) die(`no registry at ${REGISTRY}`)
  return JSON.parse(readFileSync(REGISTRY, 'utf8')).lanes
}

function logFiles () {
  if (!existsSync(ENTRIES)) return []
  return readdirSync(ENTRIES).filter(f => f.endsWith('.jsonl'))
}

// Fold the per-lane append-only logs into current state.
// Each lane writes only its own file, so appends never conflict. Ordering is
// by `seq` across all logs; the last record for an id wins.
function fold () {
  const records = []
  for (const file of logFiles()) {
    readFileSync(join(ENTRIES, file), 'utf8').split('\n').filter(Boolean)
      .forEach((line, i) => {
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
  for (const file of logFiles()) {
    readFileSync(join(ENTRIES, file), 'utf8').split('\n').filter(Boolean)
      .forEach(l => { const r = JSON.parse(l); if (r.id === id) out.push(r) })
  }
  return out.sort((a, b) => (a.seq < b.seq ? -1 : 1))
}

// ---------------------------------------------------------------------------
// Derived state. Anything git already knows is scraped, never hand-maintained:
// declared facts rot silently, `git status` does not.
// ---------------------------------------------------------------------------

function git (dir, cmd) {
  try {
    return execSync(`git ${cmd}`, {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
  } catch { return null }
}

function deriveGit (dir, { hubTop } = {}) {
  // Relative to the MAIN checkout, never to ROOT. lanes.json stores worktree
  // paths relative (".", "../hub-lanes/api"), and ROOT is whichever checkout
  // invoked the CLI -- so ROOT-relative resolution gives each lane a private,
  // wrong view of every other lane. Same reason BOARD anchors on MAIN.
  const path = isAbsolute(dir) ? dir : join(MAIN, dir)
  if (!existsSync(path)) return { state: 'missing' }
  if (!git(path, 'rev-parse --git-dir')) return { state: 'not-a-repo' }

  // A plain subfolder of the hub checkout has no branch state of its own -- it
  // just reports the hub's. Reporting that as this lane's state would render
  // one identical row per lane and quietly look like real information, so it
  // is flagged instead. Distinct per-lane state requires a separate worktree.
  const top = git(path, 'rev-parse --show-toplevel')
  const shared = hubTop !== undefined && top !== null && top === hubTop

  const branch = git(path, 'rev-parse --abbrev-ref HEAD')
  const dirty = (git(path, 'status --porcelain') || '').split('\n').filter(Boolean).length
  const counts = git(path, 'rev-list --left-right --count @{u}...HEAD')
  let ahead = null
  let behind = null
  if (counts) {
    const [b, a] = counts.split(/\s+/)
    behind = Number(b)
    ahead = Number(a)
  }
  return { state: shared ? 'shares-hub-checkout' : 'ok', branch, dirty, ahead, behind }
}

// Canonical form for comparing a registered cwd against a session's reported
// cwd. Windows paths arrive with either separator and arbitrary case.
function cwdKey (p) {
  return String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function readRegistration (lane) {
  const f = join(REGISTRATIONS, `${lane}.json`)
  if (!existsSync(f)) return null
  try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return null }
}

// A lane announces where it is; the hub does not predict it. Path conventions
// break the moment a session is opened somewhere unexpected, and they fail
// silently -- an unregistered lane is at least visibly unregistered.
function cmdRegister (flags) {
  const registry = lanes()
  const lane = flags.lane
  if (!lane) die('--lane is required')
  if (!registry[lane]) die(`unknown lane "${lane}". known: ${Object.keys(registry).join(', ')}`)

  const cwd = flags.cwd && flags.cwd !== true ? flags.cwd : process.cwd()
  if (!existsSync(cwd)) die(`cwd does not exist: ${cwd}`)

  const record = {
    lane,
    // The hub matches these against list_sessions to find the live session.
    cwd,
    // Match on this rather than on `cwd`. Registering from the session's own
    // directory usually yields the same separators list_sessions reports, but
    // a --cwd argument passed through Git Bash arrives with forward slashes,
    // and case can differ. Separators unified, case folded, trailing slash gone.
    cwdKey: cwdKey(cwd),
    branch: git(cwd, 'rev-parse --abbrev-ref HEAD'),
    toplevel: git(cwd, 'rev-parse --show-toplevel'),
    registeredAt: new Date().toISOString()
  }
  mkdirSync(REGISTRATIONS, { recursive: true })
  writeFileSync(join(REGISTRATIONS, `${lane}.json`), JSON.stringify(record, null, 2) + '\n')
  console.log(`registered ${lane}`)
  console.log(`  cwd:    ${record.cwd}`)
  console.log(`  branch: ${record.branch ?? '(not a git checkout)'}`)
}

function cmdRegistrations (flags) {
  const registry = lanes()
  const rows = Object.keys(registry).map(lane => ({ lane, ...(readRegistration(lane) || {}) }))
  if (flags.json) return console.log(JSON.stringify(rows, null, 2))
  for (const r of rows) {
    if (!r.registeredAt) { console.log(`${r.lane.padEnd(7)} UNREGISTERED`); continue }
    console.log(`${r.lane.padEnd(7)} ${r.branch ?? '(no branch)'}`)
    console.log(`        ${r.cwd}`)
    console.log(`        registered ${ago(r.registeredAt)} ago`)
  }
}

function lastActivity (lane) {
  const f = join(ENTRIES, `${lane}.jsonl`)
  if (!existsSync(f)) return null
  const lines = readFileSync(f, 'utf8').split('\n').filter(Boolean)
  if (!lines.length) return null
  return JSON.parse(lines[lines.length - 1]).seq
}

function ago (iso) {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function args (argv) {
  const flags = {}
  const positional = []
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
  const registry = lanes()
  const lane = flags.lane
  if (!lane) die('--lane is required')
  if (!registry[lane]) die(`unknown lane "${lane}". known: ${Object.keys(registry).join(', ')}`)
  if (!flags.type) die('--type is required')
  if (!TYPES.includes(flags.type)) die(`unknown type "${flags.type}". known: ${TYPES.join(', ')}`)
  if (!flags.title && !flags.id) die('--title is required (or --id, to supersede an existing entry)')
  if (flags.status && !STATUSES.includes(flags.status)) {
    die(`unknown status "${flags.status}". known: ${STATUSES.join(', ')}`)
  }
  const waitingOn = flags['waiting-on']
  if (waitingOn && waitingOn !== true && waitingOn !== 'human' && !registry[waitingOn]) {
    die(`--waiting-on must be "human" or a known lane. known: ${Object.keys(registry).join(', ')}`)
  }

  // Single-owner rule: only the owning lane may supersede an entry.
  const id = flags.id || `${flags.type}_${randomUUID().slice(0, 8)}`
  let prior = null
  if (flags.id) {
    prior = fold().find(e => e.id === flags.id) || null
    if (prior && prior.owner !== lane) {
      die(`entry ${flags.id} is owned by "${prior.owner}"; "${lane}" cannot supersede it.\n` +
          `       raise a question entry addressed to the hub instead.`)
    }
  }

  // Superseding is a PARTIAL update: fields not passed inherit from the prior
  // revision. Replacing wholesale would mean a lane that merely closed a
  // question silently destroyed its routing, body and refs.
  const opt = (name, fallback) =>
    flags[name] !== undefined && flags[name] !== true ? flags[name] : fallback
  const record = {
    id,
    type: flags.type,
    owner: lane,
    status: opt('status', prior ? prior.status : 'open'),
    title: opt('title', prior ? prior.title : ''),
    body: opt('body', prior ? prior.body : ''),
    refs: flags.refs && flags.refs !== true
      ? String(flags.refs).split(',').map(s => s.trim())
      : (prior ? prior.refs : []),
    to: opt('to', prior ? prior.to : null),
    waitingOn: opt('waiting-on', prior ? prior.waitingOn : null),
    seq: new Date().toISOString()
  }
  mkdirSync(ENTRIES, { recursive: true })
  appendFileSync(join(ENTRIES, `${lane}.jsonl`), JSON.stringify(record) + '\n')
  console.log(id)
}

function cmdRead (flags) {
  let entries = fold()
  const filters = [
    ['type', 'type'], ['owner', 'owner'], ['status', 'status'],
    ['to', 'to'], ['id', 'id'], ['waiting-on', 'waitingOn']
  ]
  for (const [flag, field] of filters) {
    if (flags[flag] && flags[flag] !== true) entries = entries.filter(e => e[field] === flags[flag])
  }
  entries.sort((a, b) => (a.seq < b.seq ? 1 : -1))

  if (flags.json) return console.log(JSON.stringify(entries, null, 2))
  if (!entries.length) return console.log('(no entries match)')
  for (const e of entries) {
    const to = e.to ? ` -> ${e.to}` : ''
    const wait = e.waitingOn ? `  waiting-on:${e.waitingOn}` : ''
    console.log(`${e.id}  [${e.type}/${e.status}]  ${e.owner}${to}${wait}`)
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

// The human is a resource with a queue, and one unblock can release several
// lanes at once -- so fan-out is shown, not just the blocker list.
function cmdQueue (flags) {
  const entries = fold()
  const blockers = entries.filter(e => e.type === 'blocker' && e.status !== 'done')
  const gates = (id) => entries.filter(e => e.refs.includes(id) && e.status !== 'done')

  const enriched = blockers.map(b => ({
    ...b,
    gating: [...new Set(gates(b.id).map(e => e.owner))].sort()
  })).sort((a, b) => b.gating.length - a.gating.length)

  if (flags.json) return console.log(JSON.stringify(enriched, null, 2))

  const render = (list) => list.forEach(b => {
    const fan = b.gating.length
    const tag = fan > 1
      ? `  [gates ${fan} lanes: ${b.gating.join(', ')}]`
      : fan === 1 ? `  [gates ${b.gating[0]}]` : '  [gates nothing yet]'
    const when = ago(b.seq)
    console.log(`  ${b.id}  ${b.title}${tag}`)
    console.log(`      raised by ${b.owner}, ${when === 'just now' ? 'just now' : `${when} ago`}`)
  })

  console.log('WAITING ON HUMAN')
  const forHuman = enriched.filter(b => b.waitingOn === 'human')
  forHuman.length ? render(forHuman) : console.log('  (nothing)')
  console.log('\nWAITING ON A LANE')
  const forLayers = enriched.filter(b => b.waitingOn !== 'human')
  forLayers.length ? render(forLayers) : console.log('  (nothing)')
}

function cmdStatus (flags) {
  const registry = lanes()
  const entries = fold()
  // The hub's checkout, not the caller's: from a lane worktree ROOT would
  // report that lane, and the shares-hub-checkout guard below would compare
  // every lane against the wrong baseline.
  const hubTop = git(MAIN, 'rev-parse --show-toplevel')
  const rows = Object.entries(registry).map(([name, meta]) => {
    const mine = entries.filter(e => e.owner === name)
    const last = lastActivity(name)
    const reg = readRegistration(name)
    return {
      lane: name,
      charter: meta.role,
      last,
      idle: ago(last),
      registered: reg ? { cwd: reg.cwd, branch: reg.branch, at: reg.registeredAt } : null,
      // Git state belongs to the lane's checkout, not to the folder its code
      // sits in -- a subfolder would only ever report the enclosing checkout.
      // A registration is where the lane says it actually is, so it wins over
      // the configured guess.
      git: deriveGit(reg?.cwd || meta.worktree || meta.dir, {
        hubTop: name === 'hub' ? undefined : hubTop
      }),
      open: mine.filter(e => e.status === 'open').length,
      inbox: entries.filter(e => e.to === name && e.status === 'open').length,
      blockers: mine.filter(e => e.type === 'blocker' && e.status !== 'done').length
    }
  })
  if (flags.json) return console.log(JSON.stringify(rows, null, 2))
  for (const r of rows) {
    const active = r.last
      ? (r.idle === 'just now' ? 'active just now' : `active ${r.idle} ago`)
      : 'no board activity'
    console.log(`${r.lane.padEnd(7)} ${active}`)
    console.log(`        ${r.charter}`)
    if (!r.registered) {
      console.log('        NOT REGISTERED — run: board register --lane ' + r.lane)
    }
    if (r.git.state === 'ok') {
      const parts = [r.git.branch]
      if (r.git.ahead !== null) parts.push(`+${r.git.ahead} ahead`, `-${r.git.behind} behind`)
      parts.push(`${r.git.dirty} dirty`)
      console.log(`        git: ${parts.join(' | ')}`)
    } else if (r.git.state === 'shares-hub-checkout') {
      console.log('        git: (shares hub checkout — no lane state; needs its own worktree)')
    } else {
      console.log(`        git: (${r.git.state})`)
    }
    console.log(`        open:${r.open}  inbox:${r.inbox}  blockers:${r.blockers}`)
    console.log()
  }
}

function cmdLanes (flags) {
  const registry = lanes()
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
  case 'queue': cmdQueue(flags); break
  case 'status': cmdStatus(flags); break
  case 'lanes': cmdLanes(flags); break
  case 'register': cmdRegister(flags); break
  case 'registrations': cmdRegistrations(flags); break
  // Every worktree must resolve to the same path here. If two lanes disagree,
  // they are writing to private boards and cannot see each other.
  case 'where': console.log(BOARD); break
  default:
    console.log(`blackboard

  board append --lane <l> --type <t> [--title <s>] [--body <s>] [--id <id>]
               [--status <s>] [--refs a,b] [--to <lane>] [--waiting-on human|<lane>]
  board read   [--type t] [--owner l] [--status s] [--to l] [--waiting-on x] [--id x] [--json]
  board show   <id> [--json]
  board queue  [--json]     what is blocked, and how many lanes each blocker gates
  board status [--json]     per-lane liveness + derived git state
  board lanes [--json]
  board register --lane <l> [--cwd <path>]   declare where this lane is running
  board registrations [--json]              where each lane says it lives
  board where               resolved board path (identical from every worktree)

types:    ${TYPES.join(', ')}
statuses: ${STATUSES.join(', ')}`)
}
