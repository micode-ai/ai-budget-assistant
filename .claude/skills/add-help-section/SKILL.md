---
name: add-help-section
description: Use when adding or editing a section in the in-app help system (mobile Settings → Help). Coordinates 3 places — user_docs markdown, scripts/generate-help-content.js SECTIONS, and src/help/sections.ts — then regenerates content.ts. NEVER edit apps/mobile/src/help/content.ts manually.
---

# Adding or Editing a Help Section

The in-app help screen is powered by auto-generated `apps/mobile/src/help/content.ts`. Editing that file directly is wasted work — the next `npm run generate:help` overwrites it.

## The three places to touch

| When | What to edit |
|---|---|
| Adding/editing content text | `user_docs/<lang>/NN-slug.md` for **all 8 locales** |
| Adding a new section (not editing) | Also `scripts/generate-help-content.js` `SECTIONS` array |
| Adding a new section (not editing) | Also `apps/mobile/src/help/sections.ts` |
| After any of the above | Run `npm run generate:help` from the project root |

The route is `app/help/index.tsx` + `app/help/[id].tsx` — do NOT create a sibling `app/help.tsx`.

## Adding a NEW section — full workflow

### 1. Pick an `id` and `NN-slug`

The `id` is a kebab-case string used in the URL: `/help/<id>`. The `NN-slug` is the markdown filename — pick the next free `NN-` prefix consistent with existing files.

```bash
ls user_docs/en/
```

### 2. Create markdown for all 8 locales

Create `user_docs/<lang>/NN-slug.md` for each of: `en`, `de`, `es`, `fr`, `pl`, `ru`, `ua`, `be`.

Each file follows the project's markdown conventions — look at a sibling file for the structure (title heading, intro paragraph, subsections).

### 3. Register the section

**`scripts/generate-help-content.js`** — append a new entry to the `SECTIONS` array. The entry maps the section `id` to the `NN-slug` filename so the generator knows where to read content from.

**`apps/mobile/src/help/sections.ts`** — append a matching entry so the help index screen renders the new section in the list (title, icon, ordering).

### 4. Regenerate

```bash
npm run generate:help
```

This reads all `user_docs/<lang>/*.md` files and writes `apps/mobile/src/help/content.ts`. Commit the regenerated file.

### 5. Verify

```bash
npm run typecheck
```

Then open the help screen in dev and confirm the new section appears in all 8 languages.

## Editing an EXISTING section

Just edit the `user_docs/<lang>/NN-slug.md` files (all 8 locales) and run `npm run generate:help`. No code changes needed.

## Common mistakes

- Editing `apps/mobile/src/help/content.ts` directly. It is generated — your edits will be lost.
- Forgetting to update some locales (the help screen will show stale or missing content for those languages).
- Adding the section to `SECTIONS` in the generator but forgetting `sections.ts` — generator output is correct but the index screen doesn't link to it.
- Creating `app/help.tsx` — the route is already handled by `app/help/index.tsx` and a sibling will conflict.
