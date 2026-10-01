---
name: add-help-section
description: Use when adding or editing a section in the help system — the in-app help (mobile Settings → Help) and the public help center are both generated from user_docs markdown. Covers the 9 locales, the three registrations a NEW section needs (scripts/generate-help-content.js, src/help/sections.ts, docs/marketing/help/build_help.py), and regenerating content.ts and the public site. NEVER edit apps/mobile/src/help/content.ts manually.
---

# Adding or Editing a Help Section

The in-app help screen is powered by auto-generated `apps/mobile/src/help/content.ts`, and the public help center at ai-budget.pl/help by `docs/marketing/help/build_help.py`. Both read the same `user_docs/<lang>/NN-slug.md` files. Editing `content.ts` directly is wasted work — the next `npm run generate:help` overwrites it.

## What to touch

| When | What to edit |
|---|---|
| Adding/editing content text | `user_docs/<lang>/NN-slug.md` for **all 9 locales** |
| Adding a new section (not editing) | Also `scripts/generate-help-content.js` `SECTIONS` array |
| Adding a new section (not editing) | Also `apps/mobile/src/help/sections.ts` |
| Adding a new section (not editing) | Also `docs/marketing/help/build_help.py` `SECTIONS` — without it the section is silently missing from the public help site |
| After any of the above | Regenerate (step 4) |

The route is `app/help/index.tsx` + `app/help/[id].tsx` — do NOT create a sibling `app/help.tsx`.

## Adding a NEW section — full workflow

### 1. Pick an `id` and `NN-slug`

The `id` is a kebab-case string used in the URL: `/help/<id>`. The `NN-slug` is the markdown filename — pick the next free `NN-` prefix consistent with existing files.

```bash
ls user_docs/en/
```

### 2. Create markdown for all 9 locales

Create `user_docs/<lang>/NN-slug.md` for each of: `en`, `de`, `es`, `fr`, `pl`, `ru`, `ua`, `be`, `nl`. Visible text uses each language's real orthography; only the slug is ASCII.

Each file follows the project's markdown conventions — look at a sibling file for the structure (title heading, intro paragraph, subsections).

### 3. Register the section

**`scripts/generate-help-content.js`** — append a new entry to the `SECTIONS` array. The entry maps the section `id` to the `NN-slug` filename so the generator knows where to read content from.

**`apps/mobile/src/help/sections.ts`** — append a matching entry so the help index screen renders the new section in the list (title, icon, ordering).

**`docs/marketing/help/build_help.py`** — append the section to its own `SECTIONS` list so the public help center builds a page for it.

### 4. Regenerate

From the project root:

```bash
npm run generate:help
python docs/marketing/help/build_help.py
LANDING_BASE= ROBOTS="index,follow,max-image-preview:large" python docs/marketing/landing/build_landing.py
```

The first writes `apps/mobile/src/help/content.ts`; the other two rebuild the public help pages and the landing's `llms-full*.txt`. Run the landing build with exactly those variables — the env-less default emits a `noindex` preview that would replace production. Commit the regenerated files; `docs/marketing/` is gitignored, so new generated pages need `git add -f`.

### 5. Verify

```bash
npm run typecheck
```

Then open the help screen in dev and confirm the new section appears in all 9 languages.

## Editing an EXISTING section

Just edit the `user_docs/<lang>/NN-slug.md` files (all 9 locales) and regenerate (step 4). No registration needed.

## Common mistakes

- Editing `apps/mobile/src/help/content.ts` directly. It is generated — your edits will be lost.
- Forgetting to update some locales (the help screen will show stale or missing content for those languages).
- Adding the section to `SECTIONS` in the generator but forgetting `sections.ts` — generator output is correct but the index screen doesn't link to it.
- Forgetting `build_help.py` — the app shows the section, the public help center does not.
- Creating `app/help.tsx` — the route is already handled by `app/help/index.tsx` and a sibling will conflict.
