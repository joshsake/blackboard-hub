// Target registry resolver (contract_d350537b). The ONE place that decides
// which target a run is about and where its base URL comes from; playwright,
// jest and the k6 preflight all resolve through here so the answer cannot
// drift between runners.
//
// Plain node ESM, zero dependencies, no build step — importable unchanged
// from playwright.config.ts (TS), jest.config.mjs, and node scripts. Import
// it WITH the extension: `import { resolveTarget } from './tests/lib/target.mjs'`.
//
// The exported API is published on the board as a contract entry; the ui and
// load lanes build against that entry without reading this file. Changing an
// export's shape means superseding the contract entry first.
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The invoking checkout's root: targets/ is tracked content, so each worktree
// resolves its OWN copy — a lane editing a target.json tests its edit.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// appDir is defined as "relative to the hub checkout" (the MAIN one), so that
// every worktree agrees on where a local app checkout lives — the same
// anchoring trick bin/board.mjs uses for the shared board.
function mainCheckout () {
  try {
    const common = execSync('git rev-parse --path-format=absolute --git-common-dir', {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
    return common ? dirname(common) : ROOT
  } catch { return ROOT }
}

/** Resolution failed for a stated reason. Never guessed around — fix the input. */
export class TargetError extends Error {
  constructor (message) {
    super(message)
    this.name = 'TargetError'
  }
}

const die = (msg) => { throw new TargetError(msg) }

function readJson (path, what) {
  if (!existsSync(path)) die(`${what} not found: ${path}`)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    die(`${what} is not valid JSON (${path}): ${e.message}`)
  }
}

/**
 * Resolve the target for this run. Uniform order (contract_d350537b):
 *
 *   1. env.TARGET names the target; absent, targets/config.json "default".
 *   2. env.BASE_URL: any explicit URL wins as-is; the literal sentinel
 *      "deployed" resolves to the target's deployedUrl.
 *   3. No BASE_URL: a target with start+appDir runs local-build mode
 *      (webServer non-null); without start it falls back to deployedUrl and
 *      SAYS SO via `note`; neither is a TargetError, not a guess.
 *   4. env.APP_DIR overrides the descriptor's appDir.
 *
 * Returns:
 *   name       target name
 *   dir        absolute path to targets/<name> in this checkout
 *   config     parsed target.json, exactly as committed
 *   baseURL    always set on success
 *   mode       'explicit-url' | 'deployed' | 'local-build'
 *   webServer  null, or { command, cwd, url, timeoutMs } when local-build
 *   note       null, or one line the caller should PRINT (a fallback happened)
 *
 * Throws TargetError with a one-line reason on anything unresolvable.
 */
export function resolveTarget (env = process.env) {
  const targetsDir = join(ROOT, 'targets')

  let name = env.TARGET
  if (!name) {
    const cfg = readJson(join(targetsDir, 'config.json'),
      'targets/config.json (needed because TARGET is unset)')
    name = cfg.default
    if (!name) die('targets/config.json has no "default" and TARGET is unset')
  }

  const dir = join(targetsDir, name)
  const config = readJson(join(dir, 'target.json'), `target "${name}"`)
  if (config.name !== name) {
    die(`target.json name "${config.name}" does not match its directory "${name}"`)
  }

  // APP_DIR wins over the descriptor; both anchor on the MAIN checkout so all
  // worktrees point at the same sibling app checkout.
  const declaredApp = env.APP_DIR || config.appDir
  const appDir = declaredApp
    ? (isAbsolute(declaredApp) ? declaredApp : resolve(join(mainCheckout(), declaredApp)))
    : null

  const done = (baseURL, mode, webServer = null, note = null) =>
    ({ name, dir, config, baseURL, mode, webServer, note })

  if (env.BASE_URL === 'deployed') {
    if (!config.deployedUrl) {
      die(`BASE_URL=deployed but target "${name}" declares no deployedUrl`)
    }
    return done(config.deployedUrl, 'deployed')
  }
  if (env.BASE_URL) return done(env.BASE_URL, 'explicit-url')

  if (config.start && appDir) {
    if (!config.localUrl) {
      die(`target "${name}" has a start command but no localUrl to wait on`)
    }
    return done(config.localUrl, 'local-build', {
      command: config.start.command,
      cwd: appDir,
      url: config.localUrl,
      timeoutMs: config.start.timeoutMs ?? 180_000
    })
  }

  if (config.deployedUrl) {
    return done(config.deployedUrl, 'deployed', null,
      `target "${name}" has no ${config.start ? 'appDir' : 'start command'}; ` +
      `falling back to deployedUrl ${config.deployedUrl}`)
  }

  die(`target "${name}" has neither a runnable start (start+appDir) nor a ` +
      'deployedUrl. Set BASE_URL explicitly, or complete its target.json.')
}

/**
 * Playwright testMatch patterns for one lane under one target, relative to a
 * repo-root testDir ('.'): the target's own suite plus the lane's
 * target-agnostic starter specs.
 */
export function specPatterns (lane, name) {
  return [
    `targets/${name}/${lane}/**/*.spec.ts`,
    `tests/${lane}/starter/**/*.spec.ts`
  ]
}
