import { test, expect } from '@playwright/test'

// api lane — HTTP surface of the app under test (wayfarer).
// No browser: Playwright's request fixture only, so this lane stays fast and
// runs in a container without browser binaries.

test.describe('routes', () => {
  test('landing page is served', async ({ request }) => {
    const res = await request.get('/')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('text/html')
  })

  test('wizard entry point is served', async ({ request }) => {
    const res = await request.get('/plan')
    expect(res.status()).toBe(200)
  })

  test('results renders from query params alone', async ({ request }) => {
    // Results is the one dynamic route: the answers live in the URL, which is
    // what makes a result shareable. That contract is worth asserting at the
    // HTTP layer, not just through the UI.
    const res = await request.get('/results?party=couple&vibe=local&splurges=food&detail=essentials')
    expect(res.status()).toBe(200)
  })

  test('unknown route returns 404 rather than 500', async ({ request }) => {
    const res = await request.get('/this-route-does-not-exist')
    expect(res.status()).toBe(404)
  })
})
// The /results shareable-URL guarantee, published as contract_1f5a871e.
// These live here rather than in the ui lane because they are properties of
// the HTTP surface: no browser is needed to prove them, and the ui lane
// should be able to trust them without rediscovering them through the wizard.
test.describe('results shareable URL (contract_1f5a871e)', () => {
  const FULL = '/results?splurges=hotel%2Cfood&party=couple&vibe=local&transit=clean-transit&detail=essentials'

  // Ranking is derived from the params, not from where they sit in the string.
  // A shared link that survived a URL rewriter must still resolve the same.
  test('param order does not change the recommendations', async ({ request }) => {
    const shuffled = '/results?detail=essentials&transit=clean-transit&vibe=local&party=couple&splurges=hotel%2Cfood'
    const [a, b] = await Promise.all([request.get(FULL), request.get(shuffled)])
    expect(a.status()).toBe(200)
    expect(b.status()).toBe(200)
    expect(names(await b.text())).toEqual(names(await a.text()))
  })

  // No validation layer exists, so every one of these must render rather than
  // error. A 500 here is the regression this test is for.
  for (const url of [
    '/results',                                        // nothing at all
    '/results?party=couple',                           // partial
    '/results?splurges=&party=solo&vibe=mix&transit=car&detail=essentials',
    '/results?party=banana&vibe=banana&transit=banana&detail=banana',
    '/results?party=couple&party=family',              // repeated
    '/results?party=couple&utm_source=twitter'         // unknown extra
  ]) {
    test(`renders without error: ${url}`, async ({ request }) => {
      const res = await request.get(url)
      expect(res.status()).toBe(200)
      expect(cards(await res.text())).toBe(3)
    })
  }

  // Omitting a param and defaulting it must be indistinguishable, or a
  // half-filled shared link would rank differently from an explicit one.
  test('missing params fall back to the documented defaults', async ({ request }) => {
    const bare = await request.get('/results')
    const explicit = await request.get('/results?party=solo&vibe=mix&splurges=&transit=car&detail=essentials')
    expect(names(await explicit.text())).toEqual(names(await bare.text()))
  })

  // Repeating a param arrives as an array, fails the string check, and reverts
  // to the default -- so this must match solo, not couple.
  test('a repeated param reverts to its default rather than picking one', async ({ request }) => {
    const tail = '&vibe=classic&splurges=hotel&transit=car&detail=essentials'
    const solo = await request.get(`/results?party=solo${tail}`)
    const couple = await request.get(`/results?party=couple${tail}`)
    const repeated = await request.get(`/results?party=couple&party=family${tail}`)
    expect(names(await repeated.text())).toEqual(names(await solo.text()))
    expect(names(await couple.text())).not.toEqual(names(await solo.text()))
  })

  // splurges is one comma-joined value. The repeated form is not an alias for
  // it -- it parses as no selection, which scores differently.
  test('splurges is comma-joined, not a repeated param', async ({ request }) => {
    const head = '/results?party=couple&vibe=local&transit=car&detail=essentials'
    const joined = await request.get(`${head}&splurges=hotel%2Cfood`)
    const repeated = await request.get(`${head}&splurges=hotel&splurges=food`)
    const none = await request.get(`${head}&splurges=`)
    expect(names(await repeated.text())).toEqual(names(await none.text()))
    expect(names(await joined.text())).not.toEqual(names(await none.text()))
  })

  test('detail=everything expands the cards, and is case-sensitive', async ({ request }) => {
    const open = async (u: string) => (await (await request.get(u)).text()).includes('<details class="mt-4 group" open=""')
    expect(await open('/results?detail=everything')).toBe(true)
    expect(await open('/results?detail=essentials')).toBe(false)
    expect(await open('/results?detail=EVERYTHING')).toBe(false)
  })
})

/** Destination names in ranked order — the observable output of the scoring. */
function names (html: string): string[] {
  return [...html.matchAll(/<h2 class="text-2xl[^"]*">([^<]*)/g)].map((m) => m[1])
}

function cards (html: string): number {
  return html.split('data-testid="recommendation-card"').length - 1
}
