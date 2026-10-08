# Financial Wrapped

*Hub: [analytics-insights](../analytics-insights.md) · related: [personal-inflation-index](personal-inflation-index.md),
[display-currency-conversion](display-currency-conversion.md), [safe-to-spend](safe-to-spend.md)*

## What this is

A Spotify-Wrapped-style year in review: a full-screen deck of swipeable cards — how much was
tracked, the most-visited merchant, the biggest month, the top category, receipts scanned,
savings, personal inflation, the tracking streak — plus a share image. It is built for
shareability, so it is free on every tier, and it is assembled entirely from data the account
already has: no new table, no model call.

A **monthly** deck (ABA-641) is the same mechanism for one month, pushed on the 1st for the month
just ended — twelve reasons a year to come back and share instead of one.

## Entry points

- `apps/api/src/modules/insights/wrapped.service.ts` — `WrappedService.getWrapped`: the IO (one
  query for this year and the prior one, rates, price history, streak) and the cache
- `apps/api/src/modules/insights/wrapped.util.ts` — `assembleWrapped`, the pure assembler, with
  `MIN_TRACKED_ROWS`, `CATEGORY_MIX_LIMIT`, `RECEIPT_SOURCES`
- `apps/api/src/modules/insights/wrapped-monthly.util.ts` — `assembleMonthlyWrapped`, the monthly
  assembler (`MIN_HABIT_VISITS`); it shares `rankCategories` and the thresholds with `wrapped.util.ts`
- `apps/api/src/modules/insights/monthly-wrapped-notify.cron.ts` — the 1st-of-month push
- `apps/api/src/modules/insights/insights.controller.ts` — `GET /insights/wrapped?year=YYYY[&month=M]`
- `packages/shared-types/src/dto/insights.ts` — `WrappedResponse`, the `WrappedCard` union
- Mobile: `apps/mobile/app/wrapped/index.tsx` (the deck), `apps/mobile/src/features/insights/useWrapped.ts`,
  `apps/mobile/src/services/analytics.api.ts` (`getWrapped`),
  `apps/mobile/src/components/wrapped/WrappedShareCard.tsx`, the entry banners in
  `apps/mobile/src/components/analytics/AnalyticsMobile.tsx` and the desktop
  `analytics/desktop/DiscoveryRow.tsx`, `src/features/insights/previousMonth.ts`

## Key concepts

### The endpoint

`GET /insights/wrapped?year=YYYY` — `JwtAuthGuard + AccountContextGuard`, no tier guard. A
missing, unparseable or out-of-range year (below 2000 or after the current year) becomes the current
year. The base currency is the caller's `user.currencyCode`.

### Assembly

`WrappedService` fetches, `assembleWrapped` decides. The assembler is pure — rows, rates and the
clock are injected — so it is unit-tested directly (`wrapped.util.spec.ts`).

- **Enough data**: fewer than `MIN_TRACKED_ROWS` expenses + incomes in the year → `hasEnoughData:
  false` and an empty `cards` array. An account at `encryptionTier >= 2` gets the same empty
  response without a query — its amounts are ciphertext on the server.
- **Cards are an ordered discriminated union**, and only cards that have data are included: `intro`,
  `total_tracked`, `top_merchant` (most visits, ties broken by spend), `biggest_month`,
  `top_category`, `category_mix` (top `CATEGORY_MIX_LIMIT`), `receipts_scanned` (expenses whose
  `source` is in `RECEIPT_SOURCES` — `ocr` and `notification`), `savings` (net, rate,
  `savedVsLastYear` from the prior year already in the same query), `personal_inflation`, `streak`,
  `outro`.
- **Personal inflation** reuses `PriceHistoryService.getPriceHistory(accountId, '12m').inflationIndex`
  ([personal-inflation-index](personal-inflation-index.md)). That window is relative to *now*, so the
  card is only produced for the current or the just-ended year. `PriceHistoryModule` exports the
  service and `InsightsModule` imports it (and `GamificationModule` for `StreakService.getStreak`).
  A failure in either lookup drops that card, not the deck.
- **Currency**: every amount is converted to the base; an amount whose rate is unknown is excluded
  from the sums and sets `fxApproximate`.

### The monthly deck (ABA-641)

`?month=1..12` beside `year` returns the monthly deck; a month in the future becomes the current one.
`WrappedService.getMonthlyWrapped` fetches that month and the one before in one query (same spend
exclusions as the yearly deck), and `assembleMonthlyWrapped` builds it. The response carries
`month`, as do its `intro` and `outro` cards — that is how the client knows which titles to use.

