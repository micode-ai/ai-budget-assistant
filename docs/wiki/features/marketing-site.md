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

**On iOS the landing must not send people to Google Play (ABA-645).** `track_html()` appends
`IOS_HTML`, a small script (text in `IOS_TEXT`, 9 languages) that runs only on an iPhone/iPad not
already standalone: it hides the Google Play `.btn` buttons, repoints inline Play links to
`app.ai-budget.pl/?src=landing&loc=ios&lang=<lang>` labelled with that domain, and shows a fixed
dismissible bar (`localStorage` `ios-bar-off`) explaining Add to Home Screen. Desktop and Android
render unchanged. The `loc=ios` tag makes those arrivals separable in acquisition data
(`features/acquisition-tracking.md`).

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

**`llms.txt` and `featureList` state product facts that answer engines repeat verbatim (ABA-638).**
They had drifted badly — a model name, a missing currency, six of nine bank parsers, end-to-end
encryption presented as the default — in all nine languages at once, because they were three
hand-written copies. Since ABA-674 there is one English list, `FEATURES_EN` in `build_landing.py`:
`llms.txt` renders it and `featureList` is it plus two product facts. Each `LLMS_TXT_I18N[lang]
["features"]` translates it item for item, and `check_feature_lists()` stops the build when a
translation's length differs — so a new feature goes in at the same index in all nine lists. The
check keeps the lists in step; it cannot see a translation that says something else. Check a
claim against the wiki before adding it, and never list a feature that is flag-gated off in
production (receipt price-check alerts, Community Price Map). Do not name the AI model; it goes
stale.

**The company is "MiCode Sp. z o.o." everywhere we generate (ABA-674)** — `COMPANY` in both the
landing and blog generators, matching mi-code.pl and Wikidata Q141551004; "MICODE sp. z o.o." is
kept in `alternateName`. Answer engines join mentions of an entity by name, so a second spelling
splits it. The privacy/terms texts and the cookie policy's data-controller line are legal
documents and were deliberately not changed.

**Tier claims in articles are checked against the code, not against other articles (ABA-675).**
Articles 14 and 29 both presented shared family accounts as free, and 29 put Financial Wrapped
behind the paid plan — both wrong. What a tier includes lives in `subscriptions.service.ts`
(`TRIAL_REQUEST_LIMITS`, `MEMBER_LIMITS`, the 7-day `trial_period_days`), `AccountLimitGuard`,
the `@RequireTier` routes and `user_docs/<lang>/12-subscription.md`; copy that repeats an older
article repeats its mistakes.

**Articles have a named author.** `AUTHOR`/`author_node()` in `build_blog.py` is one `Person` with
the stable `@id` `/#author`, referenced by every article's `author`; the about page (in
`build_landing.py`) is where the node is described and carries `id="author"` for the byline link.
Help pages keep the Organization as author — they are product documentation.

**Each article renders its own share card** (`/blog/<lang>/<slug>/og.jpg`, the headline set by
`build_og(..., title)`); the per-language `og-default.png` is only for indexes.

**Calculators live inside the article that ranks for the topic**, placed by a
`<!-- calculator:503020 -->` / `<!-- calculator:emergency -->` line and rendered by `calc_html` —
never as a separate `/tools/` page competing for the same query.

**Lightbox screenshots ship as WebP with a PNG fallback (ABA-672).** `copy_assets()` writes both
from the same 540px resize, and the lightbox wraps the `<img>` in `<picture>`; `.lb picture` is
`display:contents` so the flex lightbox lays out as before. The image sitemap and the
`SoftwareApplication.screenshot` URLs keep citing the PNG — do not drop the PNG to save space.

**Hand-made downloads live in `docs/marketing/seo/assets/<lang>/`**, because `site/` is wiped on
every build; `build_blog.py` copies them in. The Excel template is written by
`build_excel_template.py`, run by hand — an `.xlsx` is a zip with timestamps, so regenerating it
per build would commit a changed binary every time.

**Help snippets are fitted by the generator, not by editing `user_docs` (ABA-676).** The `> ` lead
line is both the meta description and the in-app section intro, so `meta_snippet()` keeps whole
sentences up to 155 characters and `page_title()` drops the brand suffix when it would push a
title past 60. Shortening the lead line itself would change the app.

