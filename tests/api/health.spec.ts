import { test, expect } from '@playwright/test'

// Placeholder for the api layer. There is no system under test wired up yet,
// so this skips rather than failing red and training everyone to ignore it.
// Replace once BASE_URL points at something real.

test('service answers a health check', async ({ request }) => {
  test.skip(!process.env.BASE_URL, 'BASE_URL unset — no system under test yet')

  const res = await request.get('/health')
  expect(res.ok()).toBeTruthy()
})

test('unknown route returns 404 rather than 500', async ({ request }) => {
  test.skip(!process.env.BASE_URL, 'BASE_URL unset — no system under test yet')

  const res = await request.get('/this-route-does-not-exist')
  expect(res.status()).toBe(404)
})
