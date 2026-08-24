import { test, expect, skipUnlessTargetHealthy } from './fixtures'

// ui lane — browser behaviour of the app under test (wayfarer).
// Selectors live in the page objects (./pages/); they are the
// data-testids the app plants deliberately, so nothing here depends on
// styling or DOM shape and a refactor should not turn this red.

test.describe('preference wizard', () => {
  test('landing page leads into the wizard', async ({ page, planPage }) => {
    await page.goto('/')
    // The landing page owns exactly one element we care about, so it gets an
    // inline locator rather than a page object of its own.
    await page.getByTestId('start-wizard').click()

    await expect(page).toHaveURL(/\/plan/)
    await expect(planPage.progress).toHaveText('1 of 5')
  })

  test('single-select auto-advances to the next step', async ({ planPage }) => {
    await planPage.goto()
    await expect(planPage.progress).toHaveText('1 of 5')

    await planPage.choose('couple')
    await expect(planPage.progress).toHaveText('2 of 5')
  })

  test('back returns to the previous step without losing the answer', async ({ planPage }) => {
    await planPage.goto()
    await planPage.choose('couple')
    await expect(planPage.progress).toHaveText('2 of 5')

    await planPage.backButton.click()
    await expect(planPage.progress).toHaveText('1 of 5')

    // Going forward again must not require re-answering: a wizard that forgets
    // on back-navigation is the classic bug this step exists to catch.
    await expect(planPage.option('couple')).toHaveAttribute('aria-pressed', 'true')
  })

  test('completed flow puts the answers in a shareable URL', async ({ page, planPage, resultsPage, targetHealth }) => {
    skipUnlessTargetHealthy(targetHealth)

    await planPage.complete({
      party: 'couple',
      vibe: 'local',
      splurges: ['food'],
      transit: 'clean-transit',
      detail: 'essentials'
    })

    await expect(page).toHaveURL(/party=couple/)
    await expect(resultsPage.cards.first()).toBeVisible()
  })
})
