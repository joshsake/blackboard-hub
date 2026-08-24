import { test, expect, skipUnlessResultsRenders } from './fixtures'

// ui lane — conformance of the WIZARD'S EMITTED URL to contract_1f5a871e.
//
// api owns /results as an HTTP surface and has locked it with 15 specs. What
// api cannot reach is the other half of that guarantee: that the wizard
// actually emits a URL of the shape the contract promises. Only a browser can
// drive the wizard, so this half is ours.
//
// Per contract_1f5a871e and finding_26d5ef1f, two traps let a naive assertion
// go green against the wrong page:
//   1. a repeated param silently reverts to its default
//   2. splurges is ONE comma-joined value; the repeated form parses as no
//      selection at all
// Neither errors — they just change the ranking. So every assertion here is
// per-param, and never on whole-query-string equality: /results is
// order-independent, so pinning the whole string would be brittle for nothing.
//
// Driving the wizard lives in PlanPage.complete (tests/ui/pages/plan-page.ts)
// — line-for-line the completeWizard helper these specs were mutation-verified
// through (finding_e24f4931). Every spec is health-gated: completion ends in a
// client-side navigation to /results, and when the data backend is down that
// navigation never commits — the URL stays on /plan — so even the URL-only
// specs cannot observe their subject (verified on the deployed target,
// 2026-08-24). A dead environment reads as blocked, not red.

const ALL_PARAMS = ['party', 'vibe', 'splurges', 'transit', 'detail'] as const

test.describe('wizard conforms to the /results contract', () => {
  test('a completed wizard emits all five params, including an empty splurges', async ({ planPage, resultsHealth }) => {
    skipUnlessResultsRenders(resultsHealth)

    const url = await planPage.complete({
      party: 'couple',
      vibe: 'local',
      splurges: [],
      transit: 'clean-transit',
      detail: 'essentials'
    })

    // Presence is asserted separately from value because that is the part a
    // regex cannot carry: to /splurges=/ an omitted param and an empty one
    // look the same, and the contract says nothing is omitted.
    for (const param of ALL_PARAMS) {
      expect(url.searchParams.has(param), `${param} must be emitted`).toBe(true)
    }

    expect(url.searchParams.get('party')).toBe('couple')
    expect(url.searchParams.get('vibe')).toBe('local')
    expect(url.searchParams.get('transit')).toBe('clean-transit')
    expect(url.searchParams.get('detail')).toBe('essentials')

    // The clause worth having a test for: picking nothing still emits the key.
    expect(url.searchParams.get('splurges')).toBe('')
  })

  test('multi-select emits one comma-joined splurges, never the repeated form', async ({ planPage, resultsHealth }) => {
    skipUnlessResultsRenders(resultsHealth)

    const url = await planPage.complete({
      party: 'family',
      vibe: 'classic',
      splurges: ['hotel', 'food'],
      transit: 'rideshare',
      detail: 'essentials'
    })

    // Cardinality, not just value. The repeated form parses as NO selection,
    // so a wrong emission still renders a perfectly good page — with a
    // different ranking and no error anywhere to notice.
    expect(url.searchParams.getAll('splurges')).toEqual(['hotel,food'])

    // And on the wire it is the percent-encoded comma the contract names.
    expect(url.search).toContain('splurges=hotel%2Cfood')
    expect(url.search).not.toContain('splurges=hotel&')

    // The other four must survive the multi-select step unchanged.
    expect(url.searchParams.get('party')).toBe('family')
    expect(url.searchParams.get('vibe')).toBe('classic')
    expect(url.searchParams.get('transit')).toBe('rideshare')
    expect(url.searchParams.get('detail')).toBe('essentials')
  })

  test('no param is ever emitted twice', async ({ planPage, resultsHealth }) => {
    skipUnlessResultsRenders(resultsHealth)

    const url = await planPage.complete({
      party: 'couple',
      vibe: 'local',
      splurges: ['hotel', 'experiences'],
      transit: 'car',
      detail: 'everything'
    })

    // Trap 1 generalised. A duplicate reverts that param to its default
    // silently, so the guard belongs on every param, not just the one we
    // happen to have caught it on.
    //
    // Two splurges deliberately: with only one, a wizard emitting the repeated
    // form has nothing to repeat, and this test passes while blind. Confirmed
    // by mutating finish() to append rather than set.
    for (const param of ALL_PARAMS) {
      expect(url.searchParams.getAll(param), `${param} must appear exactly once`).toHaveLength(1)
    }
  })

  test('detail=everything expands every card in the browser', async ({ planPage, resultsPage, resultsHealth }) => {
    skipUnlessResultsRenders(resultsHealth)

    await planPage.complete({
      party: 'solo',
      vibe: 'mix',
      splurges: ['experiences'],
      transit: 'car',
      detail: 'everything'
    })

    await expect(resultsPage.cards).toHaveCount(3)

    // "Expanded" has to mean the traveller can actually read the highlights.
    // The open property alone would still pass if the content were hidden
    // some other way, so assert both the state and the visible result.
    for (let i = 0; i < 3; i++) {
      const details = resultsPage.detailsOf(i)
      await expect(details).toHaveJSProperty('open', true)
      await expect(details.locator('li').first()).toBeVisible()
    }
  })

  test('detail=essentials leaves every card collapsed', async ({ planPage, resultsPage, resultsHealth }) => {
    skipUnlessResultsRenders(resultsHealth)

    await planPage.complete({
      party: 'solo',
      vibe: 'mix',
      splurges: ['experiences'],
      transit: 'car',
      detail: 'essentials'
    })

    await expect(resultsPage.cards).toHaveCount(3)

    // Without this the test above proves nothing: content that is always
    // visible would satisfy it just as well. This is what gives it teeth.
    for (let i = 0; i < 3; i++) {
      const details = resultsPage.detailsOf(i)
      await expect(details).toHaveJSProperty('open', false)
      await expect(details.locator('li').first()).not.toBeVisible()
    }
  })
})
