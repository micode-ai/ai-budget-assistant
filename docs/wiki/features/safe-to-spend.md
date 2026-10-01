# Safe-to-Spend and the affordability check

*Hub: [analytics-insights](../analytics-insights.md) · related: [chat-architecture](chat-architecture.md),
[goals](goals.md), [subscription-manager](subscription-manager.md),
[display-currency-conversion](display-currency-conversion.md)*

## What this is

One number: how much the user can spend **today** without running short before the next income
or the end of the month, after the bills, recurring expenses and goal savings already ahead of
them. It is the home screen's hero figure, and the same engine answers "can I afford X?" in the AI
chat. It is deterministic — no model computes it — and free on every tier.

## Entry points

- `apps/api/src/modules/insights/safe-to-spend.service.ts` — `SafeToSpendService.compute`,
  `checkAffordability`, `safeToSpendCacheKey`
- `apps/api/src/modules/insights/safe-to-spend.util.ts` — `computeSafeToSpend`, the pure formula
  (API copy)
- `packages/shared-utils/src/formatting/index.ts` — the mirror copy of `computeSafeToSpend` the app
  uses offline
- `apps/api/src/modules/insights/insights.controller.ts` — `GET /insights/safe-to-spend`
- `apps/api/src/modules/ai/services/ai-debt-goal-tools.service.ts` — `executeCheckAffordability`,
  the `check_affordability` chat tool
- `packages/shared-types/src/dto/insights.ts` — `SafeToSpendResponse`, `SafeToSpendBreakdown`,
  `AffordabilityVerdict`
- Mobile: `apps/mobile/src/features/insights/useSafeToSpend.ts`,
  `apps/mobile/src/stores/insightsStore.ts` (`loadSafeToSpend`),
  `apps/mobile/src/components/home/HomeHeroHeader.tsx`,
  `apps/mobile/src/components/home/SafeToSpendSheet.tsx`,
  `apps/mobile/src/components/chat/ActionResultCard.tsx`

## Key concepts

### Inputs

All computed from existing tables — there is no table of its own and no migration.

| Input | Source |
|---|---|
| Wallet balance | `WalletService.getSummary(accountId)`, every currency converted to the base |
| Expected income | income of the last 90 days; a series counts as monthly when its gaps fall in 25–35 days with at least two occurrences (the same cadence rule as anomaly's `recurring_suggestion`) |
| Upcoming subscriptions | active `UserSubscription` rows, `nextRenewalDate` walked forward by billing cycle through the horizon |
| Upcoming recurring expenses | the newest expense per `recurringId`, next due date by `recurringPeriod` (same grouping as `expense-recurring.cron.ts`), split receivables excluded |
| Goal contributions | every active goal with money still to save and a future deadline, at a linear daily pace to its deadline, for the days in the horizon |
| Buffer | `0` in v1 |

### Horizon and formula

The horizon is the **earlier** of the end of the current month and the next expected income date
(only when an income series was inferred); `daysRemaining` counts today through the horizon,
minimum 1.

```
projectedAvailable = walletBalance + expectedIncome − (subscriptions + recurring + goals)
safeToSpendToday   = max(0, (projectedAvailable − buffer) / daysRemaining)
```

### Currency

The base is the caller's `user.currencyCode`, resolved in the controller. Conversion uses
`getRatesSafe`/`convertAmount` from `common/utils/fx.ts`; an amount with no rate is left out and the
response carries `fxApproximate: true`.

### Caching

The server caches the response in Redis under `sts:{accountId}:{baseCurrency}` for 300 s. The app
keeps the last response in MMKV (store id `safe-to-spend`) **keyed per account** and paints it
before the request returns. With no server response at all, `useSafeToSpend` approximates the
number locally with the shared-utils `computeSafeToSpend` over the stores — without subscriptions,
which the device does not have.

### The affordability check

`check_affordability(amount, currencyCode?, description?)` is a **read** tool: no confirmation, run
through `executeWithCache` (key includes the base currency). A missing `currencyCode` defaults to
the base. `SafeToSpendService.checkAffordability` converts the amount and decides:

| `reasonCode` | `affordable` | When |
|---|---|---|
| `within_safe` | yes | within today's safe-to-spend |
| `within_available_tight` | yes | over today's figure but within `projectedAvailable` |
| `delays_goal` | yes | affordable, but spending it pushes an active goal off its pace (`goalImpact` names it) |
| `wait_until_income` | no | over what is available, but covered once the inferred income arrives (`suggestedDate` = horizon) |
| `over_available` | no | otherwise |

The model receives the verdict struct and only narrates it — it reports `affordable` and
`reasonCode` as given and never judges affordability itself. The mobile chat renders the verdict as
an `ActionResultCard` chip.

### On the home screen

The number is the hero row of `HomeHeroHeader` (tap → `SafeToSpendSheet` breakdown) and is folded
into the desktop focus column. It has a `safeToSpend` `WidgetKey`, but that key only toggles the
hero row — `renderHomeWidget` returns `null` for it, so it is never a card of its own.

## Invariants

- **One engine.** The hero number and the chat verdict both come from `SafeToSpendService.compute`;
  a second calculation would let the app say "you can spend 40 today" while the chat says "you
  cannot afford 30".
- **The model narrates, never decides.** The verdict is computed; the chat only words it.
- **`computeSafeToSpend` is a deliberately duplicated pair** — `safe-to-spend.util.ts` (what the
  API runs) and `packages/shared-utils` (what the app runs offline). The API must not import the
  runtime value from `@budget/shared-utils`: it has no build step for workspace packages and the
  production ESM runtime crash-loops on the package barrel. Change both sides together.
- **Every cache key carries the base currency** (`sts:{accountId}:{baseCurrency}`, and the chat
  tool's key) — the account is shared, the display currency is per user.
- **An amount with no exchange rate is excluded and flagged**, never summed unconverted. For a single
  purchase that means no verdict: `checkAffordability` returns `reasonCode: 'currency_unconvertible'`
  instead of judging a foreign amount as if it were in the base currency (ABA-626).

## Known gaps

- `safe-to-spend.service.spec.ts` tests the **shared-utils** copy of the formula, not
  `safe-to-spend.util.ts`, which is what the service calls. Harmless only while the two are kept
  identical by hand.
- The server cache is not invalidated on writes; a new expense moves the number within 5 minutes.
- No buffer: v1 lets the figure fall to zero exactly at the horizon.
- The offline fallback omits subscriptions, so offline it reads higher than online.

## History

- ABA-293 — the engine, `GET /insights/safe-to-spend`, the home hero number, and
  `check_affordability`.
- The API copy of the formula exists because importing it from `@budget/shared-utils` at runtime
  took production down (see `CLAUDE.md`, Production: the `check-no-shared-utils-runtime-import.sh`
  deploy guard).
