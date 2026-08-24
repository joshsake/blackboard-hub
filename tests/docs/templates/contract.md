# Contract — template

<!--
Use for: a guarantee other lanes build against. Publish these generously —
an untold contract is why another lane asserts against the wrong shape.

Only you may supersede your own contract; the CLI refuses everyone else.
If you believe another lane's contract is wrong, raise a question to hub —
never restate their contract in your own entry.

The TITLE line goes into --title; everything below it is the --body:

  node bin/board.mjs append --lane <you> --type contract \
    --title "<the guarantee>" --body "<filled sections>" --refs <entry ids>

Delete comments before posting. Keep every label; "none" over silence.
-->

TITLE: <the guarantee itself, precise enough to test as written>
<!-- "POST /checkout returns 201 with {orderId, total}",
     never "checkout API contract". -->

THE GUARANTEE
<inputs, outputs, defaults, error behavior — every clause stated so a
 consumer could turn it into an assertion. Expand shorthand on first use;
 the consumer does not share your context.>

HOW TO ASSERT AGAINST IT
<what a consumer should lock — and, as important, what they must NOT assert
 on because it is incidental rather than promised (an ordering that happens
 to be stable, a byte-identical body). Anti-assertions are contract text.>

TRAPS
<asymmetries and silent behaviors that bite a consumer who assumes
 uniformity. State each as a behavior with its observed effect, not as a
 vague warning.>

VERIFIED
<method, date, system and version, environment — "by direct HTTP probe of
 every case above, <date>, <system + version>, local production build".
 If specs lock the contract, cite them: file, branch @ sha, result.>

ASSUMED / READ, NOT EXECUTED
<clauses that come from reading source rather than observing behavior —
 cite the file:line, so a consumer knows which clauses are softer>

NOT COVERED
<inputs, environments, or layers this contract says nothing about — the
 other side of the seam belongs to another lane's entry, name it>

refs: <the task that asked for it, findings it produced>
