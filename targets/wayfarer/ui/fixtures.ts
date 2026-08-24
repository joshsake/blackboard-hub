import { test as core, expect, skipUnlessTargetHealthy, type TargetHealth } from '../../../tests/ui/fixtures'
import { PlanPage } from './pages/plan-page'
import { ResultsPage } from './pages/results-page'

// Wayfarer-specific fixture layer: page objects for the /plan wizard and the
// /results page, on top of the shared ui core (tests/ui/fixtures.ts), which
// owns the target-generic health gate. Specs in this directory import
// { test, expect } from here.

interface WayfarerFixtures {
  planPage: PlanPage
  resultsPage: ResultsPage
}

export const test = core.extend<WayfarerFixtures>({
  planPage: async ({ page }, use) => {
    await use(new PlanPage(page))
  },

  resultsPage: async ({ page }, use) => {
    await use(new ResultsPage(page))
  }
})

export { expect, skipUnlessTargetHealthy }
export type { TargetHealth }
