# Blog Content Plan — AI Budget Assistant

Editorial plan for new SEO articles on ai-budget.pl/blog. Pillar + cluster model:
the 3 existing articles are the cluster pillars; new articles target long-tail
queries, link back to the pillar, and tie to a concrete app feature (conversion).

Each article ships in all 9 languages (en/pl/de/es/fr/ru/ua/be/nl) via the
translation pipeline, hreflang-grouped by the `pair` key.

## Existing pillars
| Pillar | pair | slug (en) |
|---|---|---|
| How to budget | budget | how-to-budget |
| Expense tracking | expenses | expense-tracker |
| How to save money | saving | how-to-save-money |

## Strategy
- **Cluster, don't sprawl.** Every new article links up to its pillar + sideways to 1-2 siblings. Pillars get edited to link down to the new articles.
- **Tie to a feature.** Each topic maps to an app feature so the CTA is natural and the content is differentiated (AI capture, shared accounts, subscription manager, bank import, savings goals).
- **Market-aware keywords.** Head terms differ per language (PL "budżet domowy", DE "Haushaltsbuch", NL "huishoudboekje"). Long-tail topics below are stable across markets; localize the exact phrasing per language at write time (see `aso-keywords.md`).
- **Format by intent.** How-to guides get `HowTo` JSON-LD (rich results); "best apps" is a comparison listicle (high purchase intent); the rest are guides with FAQ.

## Wave 1 — highest value (6 topics)
| # | Topic | pair | PL keyword | EN keyword | Intent | App tie |
|---|---|---|---|---|---|---|
| 1 | **Shared budget for couples/family** | shared-budget | wspólny budżet, budżet w związku | shared budget for couples | how-to | **Shared accounts** (USP) |
| 2 | **Envelope budgeting method** | envelope | metoda kopertowa | envelope budgeting (cash envelope system) | how-to | Category budgets |
| 3 | **The 50/30/20 rule** | rule-503020 | zasada 50/30/20 | 50/30/20 budget rule | how-to | Budgets with history |
| 4 | **Best budgeting apps (2026)** | best-apps | najlepsze aplikacje do budżetu | best budgeting apps / best expense tracker | comparison | Whole app (honest pick) |
| 5 | **Emergency fund: how much & how to build** | emergency-fund | poduszka finansowa, fundusz awaryjny | emergency fund (how much to save) | how-to | Savings goals |
| 6 | **Track & cancel subscriptions to save** | subscriptions | jak zarządzać subskrypcjami | how to track and cancel subscriptions | how-to | Subscription manager + anomaly alerts |

## Wave 2 — ✅ DONE (ABA-283): the 6 topics below were published in all 9 languages (files `1[0-5]-*.md`, pairs `groceries`/`categories`/`debt`/`bank-import`/`family`/`ai-budget`). Blog now at 135 articles. (Its three follow-ups are all closed now: pillar→cluster down-links and the landing "From the blog" entries in ABA-393/394, and the IndexNow ping back in `c0b0ed02`.)
| # | Topic | pair | PL keyword | EN keyword | App tie |
|---|---|---|---|---|---|
| 7 | Save money on groceries | groceries | jak oszczędzać na jedzeniu | how to save money on groceries | Spending analytics |
| 8 | Expense categories that actually work | categories | kategorie wydatków | expense categories list | Categories/tags |
| 9 | How to pay off debt (snowball vs avalanche) | debt | jak spłacić długi | how to pay off debt fast | Debt tracking |
| 10 | How to import a bank statement | bank-import | jak zaimportować wyciąg bankowy | import bank statement to a budget app | Bank import (Wise/PL banks) |
| 11 | Family budget with kids | family | budżet domowy z dziećmi | family budgeting with kids | Shared accounts |
| 12 | How AI helps you budget | ai-budget | AI w zarządzaniu finansami | how AI can help you budget | AI assistant (USP) |

