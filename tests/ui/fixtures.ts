import { test as base, expect, request as apiRequest } from '@playwright/test'
import { resolveTarget } from '../lib/target.mjs'

// SHARED ui-lane core — target-generic by definition. Nothing in this file
// may know an app: which routes prove health, which blocker explains an
// outage, all of that lives in the target registry (targets/<name>/target.json,
// schema in contract_d350537b, resolution in contract_8f9d0915). Per-target
// suites layer their own page-object fixtures on top of this test object
// (see targets/wayfarer/ui/fixtures.ts).

const target = resolveTarget()
const healthRoute = (target.config.healthRoute as string | undefined) ?? '/'

/** Outcome of the one-per-worker probe of the target's healthRoute.
 *  status is null when the request itself failed (network error). */
export interface TargetHealth {
  ok: boolean
  status: number | null
}

interface UiWorkerFixtures {
  targetHealth: TargetHealth
}

/** Shared test object for the ui lane. Specs import { test, expect } from
 *  here (directly, or via their target's fixtures file), never from
 *  @playwright/test, so the health gate stays consistent across targets. */
export const test = base.extend<{}, UiWorkerFixtures>({
  // Probed once per worker, not per test: the target's health does not
  // change mid-run. The route comes from target.json's healthRoute — "one
  // route that proves the full stack is up" (contract_d350537b) — so a
  // healthy target answers 200 by its own declaration and anything else
  // means the environment, not the contract, is broken.
  targetHealth: [async ({}, use, workerInfo) => {
    const baseURL = (workerInfo.project.use.baseURL as string | undefined) ?? target.baseURL

    let status: number | null = null
    try {
      const ctx = await apiRequest.newContext({ baseURL })
      const res = await ctx.get(healthRoute, { timeout: 15_000 })
      status = res.status()
      await ctx.dispose()
    } catch {
      status = null // the request never completed — treat like a down backend
    }

    await use({ ok: status === 200, status })
  }, { scope: 'worker' }]
})

/** Health gate for specs that need the target's full stack rendering.
 *
 *  Call it first thing in any spec that a dead backend would otherwise turn
 *  red: a dead environment must read as BLOCKED, not as a contract
 *  regression. The skip reason quotes the target's target.json notes line,
 *  which is where operational truth lives — wayfarer's names
 *  blocker_a3ba1690 — so skips keep pointing at the right blocker with zero
 *  code coupling (pattern shared with tests/api/health.ts).
 *
 *  Starter specs stay ungated on purpose: they must pass during an outage,
 *  so a real transport-level regression stays visible behind one. */
export function skipUnlessTargetHealthy (health: TargetHealth): void {
  test.skip(
    !health.ok,
    `health probe ${healthRoute} got ${health.status ?? 'no response'} — ` +
    `target "${target.name}" environment is down, not a contract regression` +
    (target.config.notes ? ` [target notes: ${target.config.notes}]` : '')
  )
}

export { expect }
