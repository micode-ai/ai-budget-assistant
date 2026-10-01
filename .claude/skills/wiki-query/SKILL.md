---
name: wiki-query
description: Use when investigating how something works, diagnosing a reported bug, or answering a question about this codebase. Read the wiki before the code, answer with citations, and file a finding back as a page when the investigation cost real effort — even if no code changed.
---

# Answering from the wiki, and filing back what you learn

The wiki accumulates only if answers go into it, not just changes. `finish-aba-task` covers the
second; this covers the first.

Without it the pattern is half-built: a session that spends an hour proving *why* something behaves
as it does, and then changes nothing, leaves no trace — and the next session pays the hour again.

## Before you read code

1. Open `docs/wiki/index.md`, then the hub for the area, then the feature page.
2. `grep -ri "<term>" docs/wiki/` for a cross-cutting term (an invariant often lives on a page you
   would not have guessed — id resolution, for instance, is its own page, not a section of five
   feature pages).
3. `CLAUDE.md` still holds anything not yet migrated. If the answer was there, that subject is a
   migration candidate — see step 4 of the filing rules below.

Read the code to **confirm** what a page claims, not instead of reading the page. A page can be
stale; that is what the audit is for. But starting from the page tells you what to confirm.

## Answering

**Cite the page you used**, by path. An answer with no citation is indistinguishable from one
invented on the spot, and the person reading it cannot check or improve the source.

**Say when the wiki was wrong.** If the page disagreed with the code, that is a finding in itself —
fix the page in the same breath, and note it in the log. A page that is silently worked around is
worse than one that is missing.

## When to file the answer back

File it when **any** of these is true:

- the investigation took more than a handful of steps;
- the conclusion is surprising, or contradicts what the code looks like it does;
- you ruled something out — "it is NOT X, because Y" is expensive to re-derive and almost never
  written down;
- a user reported it, whether or not it turned out to be a bug;
- you found yourself reconstructing something from `git log` or a commit message.

Do **not** file: a one-line lookup, a question the page already answered, or a restatement of the
code. Those add pages nobody reads and dilute the index.

## How to file

1. **Extend an existing page** where the finding belongs — usually as an `Invariants` or
   `Known gaps` entry. Prefer this to a new page; a new page for every finding produces a wiki with
   no shape.
2. **A new page** when the subject is genuinely its own thing and would be buried anywhere else.
   Use the template in `finish-aba-task`, and link it from `index.md` under its hub.
3. **Add the cross-reference** from any page a reader would have started at. The whole reason a
   finding was expensive is usually that it sat between two subjects.
4. **If the answer came from `CLAUDE.md`**, move that subject to a page now — you have just proved
   somebody needs it, and you already have it loaded.
5. **Append one line to `docs/wiki/log.md`** under `## Queries`, with the date, the question in a
   few words, and the page you touched. One line.

## Then verify

```bash
python scripts/wiki-lint.py
```

A new page that nothing links to is an orphan, and the lint says so.

## Worth knowing

A diagnosis that ends in "everything is working correctly" is worth filing more than one that ends
in a fix — the fix leaves a commit and an issue behind it, the clean bill of health leaves nothing
at all, and it is exactly what the next person will re-investigate.
