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
- **IndexNow needs no manual step** — `.github/workflows/web-deploy.yml` runs `scripts/indexnow-ping.sh` after every deploy, which diffs the pushed commit range, maps changed `site/**/index.html` files to their live URLs and POSTs them (verified accepted, HTTP 200, on the Wave-4 deploy). Do not re-add "ping IndexNow" as a manual follow-up.
