# Real salary — personal inflation vs pay — design

Date: 2026-09-26 · Status: approved; corrected 2026-09-26 while planning (see *Corrections*)

## Corrections (verified against the live Eurostat API and the code while planning)

- **Dataset is `prc_hicp_minr`** (HICP, ECOICOP ver.2 / COICOP 2018), dimension **`coicop18`**,
  unit **`RCH_A`** (annual rate of change). `prc_hicp_manr` was frozen at 2025-12 when Eurostat
  switched classifications — building on it would show last year's inflation forever.
- **13 divisions `CP01..CP13`**, and the all-items total is **`TOTAL`**, not `CP00`. COICOP 2018
  splits old CP12 into CP12 (insurance & financial) and CP13 (personal care & misc), and moves
  communication to CP08 "Information and communication". Everywhere below, read `CP00` as
  `TOTAL` and `CP01..CP12` as `CP01..CP13`. Greece is `EL` in Eurostat geo codes.
- **Salary is grouped by income category + normalised description, NOT by amount.** The
  Safe-to-Spend detector buckets by amount, which would split a salary series at every raise —
  the exact change this feature measures. Same 25–35-day cadence, ≥ 2 occurrences, 90-day window.
  Excluded: debt / repayment incomes and transfers counted as income (`clientId` prefix
  `transfer-income-`).
- **Extra status `salary_history_short`**: a confirmed salary without a full prior 12 months and no
  manual previous figure — the setup asks for last year's salary.
- **Seed categories map to COICOP by their icon**, which is identical across the 9 seed languages
  (names are not). A category with no known icon goes to the classifier.
- **The classifier is not charged to the user's AI limit** — it runs once per category (the answer
  is stored; "unknown" is stored as `TOTAL` so it is never re-asked), at most 50 categories per
  request, names only.
- **Mobile SQLite gets no column.** The category → division editor reads
  `GET /insights/real-salary/categories`; categories are never edited offline for this.
- **Implementation is two plans**: API (`plans/2026-09-26-real-salary-api.md`), then mobile.


## Goal

Answer "did I actually get richer this year?" with one number:
**"Real salary −3.3%: your pay rose 5.0%, your personal inflation was 8.3%."**
Nobody else can compute this, because nobody else has the user's spending weights
*and* per-product receipt prices. Free and shareable (virality), with a Pro
"raise-negotiation brief" PDF (monetization).

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Inflation measure | **Personal spend-weighted index**: user's category weights × official Eurostat HICP by COICOP division; CP01 (food) replaced by our receipt index when it is backed by enough products |
| Salary source | **Auto-detect + confirm**: reuse the Safe-to-Spend recurring-income detector; ask for last year's salary when history < 13 months |
| Scope / tier | Screen + share card **free**; raise-brief PDF **Pro** |
| Country / non-EU | **Guess from timezone, user can change** (`User.inflationCountry`); outside the EU, receipts-only index with honest labelling, or an empty state |
| HICP data | **Stored by a cron** in our DB, never fetched on a user request |

Rejected: receipts-only comparison (groceries are a fraction of spend — "you got 3% poorer"
would overstate); country CPI only (not personal); IMF/World Bank CPI for non-EU (second
source, coarse, months late); live Eurostat fetch (fails with a cold cache, Redis is
`allkeys-lru`); static JSON (goes stale).

## Calculation (`real-salary.util.ts`, pure)

**Weights.** Last 12 months of the account's expenses by category, split-aware via
`attributeToCategories`. Excluded: transfers, debts, split receivables (`isSplitReceivable`),
planned expenses (`isPlanned`). Amounts converted to `user.currencyCode` via
`common/utils/fx.ts`; unknown-rate amounts excluded and `fxApproximate` flagged.

**Category → COICOP.** New `Category.coicopDivision` (`'CP01'..'CP12'`, nullable).
- Seeded default categories: static dictionary.
- Custom categories: classified once by a cheap model **from the category name only** (never
  amounts), stored in the column, user-overridable.
- Null division and uncategorized spend → `CP00` (all-items HICP).

**Index.** `personalInflation = Σ(wᵢ × rᵢ) / Σ wᵢ`, `rᵢ` = latest published annual HICP rate
for that division and country. For `CP01`, `rᵢ` = our 12-month receipt Laspeyres index when it
is backed by **≥ 10 products**, else official. Outside the EU / `inflationCountry = null`:
receipts-only index, labelled as such.

**Salary.** Recurring-income detector (25–35-day cadence over 90 days, same as Safe-to-Spend).
The confirmed match is stored as a salary key (income category + merchant/description) in
`SalaryProfile`, with an optional manual previous monthly salary when history < 13 months.
Nominal change = mean monthly salary of the last 12 months vs the previous 12 (or vs the manual
figure).

