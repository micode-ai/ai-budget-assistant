# Help content pipeline

*Hub: [mobile-app](../mobile-app.md)*

## What this is

One set of markdown files, `user_docs/<lang>/NN-slug.md`, feeds two consumers: the in-app help
screen and the public help center at `ai-budget.pl/help`. Neither is written by hand — both are
generated, and the generated artifacts are committed.

## Entry points

- `user_docs/<lang>/NN-slug.md` — the source, nine languages
- `scripts/generate-help-content.js` — builds the in-app bundle; its `SECTIONS` array
- `apps/mobile/src/help/sections.ts` — the in-app section registry
- `apps/mobile/src/help/content.ts` — **generated**; never edit
- `apps/mobile/app/help/index.tsx`, `app/help/[id].tsx` — the in-app screens
- `docs/marketing/help/build_help.py` — builds the public site; its own `SECTIONS` list

## Key concepts

**Two generators, one source.** `npm run generate:help` produces the in-app `content.ts`;
`python docs/marketing/help/build_help.py` produces the public pages. The public build imports
`build_blog` and reuses its chrome, so help pages inherit the blog's header, footer, CSS and
language switcher for free.

**Public help center shape.** Pages live at `/help/<lang>/<slug>/` with a per-language index and a
`noindex` JS dispatcher at `/help/`. The slug is identical across languages, so hreflang pairs by
slug. Thin pages (under ~250 words) are emitted `noindex, follow` and dropped from the help sitemap.
Cross-document links written as `./NN-slug.md` become real `/help/<lang>/<slug>/` links.

**Extending an existing section needs no registration at all** — edit its nine markdown files and
re-run both generators. The registration dance below applies only to a brand-new section.
Mistaking the two is how a feature ships with no user documentation at all.

## Invariants

**Never edit `apps/mobile/src/help/content.ts` by hand.** It is overwritten on every
`npm run generate:help`.

**A NEW section must be registered in THREE places**, not two:
1. `scripts/generate-help-content.js` `SECTIONS`
2. `apps/mobile/src/help/sections.ts`
3. `docs/marketing/help/build_help.py`'s own hardcoded `SECTIONS`

Missing the third silently omits the section from the public site while the app shows it — that is
how `38-shopping-list` drifted out of sync until it was backfilled much later.

**Do not create `app/help.tsx`.** The route is served by `app/help/index.tsx`; a sibling file
shadows it.

**Edit all nine locales.** `en`, `de`, `es`, `fr`, `pl`, `ru`, `ua`, `be`, `nl`. Visible text uses
each language's real orthography — only slugs are ASCII. Nine German articles once shipped with
ASCII transliterations (`fuer`, `groesste`) in exactly the two fields Google renders.

**Re-run the landing build with its production environment after touching help**, because the apex
sitemap merges the help URLs:

```bash
npm run generate:help
python docs/marketing/help/build_help.py
LANDING_BASE= ROBOTS="index,follow,max-image-preview:large" python docs/marketing/landing/build_landing.py
```

The env-less default builds a `noindex` preview that will silently overwrite the committed
production site with the wrong robots directive and base path.

**`docs/marketing` is gitignored.** A newly generated file needs `git add -f` or it 404s in
production while looking fine locally.

**CSS is inlined per page**, so editing it re-touches every committed HTML file on regenerate —
expect a large, boring diff and check it is only that.

## Known gaps

- The three `SECTIONS` lists are parallel arrays that must be kept in sync by hand; nothing checks
  them against each other.
- Regenerating the public site picks up any markdown committed since the last build, so a help
  commit can carry unrelated content that was never rebuilt. Worth saying so in the commit message.

## History

ABA-284 (the public help center) · ABA-288 (mobile rendering: portrait screenshots overflow without
the shared `article img` constraint) · ABA-342 (help↔blog internal linking, real `lastmod` dates) ·
ABA-366 (PageSpeed and contrast pass).
