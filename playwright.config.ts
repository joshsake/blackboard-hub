import { defineConfig, devices } from '@playwright/test'
import { resolveTarget, specPatterns } from './tests/lib/target.mjs'

// One Playwright install serves both lanes. They are separate *projects*
// rather than separate configs so the api and ui lane sessions share fixtures
// and reporters instead of drifting apart.
//
// WHICH APP this run tests is no longer decided here: the target registry is
// (targets/, contract_d350537b), resolved through tests/lib/target.mjs so
// playwright, jest and the k6 preflight cannot disagree. In short:
//   TARGET=<name>       pick a registered target (default: targets/config.json)
//   BASE_URL=<url>      test that URL, start nothing
//   BASE_URL=deployed   sentinel: the target's own deployedUrl
//   (neither)           targets with start+appDir build and serve locally --
//                       unchanged wayfarer behavior; APP_DIR still overrides
const target = resolveTarget()

// Fallback notes print once from the main process, not from every worker.
if (target.note && process.env.TEST_WORKER_INDEX === undefined) {
  console.log(`[target] ${target.note}`)
}

const webServer = target.webServer
  ? {
      // The build matters in CI, where the container starts with no build
      // output. Locally reuseExistingServer skips this when a server is up.
      command: target.webServer.command,
      cwd: target.webServer.cwd,
      url: target.webServer.url,
      reuseExistingServer: true,
      timeout: target.webServer.timeoutMs
    }
  : undefined

export default defineConfig({
  // Lane sessions run concurrently, so failures must be attributable.
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'artifacts/report' }]],
  outputDir: 'artifacts/results',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: target.baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer,
  // One testDir cannot span the two trees (targets/<name>/<lane> plus the
  // lane's starter specs under tests/), so testDir is the repo root and each
  // project selects by pattern. *.spec.ts ONLY, everywhere: the api lane also
  // runs a Jest layer whose *.test.ts files live in the same directories, and
  // Playwright's default testMatch would load those and fail on the
  // @jest/globals imports.
  projects: [
    {
      // API lane: no browser. Playwright's request fixture only.
      name: 'api',
      testDir: '.',
      testMatch: specPatterns('api', target.name),
      use: {}
    },
    {
      name: 'ui',
      testDir: '.',
      testMatch: [
        ...specPatterns('ui', target.name),
        // WAVE-1 TRANSITION ONLY: the ui suite still lives in tests/ui until
        // the ui lane moves it to targets/<name>/ui in wave 2. Both locations
        // match this wave so nothing breaks between waves; the ui lane drops
        // this pattern when it moves.
        'tests/ui/**/*.spec.ts'
      ],
      use: { ...devices['Desktop Chrome'] }
    }
  ]
})
