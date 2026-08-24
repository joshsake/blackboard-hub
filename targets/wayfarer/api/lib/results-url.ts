// Executable form of contract_1f5a871e: /results renders entirely from query
// params, all optional, never erroring. Two halves:
//
//   buildResultsUrl        emits the URL a completed wizard emits
//   effectiveResultsParams the oracle: what any /results URL MEANS to the app
//
// The oracle exists because the contract's failure modes are silent — a
// repeated param or a mis-joined splurges list changes the ranking without an
// error, so a test that builds a URL by hand can go green against the wrong
// page (see the api lane's URL-traps finding). Jest asserts these semantics
// with no network; Playwright specs may import the builder to construct
// correct URLs for live probes.
//
// Everything here restates contract_1f5a871e, verified 2026-08-20 by direct
// HTTP probe. If the app and this file disagree, the app has drifted from the
// contract — raise it on the board rather than editing this to match.

export const PARTIES = ['solo', 'couple', 'family'] as const
export const VIBES = ['local', 'mix', 'classic'] as const
export const SPLURGES = ['hotel', 'food', 'experiences'] as const
export const TRANSITS = ['clean-transit', 'rideshare', 'car'] as const
export const DETAILS = ['essentials', 'everything'] as const

export type Party = (typeof PARTIES)[number]
export type Vibe = (typeof VIBES)[number]
export type Splurge = (typeof SPLURGES)[number]
export type Transit = (typeof TRANSITS)[number]
export type Detail = (typeof DETAILS)[number]

/** What the wizard has when it navigates to /results. */
export interface WizardAnswers {
  party: Party
  vibe: Vibe
  /** Possibly empty. A real wizard emits a subset of SPLURGES. */
  splurges: Splurge[]
  transit: Transit
  detail: Detail
}

/** How the app resolves any /results URL, per the contract. */
export interface EffectiveParams {
  /** Effective ranking branch — unknown or repeated values land on the default. */
  party: Party
  vibe: Vibe
  transit: Transit
  /**
   * Parsed tokens, UNVALIDATED on purpose: the app keeps unknown tokens, and
   * any non-empty selection suppresses the budget-conscious criterion — the
   * one place an unknown value does NOT behave like the default.
   */
  splurges: string[]
  splurgeSelectionActive: boolean
  /** detail === 'everything', exactly and case-sensitively. */
  cardsExpanded: boolean
}

export const DEFAULTS: EffectiveParams = {
  party: 'solo',
  vibe: 'mix',
  transit: 'car',
  splurges: [],
  splurgeSelectionActive: false,
  cardsExpanded: false
}

/**
 * The URL a completed wizard emits. Always all five params — splurges is
 * present even when empty (`splurges=`), and leads because the wizard seeds
 * its state with `splurges: []` and later writes preserve key position.
 * splurges is ONE comma-joined value; URLSearchParams encodes the comma as
 * %2C. Never emit the repeated form (`splurges=a&splurges=b`): it is not an
 * alias — it parses as no selection at all.
 */
export function buildResultsUrl (answers: WizardAnswers): string {
  const q = new URLSearchParams()
  q.set('splurges', answers.splurges.join(','))
  q.set('party', answers.party)
  q.set('vibe', answers.vibe)
  q.set('transit', answers.transit)
  q.set('detail', answers.detail)
  return `/results?${q.toString()}`
}

/**
 * The oracle. Accepts a full URL, a path with query, or a bare query string.
 * Mirrors the server's view, where a single param is a string and a repeated
 * param is an ARRAY — everything below hinges on that distinction:
 *
 *  - missing or empty        -> default (an empty value is treated as absent)
 *  - repeated (array)        -> fails the string check -> default
 *  - unknown party/vibe/transit -> falls through to the default's branch
 *  - splurges: any non-empty string is a selection, unknown tokens included;
 *    the repeated form is an array, so it parses as NO selection
 *  - detail: 'everything' exactly (case-sensitive) expands the cards
 *  - unknown params (utm_* etc.) are ignored
 */
export function effectiveResultsParams (urlOrQuery: string): EffectiveParams {
  const qIndex = urlOrQuery.indexOf('?')
  const sp = new URLSearchParams(qIndex >= 0 ? urlOrQuery.slice(qIndex + 1) : urlOrQuery)

  const raw = (key: string): string | string[] | undefined => {
    const all = sp.getAll(key)
    return all.length === 0 ? undefined : all.length === 1 ? all[0] : all
  }

  const pick = <T extends string>(key: string, allowed: readonly T[], dflt: T): T => {
    const v = raw(key)
    if (typeof v !== 'string' || v === '') return dflt
    return (allowed as readonly string[]).includes(v) ? (v as T) : dflt
  }

  const s = raw('splurges')
  const splurges = typeof s === 'string' && s !== '' ? s.split(',') : []

  return {
    party: pick('party', PARTIES, DEFAULTS.party),
    vibe: pick('vibe', VIBES, DEFAULTS.vibe),
    transit: pick('transit', TRANSITS, DEFAULTS.transit),
    splurges,
    splurgeSelectionActive: splurges.length > 0,
    cardsExpanded: raw('detail') === 'everything'
  }
}
