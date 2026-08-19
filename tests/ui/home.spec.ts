import { test, expect } from '@playwright/test'

// Placeholder for the ui layer. Skips until BASE_URL points at a real app.

test('home page loads and renders a heading', async ({ page }) => {
  test.skip(!process.env.BASE_URL, 'BASE_URL unset — no system under test yet')

  await page.goto('/')
  await expect(page.getByRole('heading').first()).toBeVisible()
})
