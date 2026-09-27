# Real salary

*Hub: [analytics-insights](../analytics-insights.md) · related:
[personal-inflation-index](personal-inflation-index.md), [inflation-shield](inflation-shield.md),
[budgets](budgets.md)*

## What this is

Answers "is my raise keeping up with what my own money buys": the caller's own confirmed salary
income series (nominal pay change, 12 months vs the prior 12), weighed against a personal inflation
rate built from official Eurostat HICP data for their country plus their own scanned-receipt price
index for groceries, weighted by the account's own spend across COICOP divisions. Free for every
tier (`GET /insights/real-salary`, same precedent as safe-to-spend/wrapped/inflation-shield); only
the one-page PDF "brief" download (`POST /insights/real-salary/brief`) is Pro-gated
(`SubscriptionTierGuard` + `@RequireTier('pro')`).

## Entry points

- `apps/api/src/modules/insights/real-salary/real-salary.service.ts` — `RealSalaryService.compute`
  (the assembly), `getProfile`/`saveProfile`/`listCategories`, `bustAccount`
- `apps/api/src/modules/insights/real-salary/real-salary.util.ts` — pure
  `computePersonalInflation`/`realChange`/`round1`/`annualiseHalfYearPct`
- `apps/api/src/modules/insights/real-salary/salary-detect.util.ts` — pure `findSalaryCandidates`
  (setup-screen suggestions), `nominalChange`, `salaryKeyOf`/`descriptionKey`, `isSalaryEligible`
- `apps/api/src/modules/insights/real-salary/official-inflation.service.ts` — the only writer of
  `official_inflation_rates`; `apps/api/src/modules/insights/real-salary/eurostat.client.ts` —
  `EurostatClient.fetchLatest`/`parseJsonStat` (JSON-stat 2.0)
- `apps/api/src/modules/insights/real-salary/coicop.ts` — `DIVISIONS`, `isDivision`,
  `divisionForSeedIcon`, `countryFromTimezone`, `isEurostatCountry`, `divisionLabel` (9 languages)
- `apps/api/src/modules/insights/real-salary/coicop-classifier.service.ts` —
  `CoicopClassifierService.ensureClassified`
- `apps/api/src/modules/insights/real-salary/real-salary.validation.ts` — `validateSalaryProfile`,
  `validateInflationCountry`
- `apps/api/src/modules/insights/real-salary/real-salary-brief.pdf.ts` — `RealSalaryBriefPdf`,
  `sourcesLine`
- `apps/api/src/modules/insights/insights.controller.ts` — `GET /insights/real-salary`,
  `GET`/`PUT /insights/real-salary/profile`, `GET /insights/real-salary/categories`,
  `POST /insights/real-salary/brief`
- `apps/api/src/modules/categories/categories.controller.ts` / `categories.service.ts` —
  `coicopDivision` on `PATCH /categories/:id` (the system-category guard, the cache bust)
- `apps/api/src/modules/users/users.controller.ts` — `inflationCountry` on `PATCH /users/me`
- Schema: `apps/api/prisma/schema.prisma` — `SalaryProfile`, `OfficialInflationRate`,
  `Category.coicopDivision`, `User.inflationCountry` (migration `20260927000000_add_real_salary`)
- Shared types: `packages/shared-types/src/dto/real-salary.ts`
- Design spec: `docs/superpowers/specs/2026-09-26-real-salary-design.md`
- `apps/mobile/app/real-salary/index.tsx` — the hero screen (real change, pay vs
  inflation, breakdown, share, brief download), `apps/mobile/app/real-salary/setup.tsx` —
  confirm the salary candidate + last year's manual figure, `apps/mobile/app/real-salary/settings.tsx` —
  country + per-category price group. All three routes registered in `apps/mobile/app/_layout.tsx`.
