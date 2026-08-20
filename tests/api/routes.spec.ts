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
