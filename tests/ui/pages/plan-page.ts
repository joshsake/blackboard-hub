import { expect, type Locator, type Page } from '@playwright/test'

/** The five answers a traveller gives the wizard, in step order. splurges is
 *  the one multi-select step: zero or more of hotel | food | experiences. */
export interface Choices {
  party: string
  vibe: string
  splurges: string[]
  transit: string
  detail: string
}

/** Page object for the /plan preference wizard.
 *
 *  Selectors are the data-testids the app plants deliberately; nothing here
 *  depends on styling or DOM shape, so a refactor should not turn a spec red.
 *  Locators are exposed rather than wrapped in assert-methods: assertions are
 *  the load-bearing part of a spec and belong in the spec, where a reviewer
 *  can see exactly what is guaranteed. */
export class PlanPage {
  readonly page: Page

  /** "N of 5" step indicator. */
  readonly progress: Locator
  /** Explicit advance button — only the multi-select step needs it; the
   *  single-select steps auto-advance on click. */
  readonly continueButton: Locator
  /** Returns to the previous step; must not lose the answer already given. */
  readonly backButton: Locator

  constructor (page: Page) {
    this.page = page
    this.progress = page.getByTestId('wizard-progress')
    this.continueButton = page.getByTestId('wizard-continue')
    this.backButton = page.getByTestId('wizard-back')
  }

  /** An answer chip on the current step, by its value (option-<value>). */
  option (value: string): Locator {
    return this.page.getByTestId(`option-${value}`)
  }

  async goto (): Promise<void> {
    await this.page.goto('/plan')
  }

  async choose (value: string): Promise<void> {
    await this.option(value).click()
  }

  /** Drive the wizard to completion and return the URL it emitted.
   *  Passing no splurges exercises the "keep it lean" path, which
   *  contract_1f5a871e says still emits the key. Single-select steps
   *  auto-advance; the one multi-select step needs the explicit continue
   *  button.
   *
   *  Body is line-for-line the completeWizard helper that
   *  results-contract.spec.ts carried before the page-object refactor —
   *  the five contract specs were mutation-verified through this exact
   *  sequence (finding_e24f4931). Change it only with a re-verification.
   *
   *  NOTE: the final toHaveURL needs /results to actually render. When the
   *  data backend is down the client-side navigation never commits and the
   *  URL stays on /plan (verified against the deployed target, 2026-08-24),
   *  so every caller must be health-gated with skipUnlessResultsRenders. */
  async complete (choices: Choices): Promise<URL> {
    await this.goto()

    await this.choose(choices.party)
    await this.choose(choices.vibe)

    for (const splurge of choices.splurges) {
      await this.choose(splurge)
    }
    await this.continueButton.click()

    await this.choose(choices.transit)
    await this.choose(choices.detail)

    await expect(this.page).toHaveURL(/\/results\?/)
    return new URL(this.page.url())
  }
}