**Real change.** `real = (1 + nominal) / (1 + inflation) − 1`.
`requiredRaisePct` = the raise needed on **current** pay to restore last year's purchasing
power: `(1 + inflation) / (1 + nominal) − 1` (≤ 0 → already ahead, shown as "you're ahead").

**Not enough data → no number.** Reasons enumerated in `status`: `no_salary_confirmed`,
`spend_under_3_months`, `no_inflation_source` (no official data and too few receipts),
`encrypted` (tier-2 full encryption, same as Wrapped). Never draw unloaded data as fact.

## Data ingest

- `official-inflation.cron.ts` — runs on the 1st and 15th; `EurostatClient` fetches dataset
  `prc_hicp_manr` (annual rate of change, monthly) for `CP00` + `CP01..CP12` for every EU/EEA
  country, upserts `official_inflation_rates (country, coicop, month, annualRatePct)`.
- On failure: log via `logFireAndForget`-style warn, keep the last stored month; the response
  carries `dataMonth` so staleness is visible.

## API (module `insights`)

`real-salary.service.ts` (IO) + `real-salary.util.ts` (pure), same pair shape as
`safe-to-spend` and `wrapped`. Scoped to the current account like Safe-to-Spend.

- `GET /insights/real-salary` — JwtAuth + AccountContext, free. `RealSalaryResponse`:
  `status`, `nominalChangePct`, `personalInflationPct`, `realChangePct`, `requiredRaisePct`,
  `breakdown[] {division, weight, ratePct, source: 'official'|'receipts'}`, `topDrivers[]`,
  `dataMonth`, `country`, `fxApproximate`. Redis `rs:{accountId}:{currency}` TTL 3600 s; busted
  when the profile, a category division or the country changes.
- `GET/PUT /insights/real-salary/profile` — salary key + manual previous salary;
  `ViewerBlockGuard` on PUT.
- `PATCH /categories/:id` accepts `coicopDivision`.
- `PATCH /users/me` accepts `inflationCountry` (ISO 3166-1 alpha-2 or null).
- `POST /insights/real-salary/brief` — `@RequireTier('pro')`, PDF via the existing
  `reports/generators/pdf-generator.ts`. **No LLM**: deterministic template text in 9 languages.
  Contents: headline numbers, per-division table, top drivers, required raise, data sources and
  month.

DTOs in `packages/shared-types/src/dto/insights.ts`.

**Migration** (one, landing in the same commit as the schema change — ABA-558):
`official_inflation_rates`, `salary_profiles`, `categories.coicop_division`,
`users.inflation_country`. Mobile SQLite: `categories.coicop_division` column only.

## Mobile

- `app/real-salary.tsx` (with header + back). Hero "Real salary −3.3%"; three rows
  (pay +5.0%, your inflation +8.3%, to keep up you need +8.3%); per-division breakdown tagged
  "your receipts" / "official data"; **Share** and **Raise brief (Pro)** buttons.
- First entry: two-step setup — "Is this your salary?" → optional "What was it a year ago?".
- Settings on the screen: country picker, category → division editor.
- Entry point: banner on the Analytics tab next to Wrapped.
- `useRealSalary` hook in `src/features/insights/`; API method in `analytics.api.ts`.
- Paywall on the brief through `upgradeStore` (403 `TIER_REQUIRED`).

**Share card.** `RealSalaryShareCard` — thin wrapper over `ShareImageCard` (ABA-353 rule).
**Percentages only, never amounts** — salary is the most sensitive number in the app; there is
deliberately no "show amounts" toggle.

## Privacy

- The COICOP classifier sees category names only.
- No salary amounts in logs.
- Tier-2 encrypted accounts get `status: encrypted`.

## Testing

- `real-salary.util.spec.ts` — weights and exclusions, CP01 receipt substitution and its
  10-product threshold, CP00 fallback, real change and required raise formulas, every
  not-enough-data reason.
- `eurostat.client.spec.ts` — parse a recorded JSON-stat fixture.
- Seed-category → COICOP dictionary coverage.
- Cron failure keeps the last stored month.
- Mobile: pure display helpers.

## Docs and i18n

~35 `realSalary.*` keys × 9 locales; a new help section (registered in all three places:
`generate-help-content.js`, `src/help/sections.ts`, `build_help.py`); wiki page
`docs/wiki/features/real-salary.md`.

## Out of scope (v1)

Non-EU official CPI; salary aggregated across several accounts; month-by-month history of
real salary; push when new HICP data lands.
