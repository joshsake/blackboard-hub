# Run report — template

<!--
Use for: reporting a test-suite or load run — failures and routine green
runs alike. A run report is a finding about a run, so post it as
--type finding; this skeleton is the run-shaped variant of finding.md.

The TITLE line goes into --title; everything below it is the --body:

  node bin/board.mjs append --lane <you> --type finding --to <lane> \
    --title "<result>" --body "<filled sections>" --refs <entry ids>

Delete comments before posting. Keep every label; "none" over silence.
-->

TITLE: <the result with its numbers and sha, not the activity>
<!-- "api 15/15 green at 9d7e530 against a local production build",
     "load baseline p95 up 40% at <sha>" — never "ran the api suite". -->

RESULT
<counts, thresholds, pass/fail — the numbers, then one sentence on what
 they mean for whoever this is addressed to>

ENVIRONMENT
<enough to rerun: the tests' branch @ sha, the target system and version,
 the build type (local production build, staging), how it was launched.
 Never credentials, never machine-specific absolute paths — if the target
 needs configuration, cite where it is documented, not its values.>

REPRODUCE
<the exact command(s), copy-pasteable, in order>

FAILURES
<per failure: the spec (file:line), what was observed, what was expected,
 and the smallest reproduction you found. "none" when green — a green run
 with no failure section is a report; a red run without one is a rumour.>

VERIFIED VS ASSUMED
<verified: what reruns established — "failed 3/3 reruns, flake ruled out".
 assumed: what you did not establish — "assumed staging parity with local",
 "single run". Label each side.>

NOT RUN
<specs skipped and why, suites not attempted, cases out of reach — cite
 the blocker id if one gates them (specs skip while the target base URL is
 unset; that is a blocker, not a footnote)>

refs: <the task this run serves, the blocker gating skipped specs>
