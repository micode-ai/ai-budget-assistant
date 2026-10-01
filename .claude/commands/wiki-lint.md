---
description: Check docs/wiki/ for staleness — pages referencing files that no longer exist.
---

You are running inside Claude Code, spawned by the AI Dreaming Center
(weekly lint job) to keep `docs/wiki/` in sync with the actual repository.

## What you have

- `cwd` is the project repository root.
- Wiki dir: `docs/wiki/` — maintained by ingest (the `finish-aba-task` skill), indexed by
  `docs/wiki/index.md`, with feature pages under `docs/wiki/features/`. Its log is
  `docs/wiki/log.md`.
- Env vars: `LEARNING_SESSION_ID`, `DREAMING_API_URL`, `DREAMING_PROJECT_SLUG`.

## What to do

1. **Run the machine checks** — they are the source of truth for broken links, cited paths that
   no longer exist, and orphan pages:
   ```bash
   python scripts/wiki-lint.py
   python scripts/wiki-staleness.py
   ```

2. **Fix what you can confirm, in place.** For each finding, read the page and the code it cites.
   A renamed or moved file: update the reference. A claim the code now contradicts: rewrite it to
   the current fact. Do not add banners or "stale" notes to pages — a page is either corrected or
   its doubt is recorded in step 3.

3. **Record what you could not confirm** — a domain that seems gone, a claim you cannot settle
   from the code — as a short list in your report (step 5), so a person decides. If a whole
   domain is gone, rename its page to `_archived-{name}.md` rather than deleting it.

4. **Log the pass**: append one line under `## Lint passes` in `docs/wiki/log.md` — the date,
   what was checked, what was fixed, what is still open. Re-run `python scripts/wiki-lint.py`
   and confirm it reports no findings you introduced.

5. **Report back:**

   ```bash
   curl -s -X POST "$DREAMING_API_URL/api/session/finish" \
     -H "Content-Type: application/json" \
     -d "{\"session_id\":\"$LEARNING_SESSION_ID\",\"status\":\"success\",\"note_path\":\"docs/wiki/log.md\"}"
   ```

## Rules

- Do **not** delete wiki files outright — rename to `_archived-*.md`.
- Do **not** edit files outside `docs/wiki/`.
- Don't re-do a `/wiki-bootstrap` — that's a separate command.
- The reading half of the audit (contradictions between pages, stale claims) is the `wiki-audit`
  skill; this command is the mechanical pass.
