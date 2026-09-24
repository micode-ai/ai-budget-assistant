# Marketing site generators

*Hub: [mobile-app](../mobile-app.md) · content source: [help-content-pipeline](help-content-pipeline.md)*

## What this is

`ai-budget.pl` is three static sites built by three Python generators and committed to the repo:
the landing pages, the SEO blog, and the help center. They share one chrome, one language set and
one sitemap.

## Entry points

- `docs/marketing/landing/build_landing.py` — landing, pricing, legal, `404.html`, the apex
  sitemap, `robots.txt`, `llms*.txt`
- `docs/marketing/seo/build_blog.py` — the blog; also owns the shared header/footer/CSS that the
  help generator imports
- `docs/marketing/seo/build_pillar_links.py` — regenerates each pillar's "related guides" block
- `docs/marketing/help/build_help.py` — the help center
- Sources: `docs/marketing/seo/<lang>/*.md`, `user_docs/<lang>/*.md`

## Key concepts

**Nine languages, one slug per topic.** `en`, `pl`, `de`, `es`, `fr`, `ru`, `ua`, `be`, `nl`.
Articles pair across languages by a frontmatter `pair` key, which must be identical in all nine
files or hreflang breaks. Slugs are localized and ASCII-transliterated per language; `en` is
`x-default`.

**The blog owns the chrome.** `build_help.py` imports `build_blog` rather than copying its header,
footer and CSS, so help pages inherit the language switcher and styling for free. CSS is inlined
per page, so a style change re-touches every committed HTML file.

**Language must survive a cross-site hop.** The landing's Blog link points at `/blog/<lang>/` for
all nine languages, and the blog's brand and breadcrumb link back to the language-matched landing
via `home_url(lang)`. Do not hardcode `/` or an `en`/`pl`-only blog link in either generator.

## Invariants

**Regenerate the landing with its production environment**, or the committed production site is
overwritten with a `noindex` preview build:

```bash
LANDING_BASE= ROBOTS="index,follow,max-image-preview:large" python docs/marketing/landing/build_landing.py
```

**Run `build_pillar_links.py` after adding a topic.** Pillar down-links are generated, never
hand-written; a new topic that is missing from `CLUSTERS` gets neither an index chip nor an inbound
pillar link. It is idempotent — re-running replaces the block rather than duplicating it.

**Internal links are absolute `/blog/<lang>/<slug>/`.** Three Polish pillars once cross-linked with
relative paths built from old numbered slugs, so all six inter-pillar links 404'd on the primary
market. A relative sibling link in built HTML is the signature of that bug.

**Only slugs are ASCII; visible text uses real orthography.** Nine German articles shipped with
transliterations (`fuer`, `kuendigst`, `groesste`) in `title` and `meta_description` — exactly the
two fields Google renders — apparently by copying the slug convention into the copy.

**Measure a `meta_description` after decoding HTML entities.** `&#x27;` is six raw characters and
one real one, so a raw-length check reports false positives on French copy.

**A `date` in frontmatter is required and is the publication date**, never derived from git.
`git_date()` is the *last-commit* date, so an edit would promote an old article to the top of the
index and rewrite its `datePublished`.

**The pricing page's structured data is a `SoftwareApplication`, never a `Product`.** Three bare
`Product` nodes put all nine pricing pages into merchant-listings validation — a spec written for
shippable goods — producing permanent errors (`image`, `shippingDetails`, `hasMerchantReturnPolicy`)
that cannot be answered by an app. Do not reintroduce `Product` or invent shipping fields to
silence a warning.

**`docs/marketing` is gitignored**: a new asset needs `git add -f`, and `web-deploy.yml` ships the
committed `site/` trees without ever running these generators. Forgetting either means the change
exists locally and nowhere else.

**A title change cascades.** Article titles are quoted verbatim in the generated pillar down-links
and in the landing's "From the blog" section, so correcting one means re-running
`build_pillar_links.py` and the landing build.

## Measured results

The ABA-435 check (2026-09-24, 28 days after vs 28 before): site 37→55 clicks, 3.09K→5.79K
impressions, position 24.8→17.0. Retitling a competing article to an informational question
**worked** — on the FR query the landing rose 34.9→26.0 and the article fell to 96.6. Adding
vocabulary to one of two competing articles **did not** — the NL pair still splits the query at
78–94. `/en/` rose 23.4→10.0. Rank without clicks is now the problem: `/fr/` took 500 impressions
and no clicks, "ai budget" sits at 5.7 with none (ABA-584).

The 2026-09-24 index audit found nothing broken: `noindex` is the app, admin and the `/blog/`
language stub; the 404s are pre-rename slugs; 36 of the 40 "Discovered — not indexed" were four
days old. The same rank-without-clicks pattern held for the app-migration article (all nine
versions at 5–7.5, zero clicks), retitled around "Monefy alternative" rather than joined by a new
"alternatives" page, which would have competed with it.

## Known gaps

- The three generators keep parallel notions of the language list and of which topics exist;
  nothing cross-checks them.
- `sameAs` still lacks LinkedIn and Crunchbase. The Organization and the app carry separate
  profile lists (`ORG_SAMEAS` / `APP_SAMEAS`, duplicated in the landing and blog generators),
  each ending in its Wikidata item: MiCode Sp. z o.o. is Q141551004, the app Q141551014 (created
  2026-09-24; not to be confused with Q110126846 "Micode", a French YouTuber). Wikidata may still
  delete the app item as non-notable — press coverage as "described at URL" is what keeps it. mi-code.pl spells the company
  "MiCode Sp. z o.o." and has no `@id`, so the two sites still meet only through `alternateName`
  and the shared URL.
- Below-fold lightbox images are not served as WebP/AVIF.

## History

ABA-267 (the blog) · ABA-269 (landing at the apex) · ABA-280 (cross-site language preservation) ·
ABA-281 (internal linking, index schema) · ABA-320 (pricing driven from one JSON) · ABA-393/394/395
(waves, index listing, orthography) · ABA-397 (`SoftwareApplication`) · ABA-435 (in-body links
pointed at the Polish homepage for every language) · ABA-571/572 (diacritics, meta budgets) ·
ABA-574 (wave 5) · ABA-584 (the ABA-435 re-measure, FR snippet).