## Wave 3 — feature-led (2 topics, tied to the newest app features)
| # | Topic | pair | PL keyword | EN keyword | Intent | App tie |
|---|---|---|---|---|---|---|
| 16 | **Your personal inflation rate** | inflation | osobista inflacja, jak obliczyć własną inflację | personal inflation rate | how-to | **Personal Inflation Index** (price history from receipts, per-store cheapest) |
| 17 | **Map your spending** | expense-map | mapa wydatków, gdzie wydaję pieniądze | expense map | guide | **Expense map** (receipt geocoding + optional GPS + trip map) |

Source files `16-*.md` / `17-*.md`; pairs `inflation` / `expense-map`. Published in all 9 languages. These are differentiated USP topics (few competitors offer a personal inflation index or a spending map), so they target low-competition long-tail queries with a natural CTA to the exact feature.

## Wave 4 — ✅ DONE (ABA-393): 4 topics published in all 9 languages (files `1[89]-*.md`, `2[01]-*.md`). Blog now at 189 articles across 21 topics.
| # | Topic | pair | PL keyword | EN keyword | Intent | App tie |
|---|---|---|---|---|---|---|
| 18 | **Split a bill with friends** | split-bill | jak podzielić rachunek | how to split bills with friends | how-to | **Receipt splitting + guest links** (friends need no app or account) |
| 19 | **The app records spending for you** | auto-capture | automatyczne zapisywanie wydatków | automatic expense tracking | guide | **Bank-notification auto-capture** (Android, on-device) + voice/bots/import |
| 20 | **Scanning receipts: why line items matter** | receipts | skanowanie paragonów | receipt scanner app | guide | OCR line items -> price history, personal inflation, receipt price check |
| 21 | **Back-to-school costs** | school | wyprawka szkolna ile kosztuje | back to school budget | how-to (seasonal) | Budgets + threshold alerts, savings goal, shared shopping list |

| 22 | **What happens when your bank is not on the list** | ai-bank-import | import wyciągu z dowolnego banku | import bank statement from any bank | product | **AI universal statement import** (ABA-390/391) — column-mapping inference or PDF row extraction when no built-in parser recognizes the file |

Wave 4 notes:
- Topics 18-20 are feature-led USP pieces (each maps to a capability most competitors lack); 21 is seasonal and should be refreshed each August.
- Topic 22 was proposed via the AI Dreaming Center (project-scan proposal, tied to commit `4c094cf3` / app v1.17.0) rather than drafted as part of the original Wave 4 batch, but shares this batch's feature-led USP framing and cluster (`ai-bank-import` pairs with `bank-import`, topic 10) — filed here rather than opening a Wave 5 entry for one topic.
- **Positioning constraint on `receipts`**: the receipt price check may only be described as "more expensive than usual, worth checking" — never as detecting an overcharge or a failed promotion. The app cannot prove a promotion did not apply. This wording rule is enforced in all 9 languages.
- **Also fixed in this wave:** the 3 Polish pillars cross-linked each other with relative paths built from old numbered slugs (`../01-budzet-domowy/`), so all 6 inter-pillar links 404'd. They now use absolute `/blog/pl/<slug>/` like every other article.
- **Pillar down-links are now generated, not hand-written.** All 3 pillars in all 9 languages carry a localized "Related guides" list of their cluster children, appended below a `<!-- pillar-downlinks -->` marker. Re-run the generator (see below) after adding any topic so the new article is linked from its pillar; the block is replaced, not duplicated.

## Wave 6 — proposed via AI Dreaming Center
| # | Topic | pair | PL keyword | EN keyword | Intent | App tie |
|---|---|---|---|---|---|---|
| 23 | **Why most budgeting apps get deleted in the first week** | app-abandonment | dlaczego usuwamy aplikacje do budżetu | why budgeting apps get deleted | top-of-funnel / awareness | **First-run onboarding** (ABA-403) — the one-screen fix that routes a new signup straight to their first transaction instead of an empty dashboard, deferring the pricing screen until after activation |

