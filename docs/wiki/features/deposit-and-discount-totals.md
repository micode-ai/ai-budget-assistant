# Deposit and discount totals

*Hub: [ai-features](../ai-features.md) · [analytics-insights](../analytics-insights.md) · related:
[receipt-category-split](receipt-category-split.md)*

## What this is

Answers to "how much have I paid in bottle deposits" and "how much did I save in discounts", from the
AI chat (`get_deposit_total`, `get_discount_total`) and from two tappable rows on the Analytics tab
that open a breakdown sheet. All of them read the `Expense.depositAmount` / `Expense.discountAmount`
columns that receipt OCR fills in.

## Entry points

- `apps/api/src/modules/ai/utils/deposit-summary.ts` — `summariseDeposits`
- `apps/api/src/modules/ai/utils/discount-summary.ts` — `summariseDiscounts`
- `apps/api/src/modules/analytics/analytics.service.ts` — `getDepositRows`/`getDiscountRows` (IO),
  `getDepositSummary`/`getDiscountSummary` (drill-down)
- `GET /analytics/savings-detail?kind=discount|deposit` — `analytics.controller.ts`
- `apps/api/src/modules/ai/services/ai-tools.service.ts` — the two chat executors
- `apps/api/src/modules/ai/services/prompt-builder.service.ts` — routing rules, local words
- Mobile: `components/analytics/QuickInsights.tsx` (`onOpenSavings`), `SavingsDetailSheet.tsx`,
  `hooks/useSavingsDetail.ts`, `components/chat/ActionResultCard.tsx`
  (`DepositTotalResult`, `DiscountTotalResult`)
- Contract: `docs/contracts/quick-insights-savings-drilldown.md`

## Key concepts

**Read the column, never the category.** A deposit category exists only when
`buildCategorySplits` actually produced a split — it refuses below two resulting categories, or when
the lines miss the receipt total by more than 5% — so on exactly the trips where the deposit is the
whole question there was nothing to find. Answering through the category also made the model guess
its name in the **account owner's** language plus a date range. A discount is never its own category
at all: the split spreads a basket-wide discount across the item groups. Reading a number makes the
answer independent of region by construction — one code path serves all nine locales.

**The prompt carries the local word.** `kaucja`/`Pfand`/`statiegeld`/`consigne`/`залог за тару` (and
the loanword `кауция` a Russian speaker in Poland uses); `rabat`/`zniżka`/`opust`, `Rabatt`,
`korting`, `réduction`/`remise`, `descuento`, `скидка`, `знижка`, `зніжка`. The discount rule also
separates it from `get_inflation_shield` (future prices) and `get_shopping_suggestions` (deals today).

**Arithmetic is pure; IO returns rows, not a total.** The aggregation needs the caller's display
currency and FX rates, which live in the caller. Both utils return a display-currency total, receipt
count, native `totalsByCurrency`, top-5 stores and 5 recent receipts; the payee is
`merchant || description`.

**The drill-down reuses the chat's machinery.** `getDepositSummary`/`getDiscountSummary` call the
same row queries, the same pure utils and the shared `common/utils/fx.ts`. The AI executors were left
with their own ~15 lines of FX glue on purpose — their specs mock the row methods directly, and the
duplicated parts (the query and the arithmetic) are what is now shared. `ExchangeRateService` is an
**optional** constructor parameter on `AnalyticsService` so its many existing `new
AnalyticsService(prisma, cache)` test call sites keep compiling.

## Invariants

**Never sum a currency with no rate.** Such a row is excluded and counted in `unconvertedCount`; a
row already in the display currency needs no rate, so a single-currency account is exact even with
the rate provider down.

**Truncation must be detectable.** The row queries take `ROW_LIMIT + 1` (5 000): a date window bounds
the range, never the row count. They filter `amount > 0` (which excludes NULL), `isDeleted`,
`isPlanned` and `EXCLUDE_SPLIT_RECEIVABLE`.

**Default period is all history.** A narrow default window is the known first cause of "found
nothing", and a deposit question is almost never scoped to a month.

**Bust the cache per tool.** `invalidateExpenseChatCache` lists tools individually rather than
clearing a blanket `chat:` prefix; without `chat:get_deposit_total:` and `chat:get_discount_total:`
there, a receipt scanned right after the question serves a ten-minute-stale total.

**Both are read actions** — not in `isWriteAction`, riding the generic cached `handleReadAction`
path with no `chat.service.ts` branch.

**Say "already paid", never "refundable".** Returned packaging is tracked nowhere, and the figure
includes deposits on bottles long since returned. Likewise a discount total is not a promise of
future deals. This binds in every language, and the drill-down sheet's honesty note mirrors the
prompt verbatim.

**A tier-2 (fully encrypted) account is refused.** For discounts this is structural:
`discountAmount` is in `ENCRYPTION_FIELDS.expense.tier2`, so the plaintext column is zeroed. For
deposits it is policy — `depositAmount` is in **neither** tier today, which is a privacy gap to
close, not a data source to build on (and such an account's merchant text is ciphertext anyway).

**The result cards render `null` for an encrypted account or a zero total**, where the assistant's
sentence says which it is and a "0.00" card would contradict it. Counts render as `×2`, so no plural
forms are needed. The Analytics rows are additive-only: `onOpenSavings` absent means a plain card,
which is what the desktop `InsightsCluster` (its own tile markup) gets.

**The chat card's own "recent" receipts are tappable through to `/expense/:id` (ABA-605).** Both
tools already returned `data.recent` (each row optionally carrying `expenseId`); `ActionResultCard.tsx`
never rendered it. `DepositTotalResult`/`DiscountTotalResult` now render it via one shared
`RecentReceiptsSection`, disabled/no chevron when a row has no `expenseId` — the same interaction
`SavingsDetailSheet.tsx` already used for the Analytics-tab drill-down, so the chat card and the
Analytics sheet read as one mechanism rather than two. No new backend field.

## Known gaps

- No backfill: receipts scanned before the columns existed are NULL, and the printed figure is not
  recoverable from a stored image.
- Only a scanned receipt carries a discount; manual entries and bank/Wise imports never do.
- `depositAmount` needs to join `ENCRYPTION_FIELDS.expense.tier2` and both `maybeEncrypt` call sites,
  in one change.
- No return tracking, so "how much can I get back" is unanswerable by design.
- The plain Analytics-tab `totalDiscountSavings` number is still a separate client-side computation;
  only the tap-through shares the server path.
- `ALL_TIME_START` is defined twice (`ai-tools.service.ts`, `analytics.controller.ts`).

## History

ABA-516 (deposit tool) · ABA-569 (discount tool) · ABA-576 (Analytics drill-down) · ABA-605 (chat
card's own recent-receipts tap-through).
