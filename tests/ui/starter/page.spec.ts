import { test, expect } from '../fixtures'

// Starter spec — target-agnostic by definition (contract_d350537b). It runs
// for EVERY registered target, including the zero-knowledge proof target
// (example), so nothing here may assume an app: no routes beyond '/', no
// selectors, no response shapes. Real behaviour lives in the per-target
// suites under targets/<name>/ui/.
//
// Deliberately ungated: the landing page must keep loading even while a
// target's data backend is down (wayfarer's / renders fine throughout
// blocker_a3ba1690), so a real page-level regression stays visible during an
// outage instead of hiding behind the health gate.

test.describe('starter: any-target page surface', () => {
  test('the landing page loads and carries a non-empty title', async ({ page }) => {
    const response = await page.goto('/')

    // goto returns the main-resource response; anything 5xx means the page
    // did not load, whatever the body says.
    expect(response, 'goto must produce a response').not.toBeNull()
    expect(response!.status(), 'landing page must not be a server error').toBeLessThan(500)

    // A browser-rendered page with an empty <title> is either half-broken or
    // half-built; every real target names itself.
    await expect(page).toHaveTitle(/\S/)
  })
})
