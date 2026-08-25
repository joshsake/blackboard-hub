# Cross-lane test audit — template

<!--
Use for: the docs lane's neutral traceability audit (charter:
board/lanes.json; decision: finding_f09d56d2). The audit REPORTS and rules
nothing: every collision or verdict-shaped item becomes a question to hub,
cited from the DUPLICATION or UNCOVERED entry that found it.

The filled audit is a long-form artifact under tests/docs/ (board-is-the-
record: the summary finding to hub carries the four lists' counts and cites
the artifact path plus the sha that added it).

Ground rules that keep the audit honest:
- Code implementing a clause is NOT coverage; only an assertion is. The
  matrix must say which it found: asserted, implemented-untested, or
  asserted only against a mirror/oracle rather than the live system.
- Sweep at a stated sha. Every file:line cite is dead the commit after.
- Count at assertion granularity: one clause = one row a spec could lock.

Delete comments before committing. Keep every label; "none" over silence.
-->

TITLE: <the audit's headline numbers, not the activity>
<!-- "audit at <sha>: N clauses swept, N uncovered, N duplications,
     N stale refs, validation debt N", never "ran the audit". -->

SCOPE SWEPT
<the contracts audited, BY REVISION (an entry revised in place changes
 meaning under the same id); the trees and files actually read, at which
 sha; which cited entry ids had their board status checked. Anything not
 listed here belongs in NOT SWEPT — silence reads as coverage.>

TRACEABILITY MATRIX
<per contract: clause -> spec file:line -> layer -> status.
 Layers: unit (no network) | http | browser | k6 | process.
 Status: asserted | mirror-only (locked against a lane-owned oracle, not
 the live system) | implemented-untested | uncovered.
 Cross-layer assertion of one clause is defense in depth, not duplication
 — record all layers.>

UNCOVERED
<clauses no spec asserts anywhere, one line each with the contract id.
 Implemented-untested items list here too: enforcement at runtime is not
 an assertion. Say what covering each would take, without prescribing
 who — ownership is hub's ruling, not the audit's.>

DUPLICATION
<same claim, same layer, no deliberate double-coverage citation. Cite
 both file:line sites, name the layer, and record any mitigation you
 found (a README split, a differing subject). Then raise the question to
 hub and put its entry id here — the audit reports, hub rules.>

STALE REFS
<specs, fixtures, oracles or lane READMEs citing superseded entries —
 checked against the live board, not from memory. List every distinct
 entry id swept and its status; "none" is a claim about that list, so
 the list must be here.>

VALIDATION DEBT
<clauses that record observed behavior no human has ruled intended —
 the count is load-bearing (finding_f09d56d2 defers V&V tagging on it),
 so state the criteria and count conservatively:
 - counts: observed/probed behavior, no intent ruling on the board, no
   product-surface evidence that makes intent self-evident
 - does not count: harness-authored contracts (intent by authorship and
   hub acceptance), clauses the product surface itself testifies to,
   anti-assertion advisories nothing locks
 Report the number, the per-clause list with what locks each, and the
 sub-count locked only against a mirror — a spec locking unjudged
 behavior is the case where an intended fix arrives as a red build.>

NOT SWEPT
<what this audit did not read, did not run, and cannot claim: suites not
 executed (a static read proves assertions exist, not that they pass),
 reverse traceability unless swept, prose accuracy of READMEs, anything
 out of charter. Name it or it reads as covered.>

refs: <the audit task, finding_f09d56d2, questions raised>
