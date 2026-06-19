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

## Wave 2 — next (6 topics)
| # | Topic | pair | PL keyword | EN keyword | App tie |
|---|---|---|---|---|---|
| 7 | Save money on groceries | groceries | jak oszczędzać na jedzeniu | how to save money on groceries | Spending analytics |
| 8 | Expense categories that actually work | categories | kategorie wydatków | expense categories list | Categories/tags |
| 9 | How to pay off debt (snowball vs avalanche) | debt | jak spłacić długi | how to pay off debt fast | Debt tracking |
| 10 | How to import a bank statement | bank-import | jak zaimportować wyciąg bankowy | import bank statement to a budget app | Bank import (Wise/PL banks) |
| 11 | Family budget with kids | family | budżet domowy z dziećmi | family budgeting with kids | Shared accounts |
| 12 | How AI helps you budget | ai-budget | AI w zarządzaniu finansami | how AI can help you budget | AI assistant (USP) |

## Article conventions (per piece)
- Frontmatter: `title` (<=60, keyword), `meta_description` (<=155), `target_keyword`, `slug`, `pair`, `lang`.
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
