# Display-currency conversion on the server

*Hub: [ai-features](../ai-features.md)*

## What this is

Anything the server narrates or totals across currencies — chat answers, Fat Finder, the Spending
Story, Wrapped, Safe-to-Spend, Inflation Shield, trip settle-up, analytics and reports — is expressed
in **one** currency: the caller's display currency, `user.currencyCode`. This page is the rule and
the shared helper. (Changing the display currency on the phone is the `setCurrency` flow in
`CLAUDE.md`'s Mobile section.)

## Entry points

- `apps/api/src/common/utils/fx.ts` — `getRatesSafe(provider, base)`, `convertAmount(amount, from,
  base, rates)`; the only home of the formula
- `ExchangeRateService` (`currency-exchange` module) — rates from open.er-api.com, one singleton
- Consumers: `grep -rl "common/utils/fx" apps/api/src/modules`
- Chat: `ai/services/ai-tools.service.ts` (read tools, `buildToolCacheKey`),
  `prompt-builder.service.ts` (the labelling rule), `chat.service.ts` (passes `baseCurrency`)
- `insights/fat-finder.service.ts`, `insights/story.service.ts`

## Key concepts

**The formula**: rates are `1 base = rates[X] X`, so `amount_in_base = amount / rates[from]`.

**Convert every row, then aggregate.** Each service turns its rows into one already-converted array
before summing, grouping or ranking, so every figure downstream reads one currency.

**Flags.** `fxConverted` — something was converted; `fxApproximate` — something was left out because
its rate was unknown, or the provider was down. Both ride on the response; the user-facing
"approximate rate" wording is produced by the model from a prompt instruction, so there are no i18n
keys for it.

**Chat answers are free text**, so labelling is enforced by prompt, not code: every amount carries
its own `currencyCode`, the model must label each amount with it, and must never default to €. The
three read tools — `get_expenses`, `get_budget_status`, `get_category_breakdown` — return amounts
already converted to the display currency.

## Invariants

**The report currency is the caller's display currency, never inferred from a row.** Fat Finder
once took `expenses[0].currencyCode` — the newest row — so a PLN account with one small USD charge
got an audit "in dollars" with PLN, EUR and USD summed blind. The Spending Story took the currency of
its **largest** charge, because its query is ordered by amount. Both now take `baseCurrency` from the
controller.

**An amount with an unknown rate is excluded, not mislabelled**, and sets `fxApproximate`. Rates
are fetched only when the data actually mixes currencies. `getRatesSafe` never throws — a provider
outage must not fail the feature.

**New FX code imports `fx.ts`; it does not add a private copy.** The formula had been hand-copied
into five services before they were consolidated. `ai-tools.service.ts` keeps a thin private
`getRatesSafe(base?)` wrapper only for its optional-base short-circuit; it delegates to the shared
one.

**A cached result is valid only in the currency it was computed in.**
- The chat tool cache key includes `baseCurrency`: it is per user, and two members of one account
  with different display currencies must not share a converted result.
- A Fat Finder row cached in another currency is regenerated instead of served — which is also how
  rows stored before the fix heal themselves instead of living out their 30-day TTL.
- `SpendingStory.currencyCode` is part of the story's cache check; a pre-migration `null` counts as
  a mismatch.

**`get_category_breakdown` computes from raw expenses**, grouping and converting each — not from
`analyticsService.getSummary`, which sums across currencies into one number that cannot be converted
afterwards.

**Budget figures convert; ratios do not.** `BudgetsService.getProgress` reports in the budget's own
currency, so the story converts both budget amounts — but `percentUsed` is a ratio and must not be
converted. The story's top-five list is re-sorted by the **converted** amount.

## Known gaps

- `reports/report-scheduler.service.ts` still carries a private `convertAmount` that, on an unknown
  rate, **returns the raw amount** and adds it to the target-currency total — the mislabelling the
  shared helper exists to prevent. Found 2026-09-24.
- The always-present `UserContext` numbers in the chat system prompt (`totalSpentThisMonth`,
  `topCategories`) are still summed natively; the prompt tells the model to use tools for accurate
  amounts.

## History

ABA-263 (chat labelling and conversion) · ABA-386 (Fat Finder currency) · ABA-387 (Spending Story
currency, `common/utils/fx.ts`) · the `fx-rate-conversion-helper-quintupled` tech-debt item (the
five remaining copies migrated).
