---
name: finish-aba-task
description: Use at the END of every coding task to create an ABA-{N} GitHub issue and update CLAUDE.md + user_docs/. Required even for small or internal changes. Triggers when work is "done" — before stopping, before committing PRs.
---

# Finishing an ABA Task

When a coding task is complete (feature added, bug fixed, refactor done), you MUST do three things — in order:

1. Create a GitHub issue `ABA-{N}` describing what was done.
2. Update technical docs (`CLAUDE.md` and any module-level docs).
3. Update user docs (`user_docs/<lang>/NN-slug.md`) for all 8 locales — if the change is user-visible.

Skip only when the change has **zero** user-visible behavior. When in doubt, document.

## Critical Conventions

- **GitHub artifacts are always in English**, even if the chat is in another language. Issue titles, bodies, and commit messages must be English. Reply to the user in their language as usual.
- **N is the latest existing issue number + 1**, not "the next ABA number". Get the latest with `gh issue list --limit 1 --state all --json number,title`.
- **Order matters**: code → issue → tech docs → user docs → `npm run generate:help`.

## Checklist

Convert each step into a task with TaskCreate, then do them in order.

### 1. Find the next issue number

```bash
gh issue list --limit 1 --state all --json number,title
```

Take the `number` from the result and add 1. That's your N. Title format: `ABA-{N}: <short imperative description>`.

### 2. Compose the issue body (English)

Structure:

```markdown
## Problem
<what was broken or missing — 1-3 sentences>

## Implementation
<what changed, key files, key decisions — bullets are fine>

## Out of scope / Follow-ups
<anything noticed but not done — or "None" if nothing>
```

### 3. Create the issue

```bash
gh issue create --title "ABA-{N}: ..." --body "$(cat <<'EOF'
... body here ...
EOF
)"
```

### 4. Update technical docs

Update `CLAUDE.md` at the project root if any of these changed:
- A module's purpose, file layout, or public API surface
- A pattern (auth, account scoping, sync, offline-first)
- Environment variables, deploy commands, observability hooks
- A directory or file that the CLAUDE.md references by path

Also update any module-level `CLAUDE.md` or `docs/` markdown that touches the changed area. Do NOT add tutorial-style prose — keep CLAUDE.md a terse pattern reference.

### 5. Update user docs (if user-visible)

For each user-visible behavior change:
- Edit `user_docs/<lang>/NN-slug.md` for all 8 locales: `en`, `de`, `es`, `fr`, `pl`, `ru`, `ua`, `be`.
- New section? Pick the next free `NN-` prefix consistent with the existing numbering.
- After editing, run from the project root:
  ```bash
  npm run generate:help
  ```
  This regenerates `apps/mobile/src/help/content.ts`. NEVER edit that file by hand.

If you added a new help section (not just edited existing ones), also follow the `add-help-section` skill — there are extra files to update (`scripts/generate-help-content.js` SECTIONS array and `src/help/sections.ts`).

## Common mistakes

- Writing the issue body in the user's chat language. It must be English.
- Forgetting to add 1 to the latest issue number (so the new issue collides or skips).
- Editing only `en.ts` user docs and leaving the other 7 locales stale.
- Editing `apps/mobile/src/help/content.ts` directly instead of regenerating.
- Skipping CLAUDE.md updates for "small" pattern changes — internal refactors that change patterns still need a CLAUDE.md update.
