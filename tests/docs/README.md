# Docs lane

Charter (board/lanes.json): documentation, PR bodies, result write-ups —
and the writing standard the other lanes' entries are held to. This lane
owns the templates and the standard; it never owns the facts. The lane
that did the work does, and only that lane may supersede its own entries.

## The board is the record; docs artifacts are the long-form

A conclusion that lives only in a chat reply, a transcript, or a file
nobody's entry points to is invisible to every other lane. So:

- **Every result lands on the board first**, as an entry that carries the
  conclusion and the citations. If it is not on the board, it did not
  happen.
- **Long-form goes under tests/docs/**, when the detail outgrows an entry
  body — and the board entry cites the file path and the sha that added
  it. The artifact elaborates the record; it is never a substitute for it.
- **If an artifact and the board disagree, the board is authoritative**,
  and the disagreement is a defect in the artifact — file it as one.

## The writing standard

The source of truth is "Write so someone else can act on it" in the lane
skill (.claude/skills/lane/SKILL.md); the hub holds entries to it when
accepting work. The short form:

1. **Title states the finding, not the activity.** "Repeating a query
   param silently reverts it to its default", not "investigated query
   params".
2. **Give the reproduction.** Exact command or input, observed, expected.
   A defect nobody can reproduce is a rumour.
3. **Separate verified from assumed, explicitly.** "By direct HTTP probe"
   or "read from source, not executed" — never make the reader guess
   which they are holding.
4. **Cite specifics.** file:line, a sha, an entry id. "Somewhere in the
   wizard" costs the next lane an hour.
5. **Say what you did NOT do**, and what is still open. Silence reads as
   coverage.
6. **Expand shorthand on first use.** Another lane does not share your
   context, and neither will you in a month.
7. **Plain language.** If a sentence needs re-reading to parse, rewrite it.

The bar the hub applies: an entry is done when a reader can act on every
claim in it without asking the author a question.

## Templates

| template               | board type | use for                                      |
| ---------------------- | ---------- | -------------------------------------------- |
| templates/finding.md   | finding    | a defect, measurement, answer, or verdict    |
| templates/contract.md  | contract   | a guarantee other lanes build against        |
| templates/blocker.md   | blocker    | work you cannot continue, and what clears it |
| templates/task.md      | task       | dispatching work a lane must act on later    |
| templates/run-report.md| finding    | a test-suite or load run, green or red       |

How to use one:

1. Copy the skeleton. The TITLE line goes into `--title`; the sections
   below it become the `--body`.
2. Fill every section. Keep every label, even for an empty section —
   write "none". A deleted label and an unchecked case look identical to
   the reader (rule 5).
3. Delete the `<!-- comments -->`; they are guidance for you, not content
   for the board.
4. Post with `node bin/board.mjs append --lane <you> --type <type> ...`
   as shown in each template's header. Board bodies are plain text — the
   CAPS section labels survive, markdown decoration does not.

EXAMPLE.md is templates/contract.md filled with a real entry
(contract_1f5a871e) and annotated with what makes it the exemplar. When
in doubt about tone or depth, match it.

The templates are the floor, not the ceiling: keep the sections, add
whatever else the reader needs (finding_e24f4931 adds a mutation-testing
narrative; it still answers every section).

## This repository is public

Everything under tests/docs/ is committed, so the disclosure rules in the
lane skill apply with no exceptions for "just a draft":

- No credentials, keys, machine-specific absolute paths, or internal
  credential identifiers — a name alone can identify an internal system.
- Reference material stays in the conversation. Take the *idea*, leave
  the *identity*: "a status dashboard for a multi-session workflow",
  never the product name.
- The pre-commit hook runs bin/scan-secrets.mjs on staged content, and
  `npm run test:board` runs it over every tracked file. It matches
  shapes, not confidentiality — that judgement stays yours. For a genuine
  false positive, append the `disclosure-ok` marker to the line; for
  org-specific terms, use .githooks/denylist.local.txt (gitignored,
  because the terms are themselves the sensitive thing).
