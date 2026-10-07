# Receipt Inflation Report — design (not built)

Status: **design only, awaiting review.** No production data has been read for this document.

## Why

Answer engines cite pages that hold numbers nobody else publishes. Every budgeting blog repeats the
official CPI; none can say what a basket of everyday products *actually scanned at Polish tills*
did last quarter. The app already collects exactly that, de-identified, for the Community Price
Map. A quarterly public report — "Indeks inflacji paragonowej" — turns it into the one GEO asset a
competitor cannot copy, and it links naturally from the inflation, Inflation Shield and grocery
articles.

## Data source — and the one rule that decides everything

**Only `community_price_observations` may feed the report.** Never `expense_items`.

- Observations exist only for accounts that **opted in** to community contribution (off by
  default) — publishing aggregates of anyone else's receipts would use data for a purpose they
  never agreed to.
- The table holds no accountId, userId, expenseId or user coordinates — only `canonicalName`,
  `merchantNormalized`, a POS-derived `region`, `weekStart`, `currencyCode`, price and the one-way
  `contributorKey` (`docs/wiki/features/community-prices.md`).
- One vote per contributor per product/store/region/week is already enforced by the table's
  unique — the report inherits the anti-poisoning dedup.

The privacy policy must be checked to say contributions may be published **in aggregate**. If it
does not, the policy is updated and the opt-in copy changed **before** the first report — that is a
blocking prerequisite, not a follow-up.

## The metric

A chained Laspeyres index over a fixed basket, quarter on quarter, PLN only:

- **Basket**: canonical products observed in both quarters with at least **K = 20** distinct
  contributors in each (stricter than the map's K, because a published number is permanent).
  Grouped into public categories (dairy, bread, meat, vegetables, fruit, drinks, household) by the
  existing product-category rules.
- **Price per product per quarter**: median of contributor-level medians (each contributor counts
  once), after the map's outlier drop outside `[median/2, median×2]`.
- **Weight**: number of distinct contributors in the base quarter — reach, not spend, so a heavy
  shopper cannot steer it.
- **Published**: overall index change, per-category change, top 5 risers and fallers (product
  names only, never a store unless that store cleared K on its own), and the basket size.
- **Suppression**: a category with fewer than 5 qualifying products is not published; the report
  is not published at all below 50 qualifying products or 200 distinct contributors in the quarter.
- **Sybil**: the correlation clustering in the community module must be validated and ON before
  the first publication — it is the same gate that keeps map reads dark today.

## Methodology page

Published with every edition and versioned: data source, consent, K, suppression thresholds,
weighting, known biases (app users are not a representative sample; OCR misreads; the basket
drifts toward what users scan). Comparison with GUS CPI for the same quarter, linked, so the page
never reads as a replacement for official statistics.

## Pipeline

1. A read-only SQL job run by hand at quarter end against a replica or a dump restored to scratch —
   never ad hoc on the primary. Output: one JSON file of aggregates only.
2. The JSON is reviewed by a person before anything is committed; it carries no row below the
   suppression thresholds.
3. A generator step renders `/blog/pl/indeks-inflacji-paragonowej/<YYYY-qN>/` plus a methodology
   page, with `Dataset` JSON-LD (`variableMeasured`, `temporalCoverage`, `license`, `creator`) and
   a CSV download of the published aggregates. Polish first; en/de later.
4. The latest edition is linked from the `inflation`, `inflation-shield` and `groceries` articles.

## Open questions for review

- Does the current privacy policy cover publishing aggregates? (blocking)
- Is the contributor base large enough? Run step 1 once to count qualifying products and
  contributors, publishing nothing, before committing to a schedule.
- Store-level rankings: excluded here; they invite legal and accuracy disputes for little gain.
