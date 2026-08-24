import { request, test } from '@playwright/test'
import { resolveTarget } from '../lib/target.mjs'

// Target-generic health gate (pattern set by finding_98889256): a target can
// violate its own contract for INFRASTRUCTURE reasons — wayfarer's /results
// returns 500 for every shape while its data backend is paused — and that
// must never be confusable with a contract regression in a test report. A
// dead environment reads as SKIPPED with the cause named, never as red.
//
// The probe route comes from the target registry: target.json's healthRoute
// is "one route that proves the full stack is up" (contract_d350537b), and
// the skip reason carries the target's notes line, which is where operational
// truth like a blocker id lives (wayfarer's names blocker_a3ba1690).
//
// Specs that assert a live contract call gateOnTargetHealth() inside their
// describe. One probe per worker, memoised; anything but 200 skips the block.
// Starter specs and static-surface specs stay ungated on purpose — they pass
// during an outage, and gating them would hide real regressions behind it.

const target = resolveTarget()
const route = target.config.healthRoute ?? '/'

let probe: Promise<number | null> | undefined

function healthStatus (baseURL: string): Promise<number | null> {
  probe ??= (async () => {
    const ctx = await request.newContext({ baseURL })
    try {
      return (await ctx.get(route, { timeout: 15_000 })).status()
    } catch {
      return null // unreachable: DNS, refused, timeout
    } finally {
      await ctx.dispose()
    }
  })()
  return probe
}

/**
 * Call once inside a describe block: health-probes the target's healthRoute
 * before the first test and skips every test in the block while it is down.
 */
export function gateOnTargetHealth (): void {
  test.beforeEach(async ({ baseURL }) => {
    const status = await healthStatus(baseURL ?? target.baseURL)
    test.skip(
      status !== 200,
      `health probe ${route} got ${status ?? 'no response'} — target "${target.name}" ` +
      `environment is down, not a contract regression` +
      (target.config.notes ? ` [target notes: ${target.config.notes}]` : '')
    )
  })
}
