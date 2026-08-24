import { test, expect } from '@playwright/test'

// Starter specs — target-agnostic by definition (contract_d350537b). They run
// for EVERY registered target, including the zero-knowledge proof target
// (example), so nothing here may assume an app: no routes beyond '/', no
// selectors, no response shapes. Heavier assertions live in the per-target
// suites under targets/<name>/api/.
//
// Deliberately ungated: these must stay green even while a target's data
// backend is down, so a real transport-level regression stays visible.

test.describe('starter: any-target HTTP surface', () => {
  test('root responds without a server error', async ({ request }) => {
    const res = await request.get('/')
    expect(res.status()).toBeLessThan(500)
  })

  test('an unknown route is not answered 200', async ({ request }) => {
    const res = await request.get('/this-route-does-not-exist-starter-probe')
    expect(res.status()).not.toBe(200)
  })
})
