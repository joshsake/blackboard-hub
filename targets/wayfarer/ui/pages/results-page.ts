import { type Locator, type Page } from '@playwright/test'

/** Page object for /results — the shareable page the wizard emits.
 *
 *  contract_1f5a871e: renders entirely from query params, exactly 3
 *  data-testid="recommendation-card" articles for every input, and
 *  detail=everything is the only value that renders each card's <details>
 *  open. Assert on rendered content, never on a body hash — the RSC payload
 *  embeds the URL, so HTML is not byte-stable across param orderings. */
export class ResultsPage {
  readonly page: Page

  /** All recommendation cards. The contract pins the count at exactly 3. */
  readonly cards: Locator

  constructor (page: Page) {
    this.page = page
    this.cards = page.getByTestId('recommendation-card')
  }

  card (index: number): Locator {
    return this.cards.nth(index)
  }

  /** The expandable highlights section of one card. Open state is what
   *  detail=everything toggles. */
  detailsOf (index: number): Locator {
    return this.card(index).locator('details')
  }

  /** Navigate straight to /results with a hand-built query. Build the query
   *  with URLSearchParams, not string concatenation: splurges is ONE
   *  comma-joined value (splurges=hotel%2Cfood) and a repeated param silently
   *  reverts to its default — both traps change the ranking without erroring
   *  (finding_26d5ef1f). */
  async goto (query: string | URLSearchParams = ''): Promise<void> {
    const search = query.toString()
    await this.page.goto(search ? `/results?${search}` : '/results')
  }
}
