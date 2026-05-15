---
title: 'Help Content Regeneration'
status: running
iterations: 0
---

# Help Content Regeneration

## Trigger
Manual — any time a developer adds, edits, or removes a section in the in-app help system. Must be run before committing help changes.

## Steps
1. Write or edit markdown source files in `user_docs/<lang>/NN-slug.md` for all 8 languages (en, de, es, fr, pl, ru, ua, be).
2. Add the section `id` to `scripts/generate-help-content.js` `SECTIONS` array and to `apps/mobile/src/help/sections.ts`.
3. Run `npm run generate:help` from the project root — invokes `scripts/generate-help-content.js`.
4. Script reads all locale markdown files and writes `apps/mobile/src/help/content.ts` (auto-generated, never edit manually).
5. Commit both the markdown sources and the regenerated `content.ts`.

## Failure modes
- **Missing locale file** — script errors or produces incomplete content; create the missing `user_docs/<lang>/NN-slug.md` and re-run.
- **Section id mismatch** — id in `SECTIONS` array doesn't match `sections.ts`; align them and re-run.
- **`content.ts` manually edited** — the next `generate:help` run will overwrite edits silently. Always edit markdown sources, never `content.ts`.
- **Help screen shows old content** — Metro bundler cache; restart with `npx expo start --clear`.

## Owner
Mihail Perevertkin (triggered per help-content change)

## Where to look first when it breaks
- `scripts/generate-help-content.js` — generation logic and SECTIONS list
- `apps/mobile/src/help/sections.ts` — section id registry
- `user_docs/` — markdown sources for all 8 locales