- **Its own cards**: `vs_last_month` (change in percent, only when last month had spend),
  `biggest_purchase` (largest single converted expense), `busiest_weekday` (weekday with the most
  spend, JS `getDay` numbering). It reuses `total_tracked`, `top_category`, `category_mix`,
  `receipts_scanned`, `streak`, and `top_merchant` — the latter only from `MIN_HABIT_VISITS`, since
  one visit is not a habit.
- **`savings` only when the month had income**, and with `savedVsLastYear: null`: a month with no
  income would read as "you spent more than you earned" by the whole spend. No `biggest_month` and
  no `personal_inflation` — neither means anything inside one month.
- **The push** (`MonthlyWrappedNotifyCron`, `0 9 1 * *`): users with `notifyMonthlyWrapped`, a push
  token and a `defaultAccountId`, streamed with `paginateById`. One push per user, for the default
  account only (a member of several accounts would otherwise get one per account), in that user's own
  currency, and only when the deck `hasEnoughData` — the push must never open an empty screen.
  Computing the deck in the cron also warms the cache for the tap. Deduped through
  `InsightNotificationLedger` under `wrapped:{userId}:{YYYY-MM}`. Push `type: 'monthly_wrapped'`
  with `year`/`month` routes to `/wrapped` in `services/notifications.ts`; opt-out is the
  `monthlyWrapped` notification preference.
- **Entries**: a **Month in review** banner on the Analytics tab (and a tile in the desktop
  `DiscoveryRow`) always opens the month just ended (`previousMonthParams`).

### Caching

Redis `wrapped:{accountId}:{baseCurrency}:{year}`, TTL 3600 s; a monthly deck uses
`{year}-{MM}` as the period (`wrappedCacheKey(..., month)`).

### Mobile

`app/wrapped/index.tsx` is registered as a `fullScreenModal` in `app/_layout.tsx` and opened from a
banner on the Analytics tab with the selected year. It is a paging `ScrollView` over
`expo-linear-gradient` cards with progress dots — no new native module. Sharing:

- **text** — `Share.share({ message })` composed from `wrapped.share*` strings;
- **image** — `WrappedShareCard`, a thin wrapper (gradient, `wrapped-<year>.png` prefix, payload
  shape) over the generic `ShareImageCard` (see `CLAUDE.md`, *Share image mechanism*). Its
  `.web.tsx` sibling is a no-op.

A **hide amounts** toggle masks every figure in both share paths through the same `money()`
helper, so the text and the image cannot disagree about what is hidden. Copy is the `wrapped.*`
namespace in all nine locales.

## Invariants

- **Free, no tier guard.** Wrapped is a growth surface; gating it removes the reason it exists.
- **Only cards with data are sent**, and the client renders what it receives. A card with an empty
  value would put "0" or "—" into a screenshot meant to be shared.
- **The assembler stays pure.** All IO lives in `WrappedService`, so the card logic is testable
  without Prisma or a clock.
- **The cache key carries currency and period** — the account is shared, the display currency is per
  user, and a month must never be served as the year.
- **The monthly push fires only for a deck with data**, once per user per month.
- **Hide-amounts goes through one masking helper** for both share paths.
- **The expense query excludes planned expenses and split receivables, not debt rows** — the same
  spend definition as budgets and analytics. A planned expense (`isPlanned`, see
  [purchase-requests](purchase-requests.md)) has not happened, and a split receivable
  (`EXCLUDE_SPLIT_RECEIVABLE`) is money that already left as the receipt; a standalone lent-money
  row is a real outflow and stays in (ABA-626).

## Known gaps

- At `encryptionTier` 1, `merchant` is encrypted on the device and nothing on the server path
  decrypts it, so `top_merchant` groups ciphertext.
- `personal_inflation` for the just-ended year is really the last 12 months from today, not that
  calendar year.
- Deferred: a seasonal home widget, and a home-screen card for the monthly deck in the first days of
  the month (today the push and the Analytics banner are the only entries).
- The monthly push uses server-local time for "the month just ended", like the deck's date ranges;
  for a user far from the server's timezone the edges of the month shift by their offset.

## History

- ABA-336 — the endpoint, the assembler, the deck and text sharing; the share image followed.
- ABA-353 — the share image moved onto the shared `ShareImageCard` mechanism.
- ABA-641 — the monthly deck, its 1st-of-month push and opt-out, and the Analytics entries.
