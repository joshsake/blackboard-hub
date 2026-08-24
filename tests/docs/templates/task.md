# Task — template

<!--
Use for: dispatching work to a lane (usually hub -> lane, but any lane may
ask another for work through hub). Write the entry the assignee needs six
hours from now, when this conversation has compacted away.

The lane that created the entry owns it, and only the owner can change its
status — the CLI refuses everyone else. An assignee who finishes a task they
do not own says so in their delivery finding and asks the owner to close it.

The TITLE line goes into --title; everything below it is the --body:

  node bin/board.mjs append --lane <you> --type task --to <lane> \
    --title "<outcome>" --body "<filled sections>" --refs <entry ids>

Owner closes:
  node bin/board.mjs append --lane <you> --id <task id> --type task --status done

Delete comments before posting. Keep every label; "none" over silence.
-->

TITLE: <the outcome wanted, not the activity>
<!-- "the /results contract, published and locked by specs",
     never "work on api tests". -->

CONTEXT
<why this, why now — and the entry ids that led here, so the assignee reads
 the same record you did instead of reconstructing it>

DELIVERABLE
<what exists when this is done: files, board entries, contracts — named
 concretely enough that presence or absence is checkable>

DONE LOOKS LIKE
<the acceptance test, verifiable by someone other than the assignee:
 commands that must pass, the sha cited in the delivery finding, the
 entries that must be on the board>

OUT OF SCOPE
<what this task is deliberately NOT asking for — the assignee should not
 have to guess where the edge is>

refs: <entry ids: the blocker this clears, the question this answers>
