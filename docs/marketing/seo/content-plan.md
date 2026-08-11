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

## Wave 2 — ✅ DONE (ABA-283): the 6 topics below were published in all 9 languages (files `1[0-5]-*.md`, pairs `groceries`/`categories`/`debt`/`bank-import`/`family`/`ai-budget`). Blog now at 135 articles. Follow-ups: add pillar→cluster down-links, a landing "From the blog" entry, and an IndexNow ping.
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

Wave 4 notes:
- Topics 18-20 are feature-led USP pieces (each maps to a capability most competitors lack); 21 is seasonal and should be refreshed each August.
- **Positioning constraint on `receipts`**: the receipt price check may only be described as "more expensive than usual, worth checking" — never as detecting an overcharge or a failed promotion. The app cannot prove a promotion did not apply. This wording rule is enforced in all 9 languages.
- **Also fixed in this wave:** the 3 Polish pillars cross-linked each other with relative paths built from old numbered slugs (`../01-budzet-domowy/`), so all 6 inter-pillar links 404'd. They now use absolute `/blog/pl/<slug>/` like every other article.
- **Pillar down-links are now generated, not hand-written.** All 3 pillars in all 9 languages carry a localized "Related guides" list of their cluster children, appended below a `<!-- pillar-downlinks -->` marker. Re-run the generator (see below) after adding any topic so the new article is linked from its pillar; the block is replaced, not duplicated.

## Wave 5 — proposed (not started)
High-volume commercial queries we do not rank for yet: `excel-budget` (budżet domowy w Excelu — szablon, plus when to move off a spreadsheet), `free-app` (darmowa aplikacja do budżetu domowego), `irregular-income` (budget on freelance/B2B income — ties to Safe-to-Spend + scenario simulator), `multi-currency` (living and earning across two currencies — the one topic where the ru/ua/be locales serve their own audience rather than being a translation).

Seasonal backlog with publish windows: `black-friday` (early Nov, ties to price history + Inflation Shield), `christmas` (Oct), `year-review` (early Dec, ties to Financial Wrapped and its share image), `new-year` (late Dec).

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
- Optionally ping IndexNow for the new URLs (fast Bing/Yandex indexing).