**Help pages get FAQPage from question-shaped headings too** (`help_faq` in `build_help.py`), since
help is written as task guides and its questions sit in headings, not in a bold FAQ block.

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

The 2026-10-15 page-indexing report: 670 indexed, 104 not — 42 "Discovered" are the newest
article waves, "Crawled" is mostly admin fonts, the 8 404s are legacy URLs (old numbered Polish
slugs, `.html` legal pages). Nothing broken.

The 2026-10-14 snapshot (28 days to 2026-10-12): 32 clicks, 3.3K impressions, CTR 1%, position 18 —
**lower than the September window**, and the clicks still come mostly from Poland. Two pages draw
impressions from B2B intent we cannot serve: `/fr/` from "logiciel d'analyse des dépenses avec IA"
(company spend-analytics software) and the NL bank-import article from accountants importing into
Twinfield / Exact Online. Most impressions on the top-10 pages are anonymised long-tail queries,
so a retitle there targets general appeal rather than one query. ABA-673 rewrote the snippets of
twelve top-10, zero-click pages and records their baseline in the issue; re-measure the same
twelve around 2026-11-12, and leave them unchanged until then so the result is readable.

The 2026-10-22 re-measure of the ABA-584 rewrites (28 days to 2026-10-20, ABA-685): site 26 clicks,
3.14K impressions, position 26.9 — the third falling window in a row. **None of the September
snippet rewrites moved CTR.** `/fr/` fell 29.2→43.1 (500→232 impressions); "ai budget" sits at 9.5
with no clicks; the three 09-27 snippet rewrites (pl split-bill, ru split-bill, en receipt-scanner)
still have no clicks while their impressions fell by two thirds to seven eighths at about the same
position — so the loss is demand or SERP-level, not the snippet. The EN blog drop of 2026-09-18 did
**not** recover: 124 impressions in 9 days against 282 in the drop window and 562 before it, and
import-bank-statement lost its ranking (7.8→37.2). The one positive: the Monefy migration article,
retitled "Monefy alternative", earned its first two clicks (113 impressions, position 7.0). Lesson:
at this traffic, a snippet rewrite on its own is not a lever; check intent and ranking first.

