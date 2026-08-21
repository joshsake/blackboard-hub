import { defineConfig, devices } from '@playwright/test'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// One Playwright install serves both lanes. They are separate *projects*
// rather than separate configs so the api and ui lane sessions share fixtures
// and reporters instead of drifting apart.
//
// PER-LANE ISOLATION (finding_663e7231). Lanes run concurrently on one
// machine and mutate the app under test as a matter of routine, so sharing a
// port or a source tree corrupts evidence rather than merely slowing things
// down. Each lane therefore gets its own port AND its own checkout of the app,
// both declared in board/lanes.json:
//
//   api   3101   C:/automation/wayfarer-lanes/api
//   ui    3102   C:/automation/wayfarer-lanes/ui
//
// An `--project=api` run builds, serves and probes ONLY api's worktree on
// 3101. Nothing here ever touches C:/automation/wayfarer itself -- that
// checkout belongs to the user.

const HERE = dirname(fileURLToPath(import.meta.url))

// Lanes run from their own worktrees, so a path relative to this file would
// resolve differently in each one. Anchor on the main checkout instead --
// the same trick bin/board.mjs uses to keep one shared board.
function mainCheckout (): string {
  try {
    const common = execSync('git rev-parse --path-format=absolute --git-common-dir', {
      cwd: HERE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
    return common ? dirname(common) : HERE
  } catch { return HERE }
}

const MAIN = mainCheckout()

interface LaneApp { port: number, appWorktree: string }

/** Port and app checkout for each lane, from the same file the hub routes on. */
function laneApps (): Record<string, LaneApp> {
  const raw = JSON.parse(readFileSync(join(MAIN, 'board', 'lanes.json'), 'utf8'))
  const out: Record<string, LaneApp> = {}
  for (const [name, meta] of Object.entries<Record<string, unknown>>(raw.lanes ?? {})) {
    if (typeof meta.port === 'number' && typeof meta.appWorktree === 'string') {
      out[name] = { port: meta.port, appWorktree: meta.appWorktree }
    }
  }
  return out
}

const APPS = laneApps()
const PROJECTS = ['api', 'ui'] as const
type ProjectName = (typeof PROJECTS)[number]

/**
 * Which lanes this invocation is actually running.
 *
 * Playwright has no supported hook for "which --project did the caller pick"
 * at config-evaluation time, and we need it *before* the config object exists:
 * webServer is config-level, so without this a --project=api run would still
 * build and serve ui's tree on ui's port.
 *
 * Detection order matters, and argv is deliberately LAST. Playwright
 * re-evaluates this config inside worker processes, whose argv is Playwright's
 * own -- a worker reading argv finds no --project, concludes "all lanes", and
 * demands a checkout the run never needed. That is not hypothetical; it is how
 * the first cut of this file failed. The first two sources are environment, so
 * they survive into workers, and the argv result is stamped back into the
 * environment below so it survives too.
 */
function selectedProjects (): ProjectName[] {
  const fromEnv = (process.env.LANE ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (fromEnv.length) return PROJECTS.filter((p) => fromEnv.includes(p))

  // npm sets this to the name of the script it is running, e.g. "test:api".
  const script = process.env.npm_lifecycle_event ?? ''
  const fromScript = PROJECTS.filter((p) => script === 'test:' + p)
  if (fromScript.length) return fromScript

  const argv = process.argv.slice(2)
  const picked = new Set<string>()
  argv.forEach((arg, i) => {
    if (arg.startsWith('--project=')) picked.add(arg.slice('--project='.length))
    else if (arg === '--project' && argv[i + 1]) picked.add(argv[i + 1])
  })
  // No filter means every project runs, so every project needs its server.
  return picked.size ? PROJECTS.filter((p) => picked.has(p)) : [...PROJECTS]
}

const SELECTED = selectedProjects()

// Stamp the decision into the environment so Playwright workers inherit it
// rather than re-deriving it from an argv that no longer mentions --project.
process.env.LANE = SELECTED.join(",")

/** The app checkout a lane builds and serves. Refuses the shared one. */
function appDirFor (lane: ProjectName): string {
  const configured = APPS[lane]?.appWorktree
  if (!configured) {
    throw new Error(
      `lane "${lane}" has no appWorktree in board/lanes.json. Per finding_663e7231 ` +
      'every lane serves its own checkout; add port and appWorktree for it.'
    )
  }
  // APP_DIR still points the suite at some other checkout, but only when the
  // run is unambiguous. With two lanes selected there is no single app to
  // redirect, and silently applying it to both would put two servers on one
  // tree -- the collision this whole layout exists to remove.
  if (process.env.APP_DIR) {
    if (SELECTED.length !== 1) {
      throw new Error(
        `APP_DIR is set but this run selects ${SELECTED.length} projects (${SELECTED.join(', ')}). ` +
        'Pass --project=<lane> so the override has one unambiguous target.'
      )
    }
    return resolve(process.env.APP_DIR)
  }

  // lanes.json paths are relative to the hub root (see its _comment); resolving
  // against cwd only works by coincidence of this machine layout. resolve()
  // ignores MAIN when configured is absolute, so both forms stay valid.
  const dir = resolve(MAIN, configured)
  const shared = resolve(join(MAIN, '..', 'wayfarer'))
  if (dir === shared) {
    throw new Error(
      `lane "${lane}" resolves to the shared app checkout at ${shared}. No lane may build, ` +
      'serve or mutate it (finding_663e7231) -- it is the user\'s working tree.'
    )
  }
  if (!existsSync(dir)) {
    throw new Error(
      `lane "${lane}" has no app checkout at ${dir}. Create it once with:\n` +
      `  git -C ${shared} worktree add ${dir}\n` +
      `  cd ${dir} && npm ci`
    )
  }
  return dir
}

function portFor (lane: ProjectName): number {
  const port = APPS[lane]?.port
  if (!port) throw new Error(`lane "${lane}" has no port in board/lanes.json`)
  return port
}

function urlFor (lane: ProjectName): string {
  return process.env.BASE_URL || `http://localhost:${portFor(lane)}`
}

// Two modes, deliberately:
//   BASE_URL set   -> test a running/deployed environment, start nothing.
//   BASE_URL unset -> Playwright builds and serves the app itself, from this
//                     lane's own checkout on this lane's own port, so a run is
//                     self-contained and cannot collide with another lane.
const webServer = process.env.BASE_URL
  ? undefined
  : SELECTED.map((lane) => ({
      // The build matters in CI, where the container starts with no .next.
      command: `npm run build && npm run start -- --port ${portFor(lane)}`,
      cwd: appDirFor(lane),
      url: `http://localhost:${portFor(lane)}`,
      // Deliberately false. Reusing whatever happens to be listening is how a
      // mutation pass ends up measuring the PREVIOUS build -- silently, with a
      // plausible-looking failure (finding_d56fb593). With a port to itself a
      // lane should never meet an existing server, so meeting one means
      // something is wrong and the run must say so rather than absorb it.
      reuseExistingServer: false,
      timeout: 180_000
    }))

export default defineConfig({
  // Lane sessions run concurrently, so failures must be attributable.
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'artifacts/report' }]],
  outputDir: 'artifacts/results',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer,
  projects: [
    {
      // API lane: no browser. Playwright's request fixture only.
      name: 'api',
      testDir: './tests/api',
      use: { baseURL: urlFor('api') }
    },
    {
      name: 'ui',
      testDir: './tests/ui',
      use: { ...devices['Desktop Chrome'], baseURL: urlFor('ui') }
    }
  ]
})
