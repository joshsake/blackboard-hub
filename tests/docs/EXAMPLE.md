# EXAMPLE — templates/contract.md, filled

This is `templates/contract.md` filled with the content of board entry
contract_1f5a871e (api lane, 2026-08-20), reorganized into the template's
sections. The entry predates these templates, so two sections are
reconstructed from its board thread rather than its own body: ASSUMED
draws on finding_e24f4931, NOT COVERED on finding_863e16c5 and
finding_e24f4931. Everything else is the real entry's content. Note what
is absent: comments deleted, no section label dropped, no section left
silently empty.

---

TITLE: GET /results renders entirely from query params; all five are
optional and never error

THE GUARANTEE
Params (all optional, unknown ones ignored — utm_* is safe to append):

    party    solo | couple | family
    vibe     local | mix | classic
    splurges comma-joined subset of hotel,food,experiences
    transit  clean-transit | rideshare | car
    detail   essentials | everything

A wizard-completed URL always carries all five, including splurges when
nothing was picked (emitted as an empty "splurges="). Nothing is omitted.

Missing or empty param -> default, never an error:

    party->solo  vibe->mix  splurges->[]  transit->car  detail->essentials

An empty value is treated as absent. Bare GET /results is 200. There is no
validation layer: no combination of query params produces 400, 404 or 500.

Rendered output: exactly 3 data-testid="recommendation-card" articles for
every input. detail=everything renders each card's <details> with open;
any other value leaves them collapsed.

HOW TO ASSERT AGAINST IT
Emitted order is splurges, party, vibe, transit, detail, and it is stable —
but do NOT assert on whole-query-string equality: /results is
order-independent, and reordering params yields identical recommendations.
Assert per-param (toHaveURL(/party=couple/)). HTML is not byte-stable
across param orderings (the RSC payload embeds the URL), so assert on
rendered content, not a body hash.

TRAPS
1. splurges is ONE comma-joined param; URLSearchParams percent-encodes the
   comma (splurges=hotel%2Cfood). The repeated form
   ?splurges=hotel&splurges=food is NOT supported and does not mean the
   same thing — it parses as no selection.
2. Repeating any param silently reverts it to its default:
   ?party=couple&party=family arrives as an array, fails the string check,
   and falls back to solo. Verified: it returns the solo ranking, not
   couple's.
3. Unrecognized values are asymmetric. party/vibe/transit fall through to
   the same branch as their default, so party=banana ranks like party=solo.
   splurges does not: an unknown token counts as a non-empty selection and
   suppresses the budget-conscious criterion, so splurges=banana returns a
   different ranking than splurges= does. detail is case-sensitive —
   detail=EVERYTHING behaves as essentials.

VERIFIED
Every behavior above, 2026-08-20, against wayfarer on Next.js 16.2.10,
local production build, by direct HTTP probe of every case. Locked by 11
specs in tests/api/routes.spec.ts (lane/api @ 9d7e530, 15/15 green) —
finding_863e16c5.

ASSUMED / READ, NOT EXECUTED
The mechanism behind the emitted order — the wizard seeds its state with
splurges:[] and later writes preserve key position — is read from source,
not observed over HTTP. finding_e24f4931 later located it at Wizard.tsx:94
and showed that one line is load-bearing: delete the seed and the empty
splurges= vanishes from completed URLs while every HTTP-level clause above
stays green.

NOT COVERED
The emitting side of the seam. This contract describes what /results does
with a URL, not what the wizard emits — that is ui's half, locked
separately by finding_e24f4931 (tests/ui/results-contract.spec.ts, lane/ui
@ 2ca5f74). No staging environment: every probe ran against a local
production build.

refs: task_1d843a2b, finding_26d5ef1f

---

## What to notice

- **The title is the guarantee.** Testable as written, and it carries the
  conclusion on its own in a board listing. Not "documented the results
  page".
- **Anti-assertions are contract text.** "Stable, but do NOT assert on it"
  stops a consumer locking incidentals (param order, a body hash) the
  owner never promised. contract_1f5a871e's warning is why the ui specs
  assert per-param — see finding_e24f4931.
- **Traps are behaviors with observed effects**, not "be careful with
  splurges". Each one states input, mechanism, and the effect a consumer
  would see.
- **The verification line carries method, date, system and version, and
  environment** — a reader knows exactly how hard each clause is, and a
  future run against a different build knows what changed.
- **Verified and read-from-source claims are separated.** The order
  mechanism was the one source-read clause, and it is the one that later
  proved fragile — the split told the reader which clause was softer
  before that happened.
- **NOT COVERED names the other half of the seam** and whose entry owns
  it, so absence of coverage is a stated fact, not an inference from
  silence.
