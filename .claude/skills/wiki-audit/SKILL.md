---
name: wiki-audit
description: Use to run the reading half of the wiki lint — contradictions between pages, stale claims, missing cross-references, data gaps. Run it when the weekly Wiki audit issue gets a new comment, or on demand. The machine-checkable half runs in CI and needs no model.
---

# Wiki audit — the reading pass

CI runs what a script can know for certain: links resolve, cited paths exist, no orphan pages, and
which pages the code has moved past. It runs no model, because this project's Claude Code is on a
subscription and there is no API key to put in a workflow.

This skill is the other half, and it needs a reading pass: whether the pages still agree with each
other and with the code.

## Start from the evidence, not from page one

```bash
python scripts/wiki-lint.py        # must be clean; fix anything it reports first
python scripts/wiki-staleness.py   # ranked: which pages the code has moved past
```

The staleness report is a priority order, not a verdict. A page listed with 20 commits behind it
is where to look; a page listed with 3 probably only needs a glance.

Audit **two or three pages properly** rather than skimming all of them. A skim that concludes
"looks fine" is how the last wiki stayed wrong for four months.

## What to look for

**Stale claims.** Anything that could have silently stopped being true:
- a **count** ("11 AI functions", "30 modules") — the most common and most damaging; the fix is to
  delete the number, not to update it, since the page should not state one;
- a file path that still exists but no longer does what the page says;
- a named function, table, column or env var;
- a "known gap" that has since been closed — a page listing a fixed bug as open is actively
  misleading and will cost someone an afternoon.

**Contradictions.** Two pages describing the same mechanism differently. Look hardest where a
subject was split: hub versus feature page, and sibling pages carved out of one bullet.

**Missing cross-references.** The lint catches a dead link but cannot see an absent one. Ask, for
each page: which other page would a reader have to find on their own? Pages that share a mechanism
(an id resolution, a shared util, a duplicated pure function) should name each other.

**Data gaps.** A subject with no page at all. Compare `docs/wiki/index.md` against what the repo
actually contains, and against what is still described in `CLAUDE.md` — everything left there is a
gap by definition.

## Fixing

Fix what you can confirm, in place. Verify against the code, never against memory or against another
page — two pages agreeing may just mean the same error was copied.

For anything you cannot confirm cheaply, write it into the audit issue rather than guessing. An
uncertain correction is worse than a flagged doubt.

## Recording

Append one line to `docs/wiki/log.md` under `## Lint passes`: the date, which pages you read, and
what you changed or flagged. This is what makes the next audit able to start where the last one
stopped, instead of re-reading from the top.

Then comment on the audit issue with what you fixed and what remains.

## The thing this exists to prevent

The previous wiki was written once, in May, and never read again. Nothing was wrong with the pages
on the day they were written. Four months later they claimed 11 AI functions where there were 18,
8 languages where there were 9, and 30 API modules where there were 48 — and an agent that read them
reported those numbers with confidence. A wiki nobody audits is not neutral; it is a source of
confident errors.