- `apps/mobile/src/features/insights/useRealSalary.ts` — the index screen's data hook (see
  **Invariants**); `apps/mobile/src/features/insights/realSalary.ts` — pure helpers
  (`formatSignedPct`, `toneOf`, `statusCopy`, `requiredRaiseKey`, `buildShareLines`,
  `parseMonthlyAmount`, `manualCurrency`, `briefErrorKind`); `apps/mobile/src/services/realSalary.api.ts`
- `apps/mobile/src/components/real-salary/` — `RealSalaryShareCard.tsx` (thin `ShareImageCard`
  wrapper, ABA-353 convention), `CountryPickerSheet.tsx`, `DivisionPickerSheet.tsx`
- Entry points into the screen: a banner in the Analytics tab on both mobile
  (`AnalyticsMobile.tsx`) and desktop web (`analytics/desktop/DiscoveryRow.tsx`), both reading
  `realSalary.entryTitle`/`entrySub` and pushing `/real-salary`.

## Key concepts

**The dataset is `prc_hicp_minr` / `coicop18` / `TOTAL`.** `EurostatClient.fetchLatest` queries
`prc_hicp_minr` (monthly annual-rate-of-change HICP) for every `coicop18` division plus `TOTAL`,
one country geo per row — the older `prc_hicp_manr` (annual average) dataset had frozen at 2025-12
and would never move again. `parseJsonStat` walks JSON-stat 2.0's row-major flat `value` index
against each dimension's `size`, and drops anything that isn't a single supported country
(aggregates like `EU27_2020`) or a known division or a `YYYY-MM` month.