Wave 6 notes:
- Topic 23 was proposed via the AI Dreaming Center (proposal id 514, proposal-scan), tied to commit `487ba074` / ABA-403 ("First-run onboarding") — same sourcing pattern as topic 22 in Wave 4. Filed as its own Wave rather than folded into Wave 4/5 since it opens a new cluster angle (product/app-abandonment) rather than extending an existing pair.
- Cluster: `expenses` (pillar `expense-tracker`/`kontrola-wydatkow-aplikacja`), alongside siblings `best-apps`, `auto-capture`, `receipts`. Each of the 9 language files links up to the expenses pillar and to the `receipts`/`auto-capture` (and, in most languages, `best-apps` or `ai-budget`) sibling articles.
- This is a **top-of-funnel** piece: it leads with the general, well-known day-one/day-three app-abandonment problem (kept qualitative, no invented percentages or cited studies) and uses AI Budget Assistant's own first-run fix as the concrete illustration, not as a hard sell.
- Positioning constraint (binding in all 9 languages): no invented abandonment percentage or named external study, and no invented "reduced onboarding from N steps to 1" metric — describe the before/after qualitatively (empty dashboard + a pricing screen first, vs. one screen with a clear primary action).
- **Follow-up before the next regenerate**: `app-abandonment` still needs to be added to `CLUSTERS["expenses"]` in `build_blog.py` so `build_pillar_links.py` writes the down-link from the expenses pillar and the blog index files the topic under the "Expenses" category chip — this was not done as part of authoring the Markdown sources (see the verification step).
- Blog now at 22 topics / 190 articles once this topic ships (was 21 topics / 189 articles after Wave 4).

## Wave 7 — proposed via AI Dreaming Center
| # | Topic | pair | PL keyword | EN keyword | Intent | App tie |
|---|---|---|---|---|---|---|
| 24 | **Switching from Monefy, Wallet, or Money Manager in one tap** | switch-apps | alternatywa dla monefy | monefy alternative | top-of-funnel / comparison | **Competitor-app import parsers** (ABA-401) — dedicated Monefy/Wallet/Money Manager CSV parsers that carry over the exporting app's own categories instead of guessing from the merchant name |

