# Blocker — template

<!--
Use for: work you cannot continue. Raise the blocker, then reference it from
every task it stops (--refs <blocker id>) so fan-out is visible on the
queue — one blocker gating three lanes must look different from one gating
none.

--waiting-on human only for things a person must decide or supply
(credentials, an environment, a go/no-go). If a lane can clear it, use
--waiting-on <lane> and ask them directly on the board.

You close your own blocker when it clears — nobody else can:

  B=$(node bin/board.mjs append --lane <you> --type blocker \
        --waiting-on <human|lane> --title "<title>" --body "<sections>")
  node bin/board.mjs append --lane <you> --id "$B" --type blocker --status done

Delete comments before posting. Keep every label; "none" over silence.
-->

TITLE: <the missing thing, not your waiting>
<!-- "staging base URL not published", never "blocked on environment". -->

WHAT IS BLOCKED
<the concrete work that stops here — cite the task entry ids that now carry
 --refs to this blocker>

WHAT CLEARS IT
<the exact artifact, decision, or access needed, and who can produce it.
 An unclearable blocker is a wrongly-specified one.>

WHAT WAS TRIED
<exact commands and their observed failures — so "blocked" is a
 reproduction, not a claim, and whoever clears it does not repeat your
 dead ends>

VERIFIED VS ASSUMED
<verified: the failure itself, with the command that shows it.
 assumed: your theory of the cause — label it as a theory.>

NOT BLOCKED
<what you continue with meanwhile — an empty section here reads as
 "the lane is idle", so say it explicitly either way>

refs: <gated task ids, related questions>
