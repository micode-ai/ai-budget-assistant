---
name: finish-aba-task
description: Use at the END of every coding task to create an ABA-{N} GitHub issue, ingest what was learned into the wiki, and update user docs. Required even for small or internal changes. Triggers when work is "done" — before stopping, before committing PRs.
---

# Finishing an ABA Task

When a coding task is complete (feature added, bug fixed, refactor done), you MUST do these, in
order:

1. Create a GitHub issue `ABA-{N}` describing what was done.
2. **Ingest into the wiki** — update or create the page(s) for the features you touched, and
   append one line to `docs/wiki/log.md`.
3. Update `CLAUDE.md` **only if a repo-wide rule changed** (see step 4 — it is the schema now, not
   the content store).
4. Update user docs (`user_docs/<lang>/NN-slug.md`) for all 9 locales — if the change is
   user-visible.

Skip only when the change has **zero** user-visible behavior. When in doubt, document.

## Critical Conventions

- **GitHub artifacts are always in English**, even if the chat is in another language. Issue
  titles, bodies, and commit messages must be English. Reply to the user in their language as usual.
- **N is the highest `ABA-N` in existing issue TITLES plus 1.** Use
  `gh issue list --state all --limit 400 --json title` — the bare `gh issue list` hides closed
  issues. Cross-check against recent commit subjects. The title has no colon after the number.
- **Never quote a user's real data** — merchant names, category names, amounts, emails — in an
  issue, a commit message, the wiki, or `CLAUDE.md`. Describe the shape of the data instead.
  A commit message cannot be corrected without rewriting pushed history.
- **Order matters**: code → issue → wiki → CLAUDE.md (if needed) → user docs → `npm run generate:help`.

## Checklist

Convert each step into a task with TaskCreate, then do them in order.

### 1. Find the next issue number

```bash
gh issue list --state all --limit 400 --json title -q '.[].title' | grep -oE '^ABA-[0-9]+' | sort -t- -k2 -n | tail -1
```

Add 1. Title format: `ABA-{N} <short imperative description>`.

### 2. Compose the issue body (English)

```markdown
## Problem
<what was broken or missing — 1-3 sentences, including how it was noticed>

## Implementation
<what changed, key files, key decisions — bullets are fine>

## Out of scope / Follow-ups
<anything noticed but not done — or "None">
```

Create it with `gh issue create --title "..." --body "$(cat <<'EOF' ... EOF)"`.

### 3. Ingest into the wiki

This is the step that keeps the repo's knowledge alive. `docs/wiki/` died once already because it
was written and never ingested into again.

Read [`docs/superpowers/specs/2026-09-22-llm-wiki-design.md`](../../../docs/superpowers/specs/2026-09-22-llm-wiki-design.md)
if you have not this session. Then:

1. **Find the page.** Start at `docs/wiki/index.md` → the hub for the area → the feature page.
2. **No page yet?** Create one at `docs/wiki/features/<slug>.md` using the template below, and add
   it to `index.md` under its hub.
3. **Still described in `CLAUDE.md`?** Move that bullet's content onto the page and leave a short
   pointer in its place — two or three sentences naming the page and carrying only the invariants
   worth seeing without opening it. This is how the migration progresses: one feature per task, by
   whoever touches it.
4. **Append one line to `docs/wiki/log.md`**: date, ABA link, what was learned, pages touched. One
   line. The detail belongs on the page, the reasoning in the issue.

Page template:

```markdown
# <Name>

## What this is
Two or three sentences. What problem it solves, for whom.

## Entry points
Files with paths. Where to start reading.

## Key concepts
How it works. The mechanism, not a tutorial.

## Invariants
What must not break, stated as a rule, with the reason.

## Known gaps
What is deliberately not done, and why.

## History
ABA links. Why it is this way.
```

Omit a section that is genuinely empty rather than writing "None" to fill the shape — an absent
section honestly reads as "not yet examined".

**Avoid stating a count** ("18 functions", "48 modules"). Counts go stale silently and are the
single most common way the old wiki lied. Name the list or point at the source instead.

### 4. Update CLAUDE.md — only for schema-level changes

`CLAUDE.md` is the **schema**: repo-wide rules, conventions, invariants belonging to no single
feature, environment variables, deploy and release procedure. Feature detail goes to the wiki.

Update it when you changed: a cross-cutting pattern (auth, account scoping, sync, offline-first),
the build/deploy/release procedure, environment variables, or a convention other tasks must follow.
Do NOT append a new feature description to it — that is what the wiki is for.

### 5. Update user docs (if user-visible)

- Edit `user_docs/<lang>/NN-slug.md` for **all 9 locales**: `en`, `de`, `es`, `fr`, `pl`, `ru`,
  `ua`, `be`, `nl`.
- Visible text uses each language's real orthography — only slugs are ASCII.
- Extending an existing section needs no registration. A **new** section must be registered in
  three places: `scripts/generate-help-content.js` SECTIONS, `src/help/sections.ts`, and
  `docs/marketing/help/build_help.py` SECTIONS. Missing the third silently omits it from the public
  help site.
- Then, from the project root:
  ```bash
  npm run generate:help
  python docs/marketing/help/build_help.py
  LANDING_BASE= ROBOTS="index,follow,max-image-preview:large" python docs/marketing/landing/build_landing.py
  ```
  NEVER edit `apps/mobile/src/help/content.ts` by hand. The env-less landing build produces a
  `noindex` preview that will clobber production.

## Common mistakes

- Writing the issue body in the user's chat language. It must be English.
- Appending a new feature's description to `CLAUDE.md` instead of creating a wiki page.
- Creating the wiki page but forgetting to link it from `index.md` — an orphan page is a page
  nobody finds.
- Leaving the old `CLAUDE.md` bullet in place alongside the new page, so the same subject is
  described twice and the two drift apart.
- Editing only `en` user docs and leaving the other 8 locales stale.
- Quoting a real user's merchant, category or amount as evidence.
