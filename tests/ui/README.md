# ui lane — shared layer

Target-agnostic core of the ui lane. Per-target suites live under
`targets/<name>/ui/` (wayfarer's, with the full lane README, is
`targets/wayfarer/ui/`); Playwright's ui project collects
`targets/<name>/ui/**/*.spec.ts` plus `tests/ui/starter/**/*.spec.ts` via
`specPatterns('ui', target)` from `tests/lib/target.mjs` (contract_8f9d0915).

```
tests/ui/
  fixtures.ts   shared test object every ui spec builds on: one health probe
                of the target's healthRoute per worker (targetHealth), and
                skipUnlessTargetHealthy — the gate that turns a dead
                environment into SKIPPED-with-the-cause-named, never red.
                Knows no app: probe route and outage notes (blocker ids) come
                from targets/<name>/target.json
  starter/
    page.spec.ts one generic browser spec for ANY target: the landing page
                loads (status < 500) and carries a non-empty <title>.
                Deliberately ungated so it stays green during a backend
                outage and a real page-level regression stays visible
```

A target's fixture layer extends this test object rather than
`@playwright/test` (see `targets/wayfarer/ui/fixtures.ts`), so the gate and
any future shared fixtures stay consistent across targets.
