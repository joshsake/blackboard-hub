import { defineConfig, devices } from '@playwright/test'

// One Playwright install serves both layers. They are separate *projects*
// rather than separate configs so the api and ui layer sessions share
// fixtures and reporters instead of drifting apart.
//
// BASE_URL is deliberately unset by default -- there is no system under test
// wired up yet, and a hardcoded guess would fail confusingly.
const baseURL = process.env.BASE_URL

export default defineConfig({
  // Layer sessions run concurrently, so failures must be attributable.
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'artifacts/report' }]],
  outputDir: 'artifacts/results',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      // API layer: no browser. Playwright's request fixture only.
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