**User requests never call Eurostat.** `OfficialInflationService` is the only writer of
`official_inflation_rates`: a `@Cron('0 6 1,15 * *')` twice-monthly refresh (Eurostat publishes
mid-month; the 1st and 15th catch every release within ~2 weeks) plus a one-time
`onApplicationBootstrap` boot fill that runs **only when the table is empty**, fire-and-forget —
so a fresh deploy doesn't wait up to two weeks for its first data, and a bootstrap that fires on
every restart never re-runs once rows exist. `refresh()` never throws either way it can fail — a
failed `fetchLatest()` or a failed `$transaction` write both log a warning and return `0`, keeping
whatever was already stored; `RealSalaryService.compute` reading a month-old row is silent (the
response's `dataMonth` is the only visible symptom).

**Salary is grouped by category + normalised description + currency, never amount.**
`salaryKeyOf` = `` `${categoryId ?? ''}|${descriptionKey(description)}|${currencyCode}` ``, where
`descriptionKey` lowercases and strips digits/punctuation ("Salary 09/2026" and "Salary 10/2026"
key the same) — grouping on amount would split a series the moment a raise actually happens, which
is the one event this feature exists to detect. Detection (`findSalaryCandidates`, used by the
setup screen) requires **2+ occurrences within 90 days at a 20–40 day cadence** (wide enough that a
payday shifted across a weekend or a public holiday doesn't break the series) and **collapses
same-day duplicates** first (same salary key, same UTC calendar day, same amount) so a
double-entered salary neither breaks detection nor inflates the measured change.
`isSalaryEligible` excludes debts (`isDebt`/`isDebtRepayment`) and inbound account transfers
(`clientId` starting `transfer-income-`, the convention `account-transfers` writes) — neither is
pay.

**Nominal pay change** (`nominalChange`) compares the mean salary **per pay period** of the
confirmed `salaryKey`'s rows over the last 12 months against the 12 before that. Inside each window
the rows are sorted by date and grouped into pay periods — a row less than 15 days after the first
row of the current period joins it (a split salary, two amounts on one day), otherwise it opens a
new one — and the mean is the window total ÷ the number of periods. Calendar months would not do:
a salary paid on the 1st and moved to the previous working day when the 1st is a weekend or holiday
puts two payments in one month and none in the next, and "sum ÷ months with a payment" read that
flat salary as ±10–12 %. Each window needs **at least 3 pay periods** (`MIN_PERIODS_PER_WINDOW`);
below that, the prior window falls back to the user's manual `SalaryProfile.manualPreviousMonthly`
figure if one was entered, else the status is `salary_history_short`. **Everything is in the
salary's own currency, with no FX conversion**: every row of one salary key shares a currency by
construction (the key includes it), and `manualPreviousMonthly` is typed in that same currency —
comparing it against a mean converted to the base currency once turned 2000 EUR vs PLN into
+350 %. FX conversion is used only for spend weights.

**Spend is classified into COICOP divisions.** `CoicopClassifierService.ensureClassified` runs
before every `compute()`/`listCategories()` call: seed categories map by their (language-stable)
icon (`divisionForSeedIcon`); the rest — up to `CLASSIFY_BATCH` (50) uncategorized categories per
call — go to a cheap OpenAI model that sees **only the category names**, one JSON-object call per
account, stores every answer (an invalid or missing one as `TOTAL`) so a category is asked about at
most once, and is **not charged to the user's AI limit** (no `AiUsageGuard`/`@TrackAiUsage` in the
path — it's a small one-time backfill, not a per-request feature). A failed call leaves affected
categories `null` to retry on the next request. `RealSalaryService.loadSpend` then buckets every
expense (and, honouring the codebase's one split-attribution rule via `attributeToCategories`, every
category-split share) by its category's `coicopDivision`, or `TOTAL` when the category has none or
the expense has no category at all. The spend query already excludes debts, debt repayments,
planned expenses and split-receivables (`isDebt`/`isDebtRepayment`/`isPlanned`/`isSplitReceivable`
all `false`) — none of those are money the user actually spent.

**The personal inflation rate** (`computePersonalInflation`, `real-salary.util.ts`) is a
Laspeyres-style weighted mean over the account's own spend, `Σ(weight × rate) / Σweight`: CP01
(food) is priced from `PriceHistoryService.getPriceHistory('12m').inflationIndex` **only** when it
rests on at least `RECEIPT_MIN_PRODUCTS` (10) products — and only after `annualiseHalfYearPct`
turns it into a year-on-year figure: that index compares mean prices in [12..6 months ago] with
[6 months ago..now], window midpoints ~6 months apart, so it is a half-year change and is
compounded, `(1 + p)² − 1`, before it stands in for Eurostat's year-on-year rate; every other division, and CP01 itself below
that floor, is priced from the official rate for that division, falling back to the country's
`TOTAL` rate when the division has no official cell of its own — **never 0**, since an unpriced
division silently reading as "no inflation" would understate the answer. **Non-finite official or
receipt rates are treated as absent**: a non-finite per-division rate falls back to `TOTAL` the same
as a missing one, and a non-finite `TOTAL` itself means there is no usable official data at all for
that country/month (`hasOfficial` is false). Returns `null` — surfaced as `no_inflation_source` —
when nothing could be priced (no official coverage for the country and under 10 receipt products).

**Real change and the required raise.** `realChange` divides rather than subtracts —
`realChangePct = (1+nominal/100)/(1+inflation/100) − 1`, `requiredRaisePct` is the same ratio
inverted, i.e. **on current pay**, not on the old figure.

**Status ladder.** `RealSalaryResponse.status` is `encrypted` → `no_salary_confirmed` →
`salary_history_short` → `spend_under_3_months` → `no_inflation_source` → `ready`, checked in that
order in `compute()`; every non-`ready` status still returns whatever it already resolved
(`country`/`countryGuessed`/`fxApproximate`) so the client can say why, not just that it failed.

**Country resolution.** An explicit `User.inflationCountry` (validated against
`isEurostatCountry` — EU/EEA/Switzerland; Greece is spelled `EL`) wins; otherwise
`countryFromTimezone` maps the user's IANA timezone to a country and the response sets
`countryGuessed: true`. One rule holds in **every** status: `country` is that resolved country
(explicit, else the timezone guess, else `null`) and `countryGuessed = !explicit && country !== null`
— it is not nulled when no official data exists for it. A receipts-only answer is recognisable by
`dataMonth: null` instead, and the brief's sources line then says "receipts only — no official
data" rather than citing Eurostat (`sourcesLine`).

## Invariants

**The encryption-tier check runs BEFORE the cache read.** A tier-2 (full-encryption) account must
never be served a cached answer computed before encryption was turned on — `compute()` fetches
`Account.encryptionTier` and short-circuits to `status: 'encrypted'` first, and only then reads the
Redis cache.

**Cache is keyed per (account, user, currency): `rs:{accountId}:{userId}:{currency}` (TTL 3600s),
and only a `ready` answer is ever cached.** The answer depends on the CALLER's own `SalaryProfile`
and `inflationCountry`, not the account's — an account-only key would leak one shared-account
member's salary/country result to every other member reading the same key. External busts operate
on the account **prefix** `rs:{accountId}:` (`CacheService.delByPrefix`, a `SCAN`, not `KEYS`),
which clears every member's cached answer for that account at once: `saveProfile` (`PUT
/insights/real-salary/profile`, one account), `PATCH /categories/:id` when `coicopDivision` is in
the body, and `PATCH /users/me` when `inflationCountry` **or `timezone`** is in the body (the country is
guessed from the timezone) — the latter loops over **every account the user belongs to**
(`UsersService.listAccountIds`), since a user's own country affects their answer in every
account they're a member of, not just the one they happened to be in when they changed it.

**`coicopDivision` can only be set on an ACCOUNT category.** `CategoriesService.update` throws
`ForbiddenException` when `dto.coicopDivision !== undefined` and the target category is a system
category (`accountId === null`) — a system category is shared across every account, and
`RealSalaryService.loadSpend` reads `coicopDivision` account-wide, so one account's editor setting
it would silently change every other account's spend weights too. Every other field on a system
category (rename, recolor, even soft-delete) is deliberately unaffected by this guard.

**The classifier sees category names only**, never amounts or merchant data (its client has a
10 s timeout, no retries, and a 400-token completion cap), and an unresolved or
invalid model answer is stored as `TOTAL` rather than left to retry forever — a category is asked
about at most once per account (until its `coicopDivision` is cleared, which nothing currently
does).

**A missing division rate falls back to the country's `TOTAL` rate, never to 0** — both when the
official data has no cell for a division and when the CP01 receipt index exists but is below the
10-product floor.

**`OfficialInflationService.refresh()` never throws** — a failed Eurostat fetch and a failed
Postgres write are both caught and logged, keeping whatever was already stored; the boot fill
(`onApplicationBootstrap`) runs only when `officialInflationRate.count() === 0`, so a normal restart
with data already present never re-fetches.

**The brief PDF (`RealSalaryBriefPdf.render`) uses no LLM** — every number is read straight off the
already-computed `RealSalaryResponse` — and refuses to render a response whose `status !== 'ready'`
(the controller turns that rejection into `409` with `{ message, status }` before any PDF work
starts). All 9 app languages render through the one `Inter`/`Inter-Bold` font pair already
registered for reports (`pdf-generator.ts`'s `FONT_REGULAR`/`FONT_BOLD`) — Cyrillic and Polish
glyph coverage was checked by eye; the covering test only asserts a valid `%PDF-` header and a
plausible byte length, not glyph rendering.

**The mobile screens are online-only by design** (`useRealSalary.ts`'s own doc comment says so) —
the answer is computed and cached server-side, there is no SQLite mirror and no offline fallback
value, unlike most of this app's other data. A load failure is a retry button, not a stale number.

**All three mobile screens (`index`, `setup`, `settings`) guard against an account switch
mid-request the same way**: the account id is captured at request time, a `useEffect` on
`currentAccountId` clears the previous account's local state immediately (so nothing stale is
tappable while the new load is in flight), and every `then`/`catch`/`finally` re-checks
`useAccountStore.getState().currentAccountId` against the captured id before writing state —
a response that arrives after the user has switched accounts is discarded rather than painted
into the new account's screen. `setup.tsx`/`settings.tsx` additionally clear the picked
selection/local edits on switch, since a stale selected `salaryKey` or open division picker
would otherwise still be interactable against the wrong account for one frame.

**The share card is percentages-only — the same rule as Financial Wrapped and Inflation Shield.**
`buildShareLines` (`realSalary.ts`) emits exactly three `formatSignedPct` values (real change, pay
change, personal inflation) and nothing else; there is no amount, salary figure, or spend total in
the payload `RealSalaryShareCard`/`ShareImageCard` render or in the plain-text `Share.share`
fallback. This is deliberate, not an oversight of the wrapped-payload shape: real-salary is the one
share surface in the app whose whole point is comparing yourself against your own history without
ever showing what you earn.

**`parseMonthlyAmount` (last year's manual salary figure, `setup.tsx`) accepts the same European
number formats users actually type, not just `Number()`-parseable ones**: comma OR dot as the
decimal separator, and dot/comma/space/NBSP/apostrophe as a thousands grouping mark — `8400`,
`8.400`, `8 400`, `8'400`, and `8,400.50` all parse to the same value class. When both `.` and `,`
appear, the LATER one in the string is treated as the decimal point and the earlier one must form a
valid 3-digit thousands grouping or the whole input is rejected (`8.4.0` does not parse; `84.00,5`
does not either, since `00` isn't a 3-digit group). Empty input parses to `null` (a valid "nothing
entered" answer, distinct from `NaN` for genuinely unparseable text) — callers must not conflate
the two.

## Known gaps

- **No official CPI outside the EU/EEA/Switzerland.** `EUROSTAT_COUNTRIES` is exactly Eurostat's
  `prc_hicp_minr` single-geo list; a user elsewhere gets `country: null` and, absent 10+ receipt
  products, `no_inflation_source`.
- **Salary is per account, not aggregated across a user's accounts.** `SalaryProfile` is unique on
  `(userId, accountId)` and `compute()`'s spend query is scoped to one `accountId`; a user who splits
  income or spend across multiple accounts sees only the picture inside whichever account they ask
  from.
- **No route-level test coverage for the brief's `409`/headers or the cache busts.**
  `real-salary.routes.spec.ts` (despite its name) only exercises the pure
  `validateSalaryProfile`/`validateInflationCountry` functions; nothing drives an HTTP request
  through `InsightsController`/`CategoriesController`/`UsersController` to assert the `409` body,
  the `Content-Disposition`/`X-Report-Filename`/`Content-Length` headers, or that a profile save,
  a `coicopDivision` edit or an `inflationCountry` edit actually clears a warm cache end-to-end.
- **Tier-1 encrypted accounts detect salary by category only.** Tier-1 encryption strips income
  descriptions and category names from the server, so `descriptionKey` is empty for every row —
  salary series group by category + currency alone — and the COICOP classifier sees empty or
  placeholder names (its answers for those categories are likely `TOTAL`).
- **Expenses in global system categories stay weighted as `TOTAL`.** A system category
  (`accountId === null`) is not classified per account and its `coicopDivision` cannot be set
  (`PATCH /categories/:id` returns 403), so its spend is priced at the national `TOTAL` rate.

## History
[ABA-608](https://github.com/micode-ai/ai-budget-assistant/issues/633) — API half. [ABA-609](https://github.com/micode-ai/ai-budget-assistant/issues/635) — mobile half (screens, setup, settings, share card, brief download, help section).

Built as one task set against `docs/superpowers/specs/2026-09-26-real-salary-design.md`: the
Eurostat HICP client and the cron-fed `official_inflation_rates` table · COICOP division seed-icon
mapping and the AI classifier · cadence-tolerant, duplicate-collapsing salary-series detection · the
pure inflation/real-change formulas · `RealSalaryService.compute` assembling salary, spend and
inflation into one response · the per-user cache key and the encryption-tier gate · the nine-language
PDF brief · the routes, the `coicopDivision` category field and the user's `inflationCountry` · the
system-category guard on `coicopDivision`. No ABA issue yet — one is filed by `finish-aba-task` once
the mobile half (plan 2) ships, per that plan's own closing note.
