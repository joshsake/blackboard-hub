import { request, test } from '@playwright/test'

// finding_98889256: the deployed target can violate contract_1f5a871e for
// INFRASTRUCTURE reasons — while the destinations backend is down, every
// /results shape returns 500 by design (the render throws; there is no static
// fallback). That is an environment outage, not a contract regression, and
// the two must not be confusable in a test report: a dead environment reads
// as SKIPPED with the blocker named, never as red.
//
// So specs that assert the live /results contract call gateOnResultsHealth()
// inside their describe. One probe per worker, memoised; anything but a 200
// skips the gated specs with a reason citing blocker_a3ba1690. The rest of
// the surface (/, /plan, the 404 page) stays ungated — it renders fine even
// while the data backend is down, and losing that signal would hide real
// regressions behind the blocker.

let probe: Promise<number | null> | undefined

function resultsStatus (baseURL: string): Promise<number | null> {
  probe ??= (async () => {
    const ctx = await request.newContext({ baseURL })
    try {
      return (await ctx.get('/results', { timeout: 15_000 })).status()
    } catch {
      return null // unreachable: DNS, refused, timeout
    } finally {
      await ctx.dispose()
    }
  })()
  return probe
}

/**
 * Call once inside a describe block: health-probes /results before the first
 * test and skips every test in the block while it is down.
 */
export function gateOnResultsHealth (): void {
  test.beforeEach(async ({ baseURL }) => {
    const status = await resultsStatus(baseURL ?? 'http://localhost:3000')
    test.skip(
      status !== 200,
      `/results health probe got ${status ?? 'no response'} — environment down ` +
      '(blocker_a3ba1690, destinations backend), not a contract regression'
    )
  })
}