Wave 7 notes:
- Topic 24 was proposed via the AI Dreaming Center (proposal id 513, proposal-scan), tied to commit `6f559740` / ABA-401 ("Competitor app migration") — same sourcing pattern as topics 22 and 23. Filed as its own wave for the same reason as Wave 6: it extends the `expenses` cluster with a new pair rather than adding to an existing one.
- Cluster: `expenses` (pillar `expense-tracker`/`kontrola-wydatkow-aplikacja`), alongside siblings `bank-import` and `ai-bank-import`. Each of the 9 language files links up to the expenses pillar and sideways to both import-themed siblings.
- **Positioning, distinct from `ai-bank-import` (topic 22) on purpose**: topic 22 is about **banks** with no matching parser, resolved via AI column-mapping/PDF extraction — a probabilistic fallback. Topic 24 is about **competing budgeting apps** (Monefy, Wallet by BudgetBakers, Money Manager) with dedicated, deterministic (non-AI) parsers that read the category the user already assigned straight out of the export file. The core promise of topic 24 is "keep your categories, no AI guessing needed" — near-opposite framing from topic 22 — so the two target different search intent and should not be blended.
- Positioning constraints (binding in all 9 languages): no claim of automatic account sync/linking to Monefy, Wallet, or Money Manager (it is a one-time offline CSV export/import, not a live connection); no claim that all data types transfer (only transactions and categories — the competing app's own budgets, recurring-charge rules, and attachments do not carry over); no invented percentage or time-saved statistic (nothing of that kind has been measured).
- `switch-apps` was added to `CLUSTERS["expenses"]` in `build_blog.py` as part of authoring this topic (unlike `app-abandonment` in Wave 6, which needed a follow-up commit) — `build_pillar_links.py` picks it up on the next run with no further edits needed.
- Blog now at 24 topics / 216 articles once this topic ships (was 23 topics / 207 articles after Wave 6).

## Wave 8 — proposed via AI Dreaming Center
| # | Topic | pair | PL keyword | EN keyword | Intent | App tie |
|---|---|---|---|---|---|---|
| 25 | **Your financial year, wrapped** | wrapped | podsumowanie roku finansowego | financial year in review | product / guide | **Financial Wrapped** (ABA-336) — a free, Spotify-Wrapped-style year-in-review card deck (top merchant, biggest month, category mix, savings rate, personal inflation) with a shareable image card (ABA-353) |

Wave 8 notes:
- Topic 25 was proposed via the AI Dreaming Center (proposal id 1141, project-scan), tied to commit `a8c86d8e` / ABA-336 ("Financial Wrapped") — same sourcing pattern as topics 22-24. Filed as its own wave for the same reason as Waves 6/7: it opens a new pair in an existing cluster rather than extending one already covered.
- Cluster: `saving` (pillar `how-to-save-money`/`jak-oszczedzac-pieniadze`), alongside siblings `inflation` and `subscriptions` — both directly reflected as Financial Wrapped cards (personal inflation index, and the year-end nudge to review recurring costs). `wrapped` was added to `CLUSTERS["saving"]` in `build_blog.py` as part of authoring this topic (the "no follow-up needed" pattern from Wave 7, not the Wave 6 gap) and `build_pillar_links.py` was re-run so the `how-to-save-money` pillar links down to it in all 9 languages.
- **Shipped in 3 languages (pl, en, ru) first, then completed to the full 9-language rollout in a revision pass** (de, es, fr, ua, be, nl added after a human reviewer flagged the 3-language draft against this project's usual 9-language convention) — the reduced first pass matched `DC_ARTICLE_LOCALES` and the proposal's own `locales` field, but the site publishes all 9 languages for every other topic and this one now matches. `build_pillar_links.py` no longer reports any `MISSING wrapped` pillar gap.
- This is a **seasonal, product-led piece** (content-plan Wave 5 already flagged `year-review` for an early-December publish window, tied to Financial Wrapped) — written now via the Dreaming Center rather than waiting for that calendar slot; nothing in the copy depends on the actual month, so it holds up whenever it is published.
- Positioning constraints (binding in all 9 languages): no invented example numbers presented as real (the "9 percent, driven by meat and coffee" style figure from the `inflation` article's own precedent is avoided entirely here rather than reused as a fake headline stat); the free/no-tier-gate claim, the `hasEnoughData` honesty behavior (a partial year is shown honestly rather than guessed), and the text + image share formats are all stated only as far as the shipped feature actually behaves.
- Blog now at 25 topics / 225 articles once this topic ships (was 24 topics / 216 articles after Wave 7) — the 9 language files count against the topic total.

## Wave 9 — proposed via AI Dreaming Center
| # | Topic | pair | PL keyword | EN keyword | Intent | App tie |
|---|---|---|---|---|---|---|
| 26 | **Stocking up before your usual products get more expensive** | inflation-shield | zapasy przed podwyżką cen | stock up before prices rise | product / guide | **Inflation Shield** (ABA-346) — a free, per-product price forecast built from your own receipt history that flags what is about to get more expensive, recommends product/quantity/store, and tracks realized savings once you act on it |

Wave 9 notes:
- Topic 26 was proposed via the AI Dreaming Center (proposal id 1147, project-scan), tied to commit `bcdc6f2f` / ABA-346 ("Inflation Shield") — same sourcing pattern as topics 22-25. Filed as its own wave for the same reason as Waves 6-8: it opens a new pair in an existing cluster rather than extending one already covered.
- Cluster: `saving` (pillar `how-to-save-money`/`jak-oszczedzac-pieniadze`), alongside siblings `inflation` and `wrapped`. `inflation-shield` is the explicit **forward-looking counterpart** to `inflation` (topic 16): topic 16 measures inflation that already happened, topic 26 forecasts a per-product trend from the same receipt data and recommends stocking up before the rise lands, rather than repeating topic 16's "how to calculate it by hand" structure. `wrapped` (topic 25) is linked as a second sibling since Financial Wrapped also surfaces the personal inflation number. `inflation-shield` was added to `CLUSTERS["saving"]` in `build_blog.py` as part of authoring this topic (the "no follow-up needed" pattern from Waves 7-8) and `build_pillar_links.py` was re-run so the `how-to-save-money` pillar links down to it in all 9 languages.
- **Shipped in 3 languages (pl, en, ru) first, then completed to the full 9-language rollout in a revision pass** (de, es, fr, ua, be, nl added after a human reviewer flagged the 3-language draft against this project's usual 9-language convention — the same gap Wave 8 (`wrapped`) hit and was fixed the same way). The reduced first pass matched `DC_ARTICLE_LOCALES` and the proposal's own `locales` field, but the site publishes all 9 languages for every other topic and this one now matches. `build_pillar_links.py` no longer reports any `MISSING inflation-shield` pillar gap.
- Positioning constraints (binding in all 9 languages): the forecast is described as deterministic trend statistics over the user's own receipt history, never as an "AI-powered" prediction — the feature is not an LLM call; recommended quantities and stock-up windows are described qualitatively (a month or two of normal consumption, capped), never with an invented number; the estimated saving is always framed as a conservative estimate (the underlying model halves the naive gap), never as an exact or guaranteed figure; the feature must not be described as detecting a failed promotion or an overcharge (that positioning belongs to the separate receipt price-check feature, topic 21's `receipts` pair) or as comparing prices against other users (no community layer exists for this feature yet); the free/no-tier-gate claim and the "needs a handful of real shopping trips first" honesty behavior are stated only as far as the shipped feature actually behaves.
- Blog now at 26 topics / 234 articles once this topic ships (was 25 topics / 225 articles after Wave 8) — all 9 language files count against the topic total.

## Wave 10 — proposed via AI Dreaming Center
| # | Topic | pair | PL keyword | EN keyword | Intent | App tie |
|---|---|---|---|---|---|---|
| 27 | **Get an alert the moment your exchange rate hits the number you want** | rate-alert | alert kursu walut | exchange rate alert | product | **Exchange-rate watch alerts** (ABA-474) — set a target rate + direction for a currency pair, checked hourly against a live rate provider, fires one push notification when hit and deep-links back to the exchange screen |

Wave 10 notes:
- Topic 27 was proposed via the AI Dreaming Center (proposal id 1169), tied to commit `101ad89f` / ABA-474 ("Exchange-rate watch alerts") — same sourcing pattern as topics 22-26.
- Cluster: `saving` (pillar `how-to-save-money`/`jak-oszczedzac-pieniadze`), alongside sibling `inflation-shield` (topic 26). Both are framed around the same underlying theme — acting on your own data at the right moment instead of after the fact — but the mechanisms are kept clearly distinct in the copy: `inflation-shield` forecasts product prices from receipt history, `rate-alert` watches a live currency exchange rate against a threshold you set. `rate-alert` was added to `CLUSTERS["saving"]` in `build_blog.py` as part of authoring this topic (the "no follow-up needed" pattern from Waves 7-9) and `build_pillar_links.py` was re-run so the `how-to-save-money` pillar links down to it in the languages that exist for this topic.
- **Shipped in 3 languages (pl, en, ru) first, then completed to the full 9-language rollout in a revision pass** (de, es, fr, ua, be, nl added after a human reviewer flagged the 3-language draft against this project's usual 9-language convention — the same gap Waves 8-9 (`wrapped`, `inflation-shield`) hit and were fixed the same way). The reduced first pass matched `DC_ARTICLE_LOCALES` and the proposal's own `locales` field, but the site publishes all 9 languages for every other topic and this one now matches. The 6 new files reuse in-app terminology pulled straight from `apps/mobile/src/i18n/locales/*.ts` (the `wallet`/`exchange`/`rateAlerts`/`notifyMe`/`targetRate` keys already shipped for ABA-474) rather than inventing fresh translations for the screen names the article references. `build_pillar_links.py` no longer reports any `MISSING rate-alert` pillar gap.
- Positioning constraints (binding in all 9 languages): never described as real-time or live — the check runs hourly against a live rate provider, not a continuous stream; never described as recurring or repeating once triggered — it is one push notification per watch, one-shot, and a new target must be set to be notified again; no AI/ML claim of any kind — it is a plain deterministic threshold comparison, explicitly contrasted with the app's actual AI-branded features where useful; no claim of shared-account/family visibility — it is a personal, per-user watch; no invented example rates presented as historical fact (a clearly-hypothetical illustrative example is fine); no invented savings percentage or statistic — framed qualitatively only (avoiding a bad moment to exchange, not a measured saving).
- Blog now at 27 topics / 243 articles once this topic ships in all 9 languages (was 26 topics / 234 articles after Wave 9) — all 9 language files count against the topic total.

## Wave 5 — proposed (not started)
High-volume commercial queries we do not rank for yet: `excel-budget` (budżet domowy w Excelu — szablon, plus when to move off a spreadsheet), `free-app` (darmowa aplikacja do budżetu domowego), `irregular-income` (budget on freelance/B2B income — ties to Safe-to-Spend + scenario simulator), `multi-currency` (living and earning across two currencies — the one topic where the ru/ua/be locales serve their own audience rather than being a translation).

Seasonal backlog with publish windows: `black-friday` (early Nov, ties to price history + Inflation Shield), `christmas` (Oct), `new-year` (late Dec). (`year-review`, originally slotted here for early Dec, shipped early as Wave 8's `wrapped` topic instead — see above.)

## Article conventions (per piece)
- Frontmatter: `title` (<=60, keyword), `meta_description` (<=155), `target_keyword`, `slug`, `pair`, `lang`, **`date`** (`YYYY-MM-DD`).
- **`date` is REQUIRED on every new file and is the publication date** (ABA-394). It drives the newest-first order of the blog index, the visible date on each card, and `datePublished` in the article's JSON-LD. It is deliberately NOT derived from git: `git_date()` is the *last-commit* date, so a later edit to an old article would silently promote it to the top of the index and rewrite its publication date. Use the same `date` in all 9 language files of a topic.
- One H1, several H2/H3, a 3-4 question **FAQ** (auto-emits FAQPage schema).
- How-to topics: structured as numbered steps (the generator can emit `HowTo` schema — to be added).
- 900-1300 words, natural transcreation per language (NOT machine translation), correct diacritics.
- Internal links: up to the pillar + 1-2 siblings in the same cluster (use `/blog/<lang>/<slug>/`).
- Mention AI Budget Assistant 2-3x with a soft CTA (ai-budget.pl / Google Play); avoid ad tone, emojis, em-dashes.

## Language rollout
- Each topic → all 9 languages (hreflang parity). Source written in EN, transcreated to pl + 7 others (same pipeline as the first 3 articles).
- After publishing: regenerate the blog (`build_blog.py`) + landing sitemap, deploy. The new URLs auto-enter the sitemap.

## Suggested execution
- **Batch A (start):** Wave 1 topics 1-3 (shared budget, envelope, 50/30/20) in all 9 languages = 27 articles. These are the highest-volume budgeting-basics + the USP topic.
- **Batch B:** Wave 1 topics 4-6 (best apps, emergency fund, subscriptions) = 27 articles.
- **Batch C:** Wave 2 (6 topics) = 54 articles.
- Alternatively, to validate first: write **PL + EN only** for Batch A (6 articles), check quality/indexing, then translate to the other 7.

## After each batch
- Edit the 3 pillar articles to add "Related guides" links down to the new cluster articles.
- Add a "From the blog" section on the landing linking the top new articles (internal links + discovery).
- **IndexNow needs no manual step** — `.github/workflows/web-deploy.yml` runs `scripts/indexnow-ping.sh` after every deploy, which diffs the pushed commit range, maps changed `site/**/index.html` files to their live URLs and POSTs them (verified accepted, HTTP 200, on the Wave-4 deploy). Do not re-add "ping IndexNow" as a manual follow-up.