The ABA-686 diagnosis (2026-10-23) of that decline: **site-wide and ranking-level, not technical** —
pages indexed, canonicals and robots correct, no manual action. Site impressions peaked at
1.6–1.8K/week in early September (after Google's August spam update) and fell from a sharp step on
2026-09-15, then again during and after the September spam update (09-24 → 10-08). The PL blog
recovered in October; the EN blog did not, losing rank on most pages at once (positions 8–14 →
33–66), with queries anonymised. Two signals to act on: nine followed directory-badge links in
every footer (`features/directory-badges.md`), and "Discovered – not indexed" doubling to 89 in a
week while new waves keep landing in nine languages. **Read a decline from the weekly series per
section** (GSC `breakdown=date` with a page filter lists every day, no row control needed), not
from 28-day totals, which hide the step.

**Sitemaps are submitted per section (ABA-689).** The apex build writes `/sitemap.xml` (every URL,
the one robots.txt names) and the same entries split into `/sitemaps/landing.xml`,
`/sitemaps/blog-<lang>.xml` and `/sitemaps/help-<lang>.xml`, each submitted in Search Console on its
own — Pages → "All submitted pages" then filters the indexing report to one section and language.
The blog and help generators' own `sitemap.xml` files are inputs to the apex build and are never
deployed. A new section or language gets its split file automatically; it still has to be
submitted in Search Console by hand.

**Search Console is read through its API first (ABA-688).** `scripts/gsc-snapshot.py` pulls 12
Monday–Sunday weeks per section (site, landing, help, blog, blog per language) with the read-only
service account `gsc-reader@aibudgetassistant-492217.iam.gserviceaccount.com` (Google Cloud project
`aibudgetassistant-492217`, a Restricted user on `sc-domain:ai-budget.pl`). `gsc-snapshot.yml` runs it
every Wednesday, comments on the "Search Console weekly" issue and sends a drop alert to the ops
Telegram channel; locally `python scripts/gsc-snapshot.py --key-file <key.json>` gives the same report,
and `--from-json` re-renders a saved snapshot. The report ends with what changed on the site each week (ABA-690): landing and blog commits listed, help-only commits counted, ad films and copy decks left out — so a step in the series can be read against the edits that preceded it. Two rules the script encodes: the site total comes
from a date-only query, because a page breakdown counts one search once per page; and a week is
reported only once its Sunday is three days old, because the last days are still being revised.
The key is the `GSC_SERVICE_ACCOUNT_JSON` repo secret; to rotate it, add a key to the service
account, replace the secret and delete the old key.

**Search Console can also be read from a session through the Chrome extension** (the user's own signed-in
browser): the performance URL takes `resource_id=sc-domain%3Aai-budget.pl`, `breakdown=query|page|country`
and an exact-page filter `page=!<encoded url>`. Set rows per page to 500 by clicking the control —
a scripted `.click()` on the option does nothing — then read the visible table's `tbody tr`.

## Known gaps

- The three generators keep parallel notions of the language list and of which topics exist;
  nothing cross-checks them.
- `sameAs` still lacks LinkedIn and Crunchbase. The Organization and the app carry separate
  profile lists (`ORG_SAMEAS` / `APP_SAMEAS`, duplicated in the landing and blog generators),
  each ending in its Wikidata item: MiCode Sp. z o.o. is Q141551004, the app Q141551014 (created
  2026-09-24; P577 April 2026 and P495 Poland added 2026-10-15; not to be confused with Q110126846 "Micode", a French YouTuber). Wikidata may still
  delete the app item as non-notable — press coverage as "described at URL" is what keeps it.
  mi-code.pl has no `@id`, so the two sites meet only through the shared name and URL.
- The app has no `aggregateRating` (no verified rating source).
- Nothing checks `FEATURES_EN` against the product: a shipped feature is missing until someone adds
  it by hand — shared groups (ABA-640) went unlisted for four days.
- Response headers are not in any generator: they come from the VPS-only inner nginx config
  (`/opt/ai-budget-web/default.conf`, runbook `docs/ops/web-deploy.md`). Until ABA-672 it sent the
  homepage `no-store`, keeping it out of the back/forward cache, and gave `.webp` no cache header;
  an edit there needs a container restart, not just a reload.

## History

ABA-267 (the blog) · ABA-269 (landing at the apex) · ABA-280 (cross-site language preservation) ·
ABA-281 (internal linking, index schema) · ABA-320 (pricing driven from one JSON) · ABA-393/394/395
(waves, index listing, orthography) · ABA-397 (`SoftwareApplication`) · ABA-435 (in-body links
pointed at the Polish homepage for every language) · ABA-571/572 (diacritics, meta budgets) ·
ABA-574 (wave 5) · ABA-584 (the ABA-435 re-measure, FR snippet) · ABA-638 (SEO/GEO/AEO pass:
`llms.txt` facts, named author, per-article OG, calculators, Excel template, help FAQPage, comparison
and per-bank pages — content-plan Wave 12) · ABA-645 (iOS visitors sent to the web app, not Play) ·
ABA-672 (lightbox screenshots as WebP, shared groups added to `llms*.txt` and `featureList`) ·
ABA-673 (snippet rewrite of twelve top-10, zero-click pages; CTR baseline in the issue) ·
ABA-674 (one `FEATURES_EN` list with a translation-length check; one company spelling) ·
ABA-675 (Polish push: article 47 on living on 2000 zł, answer-first rework of 29 and 14) ·
ABA-676 (help snippets fitted to length; site-wide on-page and GSC indexing audit clean) ·
ABA-685 (the ABA-584 re-measure: no snippet rewrite moved CTR; EN blog drop not recovered) ·
ABA-686 (diagnosis of the decline: site-wide ranking loss from 2026-09-15, followed footer badges, growing not-indexed queue) ·
ABA-688 (weekly Search Console API snapshot per section with a drop alert) ·
ABA-689 (per-section sitemaps submitted separately) · ABA-690 (site changes listed next to the weekly series).
