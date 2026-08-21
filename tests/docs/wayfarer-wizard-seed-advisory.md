# One line in `Wizard.tsx` is load-bearing for the results URL, and deleting it fails silently

**For:** whoever owns `wayfarer`
**From:** the external test suite that drives the wizard in a browser
**Status:** advisory — no change requested to your code, and none made

---

## Bottom line

`src/components/Wizard.tsx:94` seeds the answers state with an empty `splurges`
array. That seed looks like a redundant initialiser. It is not: it is the only
reason the completed wizard emits a `splurges` parameter at all when the user
picks no splurges, and the only reason `splurges` leads the query string.

Delete it as tidy-up and the wizard quietly emits four parameters instead of
five. Nothing errors. No HTTP-level test fails. Only a browser driving the real
wizard can see the difference.

Two suggestions, both cheap, at the end.

---

## The mechanism

Two pieces of `Wizard.tsx` combine. First, the seed:

```tsx
// src/components/Wizard.tsx:94
const [answers, setAnswers] = useState<Record<string, string | string[]>>({
  splurges: [],
});
```

Then the URL builder:

```tsx
// src/components/Wizard.tsx:108
function finish(finalAnswers: Record<string, string | string[]>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(finalAnswers)) {
    params.set(key, Array.isArray(value) ? value.join(",") : value);
  }
  router.push(`/results?${params.toString()}`);
}
```

`finish()` iterates **the keys that exist in state**, not a fixed list of the
five parameters. Everything below follows from that one fact:

- **An empty `splurges=` is emitted only because the key is already there.**
  A user who picks no splurges never writes to `splurges`, so the key exists
  solely by virtue of the seed. `[].join(",")` is `""`, which `URLSearchParams`
  renders as the bare `splurges=`.
- **`splurges` leads the query string because it is the only key present at
  mount.** `Object.entries` follows insertion order and `params.set` preserves
  the position of a key it has already seen, so the seeded key stays first and
  the other four append in the order the user answers them.

Neither behaviour is stated anywhere in the component. Both are consequences of
an initialiser that reads as a type-safety convenience.

---

## What breaks, and why nothing would tell you

Remove the `splurges: []` seed — the kind of edit that looks like removing dead
state — and for a user who selects no splurges:

| | before | after |
|---|---|---|
| keys in `finalAnswers` | 5 | 4 |
| emitted URL | `?splurges=&party=…` | `?party=…` |
| `GET /results` | 200 | 200 |
| recommendations rendered | 3 | 3 |

The resulting URL is still perfectly legal. `/results` treats a missing
`splurges` as the default empty selection, so it returns 200 and renders its
usual three cards. There is no error, no 4xx, no 500, and no visible defect on
the results page itself.

**This is the part worth internalising:** a test suite that exercises
`/results` over HTTP cannot catch this. It would be requesting URLs it built
itself, and those URLs are unaffected. The regression lives strictly in what
the *wizard* emits, so only a test that drives the wizard in a real browser and
then reads the resulting URL can observe it.

That is also why it would likely survive review. The diff deletes an empty
array; the test suite stays green; the app still works when clicked through
casually, because the recommendations are identical either way. The only signal
is a parameter that stopped appearing in a URL nobody reads closely.

---

## What catches it today

One test, in the suite that drives your wizard in a browser:

```
tests/ui/results-contract.spec.ts:52
  'a completed wizard emits all five params, including an empty splurges'
```

It completes the wizard selecting **no** splurges, then asserts presence
separately from value:

```ts
for (const param of ALL_PARAMS) {
  expect(url.searchParams.has(param), `${param} must be emitted`).toBe(true)
}
// The clause worth having a test for: picking nothing still emits the key.
expect(url.searchParams.get('splurges')).toBe('')
```

Presence and value are asserted separately on purpose. To a regular expression
like `/splurges=/`, a parameter that was omitted and one that is present but
empty are indistinguishable — so the check that actually matters here is
`searchParams.has()`, not a pattern match against the URL string.

The team that wrote this spec verified it fails on this exact break rather than
assuming it would (see *Provenance* below).

---

## Recommendation

Two things, neither of which changes behaviour:

**1. Comment the seed at the source line.** The next person to read
`Wizard.tsx:94` has no way to know the initialiser is doing two jobs. Something
like:

```tsx
// Seeded, not merely typed: finish() emits the keys present in this object,
// so this is what makes an empty `splurges=` appear in the URL when the user
// picks nothing — and what keeps splurges first in the query string.
// Removing it silently drops the param; /results still returns 200.
const [answers, setAnswers] = useState<Record<string, string | string[]>>({
  splurges: [],
});
```

**2. Keep a browser-level wizard test in whatever gate you run.** The specific
spec above is the current safety net, but the general point outlives it: your
HTTP-level coverage structurally cannot see wizard emission regressions. If the
browser suite is not in the gate, this class of defect has nothing standing in
front of it.

We are flagging rather than changing. The code is correct as written — it is
just load-bearing in a way its appearance does not advertise.

---

## Provenance: what was verified, and by whom

This advisory compiles work done by others. The split matters, so it is
explicit.

**Re-verified directly while writing this, by reading the source:**

- `Wizard.tsx:94` contains the `splurges: []` seed as quoted. Read at commit
  `72ef4e8`, file unmodified in the working tree.
- `finish()` at `Wizard.tsx:108` iterates `Object.entries(finalAnswers)` and
  calls `params.set`. The mechanism described above — key-existence controls
  emission, insertion order controls position — follows from that code as read.
- The cited spec exists at `tests/ui/results-contract.spec.ts:52` with the
  assertions quoted, at the browser suite's commit `dabb2de` — the only
  revision that has ever modified that file. (Older internal records call that
  same commit `2ca5f74`; a history rewrite renamed it. Same commit, same
  bytes.)

**Cited from the browser-suite team's report, not re-run here:**

- That all five specs were observed to go red when the wizard was deliberately
  mutated, and green again after revert — including that changing `finish()` to
  append instead of set turns specs 1, 2 and 3 red. The mutation runs and the
  clean revert are their result, reproduced here on their authority.
- That the suite is 9/9 green against a local production build.
- Note on their evidence pointer: the commit hash in the original report,
  `2ca5f74`, no longer resolves — a history rewrite on our side renamed it to
  `dabb2de`, confirmed against the rewrite's own commit map. The rewrite
  changed no content in this file; the rename propagated from an earlier
  ancestor. Same commit, same spec, different label. Nothing about the finding
  or the recommendations below is affected.

**Not done at all, and worth stating plainly:**

- No test run of any kind was performed for this document. The suite was not
  executed; the failure mode described was not reproduced here.
- The claim that deleting the seed leaves the entire HTTP-level suite green is
  reasoned from the code and from the published behaviour of `/results`, not
  demonstrated by deleting the seed and running that suite. It is the one
  load-bearing claim in this document that nobody has executed end to end. If
  you want it demonstrated before acting, that is a fair ask and it is cheap to
  do.
