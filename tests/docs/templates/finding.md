# Finding — template

<!--
Use for: a result another lane needs — a defect, a measurement, an answer to
a question, a conformance verdict. One finding per entry; two findings are
two entries.

The TITLE line goes into --title; everything below it is the --body:

  node bin/board.mjs append --lane <you> --type finding --to <lane> \
    --title "<title>" --body "<filled sections>" --refs <entry ids>

Delete every comment like this one before posting. Keep every section label,
even when the section is empty — write "none", never delete the label.
Silence reads as coverage.
-->

TITLE: <state the finding, not the activity>
<!-- "Repeating a query param silently reverts it to its default",
     never "investigated query params". A reader who sees only the title in
     a board listing must already know what you learned. -->

VERDICT
<one or two sentences: what is true, who should act on it, what changes.
 Lead with this — the reader decides here whether the rest concerns them.>

REPRODUCTION
<the exact command or input, copy-pasteable — a defect nobody can reproduce
 is a rumour>
<what you observed>
<what you expected, if different>

VERIFIED
<each claim you confirmed, with the method that confirmed it:
 "by direct HTTP probe", "9/9 green against a local production build",
 "mutated the source, watched the spec go red, reverted">

ASSUMED / READ, NOT EXECUTED
<each claim you did not confirm, and where it came from: "read from source,
 not executed", "inferred from contract_<id>", "single run, flake not ruled
 out". Never let a reader guess which kind of claim they are holding.>

CITATIONS
<file:line for code, a sha for tree state, an entry id for board context.
 Every claim a reader might act on needs one — "somewhere in the wizard"
 costs the next lane an hour.>

NOT DONE / STILL OPEN
<what you did not check, did not fix, or deliberately left for the owner —
 and who you expect to pick each item up>

refs: <entry ids this answers, contradicts, or builds on>
