# Target onboarding — checklist template

<!--
Use for: bringing a new target into the registry (targets/README.md has
the concept, schema, and resolution order; contract_d350537b is the
design of record). This is a checklist, not an entry skeleton: work
through it in order while onboarding, then post the filled form as
--type finding to hub when onboarding completes.

Every checked item cites its evidence — a command and its output, a sha,
an entry id. A checked box without evidence reads as coverage and is
worth less than an honest OPEN. Items a target cannot satisfy go under
each section's "not applicable", with the reason — omit rather than
invent applies to checklists too.

The TITLE line goes into --title; everything below it is the --body:

  node bin/board.mjs append --lane <you> --type finding --to hub \
    --title "<title>" --body "<filled checklist>" --refs <entry ids>

Delete comments before posting. Keep every label; "none" over silence.
-->

TITLE: target <name> onboarded — <the one-line state>
<!-- "target claudia onboarded — starter specs green deployed-only, no
     local mode, ui suite planned", never "onboarding work done". -->

REGISTERED
[ ] targets/<name>/target.json written; name matches the directory
[ ] only known fields present — every omitted field omitted on purpose
[ ] repo URL points at public source (or is omitted, stated why)
evidence: <sha that adds the descriptor; list the omitted fields>

HEALTH
[ ] healthRoute chosen; states why it proves the full stack is up
    (a static page that renders while the backend is down does not)
[ ] probed: exact command, observed status and latency
evidence: <command + observed output>

SELECTION PROVED
[ ] TARGET=<name> resolves — starter specs ran against this target,
    not the default
[ ] each resolution mode the target supports exercised:
    [ ] explicit BASE_URL
    [ ] BASE_URL=deployed sentinel -> deployedUrl
    [ ] no BASE_URL with start+appDir -> local-build mode
not applicable: <modes the target lacks, and why — e.g. no start block>
evidence: <one command + result per mode>

STARTER SPECS GREEN
[ ] counts per suite (api/ui/load), at <tests sha>, against <mode>
[ ] specs unedited — a target needing starter-spec changes is a
    question to hub about the specs, not a local patch
evidence: <commands + counts>

PER-LANE SUITES PLANNED
[ ] per lane: task entry id under targets/<name>/<lane>/, or "none
    planned" with the reason
api: <entry id | none planned, reason>
ui: <entry id | none planned, reason>
load: <entry id | none planned, reason>

CONTRACTS PUBLISHED
[ ] entry ids of what this target guarantees, for other lanes to build
    against — or "none yet; first per-target suite publishes them"
evidence: <entry ids>

OPERATIONAL NOTES RECORDED
[ ] notes field carries the one line an operator needs (or states
    "none known after <n> runs" — explicitly, not by omission)
evidence: <the line itself, or the entry id the line cites>

VERIFIED VS ASSUMED
<verified: which of the above you observed, with method.
 assumed: what you took on trust — a deployedUrl someone else probed,
 a health route read from source. Label each.>

NOT DONE / STILL OPEN
<what onboarding did not cover and who picks it up — unexercised
 modes, unplanned lanes, unpublished contracts>

refs: <contract_d350537b, the task that asked for this target, per-lane
      task ids>
