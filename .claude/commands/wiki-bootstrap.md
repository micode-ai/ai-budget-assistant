---
description: Generate domain wiki pages by scanning the repository structure.
---

You are running inside Claude Code, spawned by the AI Dreaming Center to
populate this project's wiki (`docs/wiki/`) with one Markdown page per
"domain" (subsystem, package, top-level feature).

## What you have

- `cwd` is the project repository root.
- Target directory: `docs/wiki/` (already exists — Dreaming Center created it).
- Env vars from DC:
  - `LEARNING_SESSION_ID` — session id to mark complete at the end.
  - `DREAMING_API_URL` — base URL (typically `http://localhost:8086`).
  - `DREAMING_PROJECT_SLUG` — slug of the project being bootstrapped.

## What to do

This wiki already exists and is maintained by ingest (the `finish-aba-task` skill): an index at
`docs/wiki/index.md` with a hub per domain, feature pages under `docs/wiki/features/`, and a log
at `docs/wiki/log.md`. Bootstrapping here means filling gaps, never starting over.

1. **Read `docs/wiki/index.md`** and list what it already covers.

2. **Find domains it does not cover.** Sample the repo for subsystems a new contributor would
   learn separately — `apps/`, `packages/`, `apps/api/src/modules/`, the workspace manifests,
   `CLAUDE.md` (bullets still holding a full feature description, with no "Moved to the wiki"
   pointer, are the usual candidates). Add only domains that are genuinely missing; the number is
   whatever the gap is.

3. **Write each as `docs/wiki/features/<slug>.md`** with the page template in
   `.claude/skills/finish-aba-task/SKILL.md` (What this is, Entry points, Key concepts,
   **Invariants**, Known gaps, History). Be specific to this repo — real filenames and
   identifiers — and omit a section you cannot fill rather than padding it.

4. **Link every new page from `docs/wiki/index.md`** under its hub, append one line per page to
   `docs/wiki/log.md`, and run `python scripts/wiki-lint.py` — a page nothing links to is an
   orphan. Never write `docs/wiki/README.md`; it is a pointer to `index.md`.

5. **Report back** to the Dreaming Center:

   ```bash
   curl -s -X POST "$DREAMING_API_URL/api/session/finish" \
     -H "Content-Type: application/json" \
     -d "{\"session_id\":\"$LEARNING_SESSION_ID\",\"status\":\"success\",\"note_path\":\"docs/wiki/index.md\"}"
   ```

   On error, send `"status":"failed"` with an `"error_message"`.

## Rules

- Do **not** edit files outside `docs/wiki/`.
- Do **not** run installs, migrations, or anything destructive.
- Don't overwrite or restructure existing pages — they are maintained by ingest.
