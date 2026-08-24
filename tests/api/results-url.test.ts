// Jest layer (no network): contract_1f5a871e as unit assertions over the
// builder and oracle in lib/results-url.ts. Every clause of the contract that
// can be stated without an HTTP round-trip is locked here; the live half of
// the same contract stays in routes.spec.ts under Playwright.
import { describe, expect, test } from '@jest/globals'
import {
  DEFAULTS,
  buildResultsUrl,
  effectiveResultsParams,
  type WizardAnswers
} from './lib/results-url.js'

const FULL: WizardAnswers = {
  party: 'couple',
  vibe: 'local',
  splurges: ['hotel', 'food'],
  transit: 'clean-transit',
  detail: 'essentials'
}

describe('buildResultsUrl — what a completed wizard emits', () => {
  test('always carries all five params, even with nothing picked', () => {
    const url = buildResultsUrl({ ...FULL, splurges: [] })
    const sp = new URLSearchParams(url.split('?')[1])
    expect([...sp.keys()].sort()).toEqual(['detail', 'party', 'splurges', 'transit', 'vibe'])
    // splurges is emitted as an empty value, not omitted
    expect(sp.get('splurges')).toBe('')
  })

  test('emits the documented order: splurges, party, vibe, transit, detail', () => {
    const sp = new URLSearchParams(buildResultsUrl(FULL).split('?')[1])
    expect([...sp.keys()]).toEqual(['splurges', 'party', 'vibe', 'transit', 'detail'])
  })

  test('splurges is one comma-joined param with the comma percent-encoded', () => {
    const url = buildResultsUrl(FULL)
    expect(url).toContain('splurges=hotel%2Cfood')
    // never the repeated form, which the app parses as no selection
    expect(url.match(/splurges=/g)).toHaveLength(1)
  })

  test('never repeats any param — repetition silently reverts it server-side', () => {
    const sp = new URLSearchParams(buildResultsUrl(FULL).split('?')[1])
    for (const key of new Set(sp.keys())) expect(sp.getAll(key)).toHaveLength(1)
  })
})

describe('effectiveResultsParams — defaults', () => {
  test('bare /results resolves to the documented defaults', () => {
    expect(effectiveResultsParams('/results')).toEqual(DEFAULTS)
  })

  test('an empty value is treated as absent, not as an unknown value', () => {
    expect(effectiveResultsParams('splurges=&party=&vibe=&transit=&detail=')).toEqual(DEFAULTS)
  })

  test('a partial URL defaults only the missing params', () => {
    expect(effectiveResultsParams('/results?party=couple')).toEqual({
      ...DEFAULTS,
      party: 'couple'
    })
  })

  test('accepts a full URL, path with query, or bare query string alike', () => {
    const q = 'party=family&vibe=classic'
    const fromBare = effectiveResultsParams(q)
    expect(effectiveResultsParams(`/results?${q}`)).toEqual(fromBare)
    expect(effectiveResultsParams(`https://example.test/results?${q}`)).toEqual(fromBare)
  })
})

describe('effectiveResultsParams — unknown values', () => {
  test('unknown party/vibe/transit fall through to the default branch', () => {
    expect(effectiveResultsParams('party=banana&vibe=banana&transit=banana&detail=banana'))
      .toEqual(DEFAULTS)
  })

  test('unknown splurges token still counts as a selection — the one asymmetry', () => {
    const e = effectiveResultsParams('splurges=banana')
    expect(e.splurges).toEqual(['banana'])
    expect(e.splurgeSelectionActive).toBe(true)
    // so it does NOT resolve like the empty form
    expect(e).not.toEqual(effectiveResultsParams('splurges='))
  })

  test('unknown params such as utm_* are ignored', () => {
    expect(effectiveResultsParams('party=couple&utm_source=twitter&utm_campaign=x'))
      .toEqual({ ...DEFAULTS, party: 'couple' })
  })
})

describe('effectiveResultsParams — repeated params (the silent trap)', () => {
  test('a repeated param reverts to its default, not to either given value', () => {
    const e = effectiveResultsParams('party=couple&party=family')
    expect(e.party).toBe('solo')
  })

  test('repeated splurges parses as NO selection, unlike the comma-joined form', () => {
    const repeated = effectiveResultsParams('splurges=hotel&splurges=food')
    expect(repeated.splurges).toEqual([])
    expect(repeated.splurgeSelectionActive).toBe(false)

    const joined = effectiveResultsParams('splurges=hotel%2Cfood')
    expect(joined.splurges).toEqual(['hotel', 'food'])
    expect(joined.splurgeSelectionActive).toBe(true)
  })
})

describe('effectiveResultsParams — detail is case-sensitive', () => {
  test('detail=everything expands the cards', () => {
    expect(effectiveResultsParams('detail=everything').cardsExpanded).toBe(true)
  })

  test('detail=EVERYTHING (or any other value) behaves as essentials', () => {
    expect(effectiveResultsParams('detail=EVERYTHING').cardsExpanded).toBe(false)
    expect(effectiveResultsParams('detail=Everything').cardsExpanded).toBe(false)
    expect(effectiveResultsParams('detail=banana').cardsExpanded).toBe(false)
  })
})

describe('round trip — build then resolve', () => {
  const cases: Array<[string, WizardAnswers]> = [
    ['full answers', FULL],
    ['nothing picked', { party: 'solo', vibe: 'mix', splurges: [], transit: 'car', detail: 'essentials' }],
    ['everything detail', { party: 'family', vibe: 'classic', splurges: ['experiences'], transit: 'rideshare', detail: 'everything' }]
  ]

  test.each(cases)('%s resolve to exactly what was picked', (_name, answers) => {
    const e = effectiveResultsParams(buildResultsUrl(answers))
    expect(e.party).toBe(answers.party)
    expect(e.vibe).toBe(answers.vibe)
    expect(e.transit).toBe(answers.transit)
    expect(e.splurges).toEqual(answers.splurges)
    expect(e.cardsExpanded).toBe(answers.detail === 'everything')
  })

  test('param order does not change what a URL resolves to', () => {
    const emitted = effectiveResultsParams(buildResultsUrl(FULL))
    const shuffled = effectiveResultsParams(
      '/results?detail=essentials&transit=clean-transit&vibe=local&party=couple&splurges=hotel%2Cfood'
    )
    expect(shuffled).toEqual(emitted)
  })
})
