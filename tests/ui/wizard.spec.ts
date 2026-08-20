import { test, expect } from '@playwright/test'

// ui lane — browser behaviour of the app under test (wayfarer).
// Selectors are the data-testids the app plants deliberately; nothing here
// depends on styling or DOM shape, so a refactor should not turn this red.

test.describe('preference wizard', () => {
  test('landing page leads into the wizard', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('start-wizard').click()

    await expect(page).toHaveURL(/\/plan/)
    await expect(page.getByTestId('wizard-progress')).toHaveText('1 of 5')
  })

  test('single-select auto-advances to the next step', async ({ page }) => {
    await page.goto('/plan')
    await expect(page.getByTestId('wizard-progress')).toHaveText('1 of 5')

    await page.getByTestId('option-couple').click()
    await expect(page.getByTestId('wizard-progress')).toHaveText('2 of 5')
  })

  test('back returns to the previous step without losing the answer', async ({ page }) => {
    await page.goto('/plan')
    await page.getByTestId('option-couple').click()
    await expect(page.getByTestId('wizard-progress')).toHaveText('2 of 5')

    await page.getByTestId('wizard-back').click()
    await expect(page.getByTestId('wizard-progress')).toHaveText('1 of 5')

    // Going forward again must not require re-answering: a wizard that forgets
    // on back-navigation is the classic bug this step exists to catch.
    await expect(page.getByTestId('option-couple')).toHaveAttribute('aria-pressed', 'true')
  })

  test('completed flow puts the answers in a shareable URL', async ({ page }) => {
    await page.goto('/plan')
    await page.getByTestId('option-couple').click()
    await page.getByTestId('option-local').click()
    await page.getByTestId('option-food').click()
    await page.getByTestId('wizard-continue').click()
    await page.getByTestId('option-clean-transit').click()
    await page.getByTestId('option-essentials').click()

    await expect(page).toHaveURL(/\/results\?/)
    await expect(page).toHaveURL(/party=couple/)
    await expect(page.getByTestId('recommendation-card').first()).toBeVisible()
  })
})
