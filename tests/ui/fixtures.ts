import { test as base, expect, request as apiRequest } from '@playwright/test'
import { PlanPage } from './pages/plan-page'
import { ResultsPage } from './pages/results-page'

/** Outcome of the one-per-worker probe of GET /results.
 *  status is null when the request itself failed (network error). */
export interface ResultsHealth {
  ok: boolean
  status: number | null
}

interface UiFixtures {
  planPage: PlanPage
  resultsPage: ResultsPage
}

interface UiWorkerFixtures {
  resultsHealth: ResultsHealth
}

/** Shared test object for the ui lane. Specs import { test, expect } from
 *  here, never from @playwright/test directly, so page objects and the
 *  health gate stay consistent across the lane. */
export const test = base.extend<UiFixtures, UiWorkerFixtures>({
  planPage: async ({ page }, use) => {
    await use(new PlanPage(page))
  },

  resultsPage: async ({ page }, use) => {
    await use(new ResultsPage(page))
  },

  // Probed once per worker, not per test: the target's health does not change
  // mid-run, and 6 of 9 specs consult it. Bare GET /results is the right
  // probe because contract_1f5a871e guarantees it is 200 (all params optional,
  // defaults applied, no validation layer) — so anything but 200 means the
  // backend cannot serve the catalog, not that the probe URL was wrong.
  resultsHealth: [async ({}, use, workerInfo) => {
    const baseURL = (workerInfo.project.use.baseURL as string | undefined) ||
      process.env.BASE_URL || 'http://localhost:3000'

    let status: number | null = null
    try {
      const ctx = await apiRequest.newContext({ baseURL })
      const res = await ctx.get('/results', { timeout: 15_000 })
      status = res.status()
      await ctx.dispose()
    } catch {
      status = null // the request never completed — treat like a down backend
    }

    await use({ ok: status === 200, status })
  }, { scope: 'worker' }]
})

/** Health gate for specs that need /results to render real HTML.
 *
 *  Call it first thing in any spec that (a) reads the recommendation cards,
 *  or (b) completes the wizard — completion client-side-navigates to
 *  /results, and when the data backend is down that navigation never commits:
 *  the URL stays on /plan and even URL-only assertions time out (verified
 *  against the deployed target, 2026-08-24, finding_e732d2db).
 *
 *  A dead environment must read as BLOCKED, not red: skip carries the blocker
 *  id so the report says who clears it, while a healthy target runs every
 *  spec with nothing weakened. */
export function skipUnlessResultsRenders (health: ResultsHealth): void {
  test.skip(
    !health.ok,
    `needs /results HTML, but GET /results returned ${health.status ?? 'no response (network error)'} — ` +
    'data backend down, blocked by blocker_a3ba1690'
  )
}

export { expect }
