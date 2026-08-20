import { defineConfig, devices } from '@playwright/test'
import { execSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// One Playwright install serves both lanes. They are separate *projects*
// rather than separate configs so the api and ui lane sessions share fixtures
// and reporters instead of drifting apart.

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

// The system under test. Override APP_DIR to point the same suite at a
// different checkout; override BASE_URL to test a deployed environment and
// skip starting anything locally.
const APP_DIR = process.env.APP_DIR || resolve(join(mainCheckout(), '..', 'wayfarer'))
const LOCAL_URL = 'http://localhost:3000'
const baseURL = process.env.BASE_URL || LOCAL_URL

// Two modes, deliberately:
//   BASE_URL set  -> test a running/deployed environment, start nothing.
//   BASE_URL unset -> Playwright builds and serves the app itself, so a run is
//                     self-contained and needs no "start the app first" step.
const webServer = process.env.BASE_URL
  ? undefined
  : {
      // The build matters in CI, where the container starts with no .next.
      // Locally reuseExistingServer skips this entirely when a server is up.
      command: 'npm run build && npm run start',
      cwd: APP_DIR,
      url: LOCAL_URL,
      reuseExistingServer: true,
      timeout: 180_000
    }

export default defineConfig({
  // Lane sessions run concurrently, so failures must be attributable.
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'artifacts/report' }]],
  outputDir: 'artifacts/results',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer,
  projects: [
    {
      // API lane: no browser. Playwright's request fixture only.
      name: 'api',
      testDir: './tests/api',
      use: {}
    },
    {
      name: 'ui',
      testDir: './tests/ui',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
})
