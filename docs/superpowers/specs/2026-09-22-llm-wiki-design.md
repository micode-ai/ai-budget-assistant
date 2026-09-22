# LLM wiki — design

*2026-09-22. Applies the LLM-wiki pattern ([karpathy gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)) to this repo.*

## The problem

`CLAUDE.md` is 77 100 words (~104k tokens, 187 top-level bullets, the largest 4 629 words)
and loads whole into every session. It is accurate — the `finish-aba-task` ritual appends to
it after every task — but it is the wrong shape: an agent pays ~104k tokens before starting,
and finding one fact means grepping a file with no navigation.

`docs/wiki/` already holds 15 pages in a good shape, but it was bootstrapped in May and never
ingested into again. It now states "11 AI functions" (there are 18), "8 languages" (9) and
"30 modules" (48). A wiki that is stale is worse than none: an agent reads it and reports the
wrong number with confidence. `wiki-health-trends.md` holds exactly one datapoint, 2026-05-14.

The failure was not the artifact. It was the absence of a loop.

## Decisions

**1. `CLAUDE.md` becomes the schema, not the content.** It keeps repo-wide rules, conventions,
invariants that belong to no single feature, and the index pointer. Everything factual about a
feature moves to a wiki page. One source of truth — a wiki *beside* a living CLAUDE.md is
exactly how `docs/wiki/` died.

**2. Migration is incremental, never a big-bang pass.** A task that touches feature X moves
X's bullet out of `CLAUDE.md` into its page as part of that task. Re-homing 77k words in one
sitting is a mechanical job with a high chance of dropping nuance, and nuance is the whole
value here.

**3. Two levels: domain hubs, feature pages.** The 15 existing pages become hubs — what the
domain is, its entry points, and links to the feature pages under it. Feature pages carry the
detail. Granularity matches how work arrives: one ABA issue is usually one feature, so a task
always has an obvious target page.

**4. Pages live under `docs/wiki/`.** Hubs at the root (existing filenames kept — they are
already linked from elsewhere), feature pages in `docs/wiki/features/`.

## Page template

```markdown
# <Name>

## What this is
Two or three sentences. What problem it solves, for whom.

## Entry points
Files with paths. Where to start reading.

## Key concepts
How it works. The mechanism, not a tutorial.

## Invariants
What must not break, stated as a rule, with the reason. This is the section
people open the page for.

## Known gaps
What is deliberately not done, and why. Prevents re-deciding.

## History
ABA links. Why it is this way.
```

`Invariants` is the section `docs/wiki/` lacked and `CLAUDE.md` is full of ("do not re-add a
per-route `updateLastSync` call", "resolve the server PK before using an id as a foreign key").
Today those sentences are buried inside 4 000-word bullets and reachable only by grep.

Sections may be omitted when genuinely empty. Do not write "None" under `Known gaps` to fill
the shape — an absent section reads as "not yet examined", which is honest.

## The loop

**Ingest** — `finish-aba-task` changes from "append to CLAUDE.md" to: update the wiki page(s)
for the features touched, create the page if the feature is new, move that feature's bullet out
of `CLAUDE.md` if it is still there, and append one line to `log.md`.

**Query** — an agent reads `index.md` → hub → feature page. `CLAUDE.md` stays short enough to
carry in every session.

**Lint** — two tiers:
- A weekly agent compares the wiki against the code and files an issue listing divergences.
- A cheap script (no LLM) checks what is machine-checkable: that every file path a page cites
  exists, and that every wiki link resolves. Numbers are deliberately NOT asserted by script —
  a page should avoid stating a count in the first place (`CLAUDE.md` already carries "the list
  is the count — do not restate it as a numeral", which has been wrong at 44, 45 and 47).

## `index.md` and `log.md`

`index.md` is a catalog with a one-line summary per page, grouped by domain — not a bare table
of filenames like today's `README.md`.

`log.md` is append-only, one line per task: date, ABA link, what was learned or changed. Its
value is as a search target ("did we look at this before?"), so it stays one line — a log that
retells the work becomes a second wiki nobody reads.

## Costs, accepted

- Every task costs a page update. That tax is already paid into `CLAUDE.md` today, so the
  increment is small, but it is not zero.
- During migration, knowledge lives in two places. Mitigated by there being exactly one old
  place, which shrinks with every task.
- More files means more cross-references to keep honest. Maintaining them is the LLM's job —
  that is the pattern's premise, not a side effect.

## Not doing

- No CI gate that fails a build when a touched module's page did not change. Not every code
  change alters knowledge, and a gate that cries wolf gets bypassed.
- No RAG, embeddings or vector store. The wiki is read by path, the way an agent reads code.
- No implementation plan document. The work is incremental by construction and rides
  `finish-aba-task`.
