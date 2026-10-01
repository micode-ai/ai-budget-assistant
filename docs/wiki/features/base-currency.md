# Base (display) currency on the client

*Hub: [mobile-app](../mobile-app.md) · server side: [display-currency-conversion](display-currency-conversion.md)
· related: [wallet-balance-history](wallet-balance-history.md)*

## What this is

The app-wide currency every converted total is shown in: `user.currencyCode`. It is a user
preference, not account-scoped, so a viewer can change it too. This page covers how the client
changes it; how the server converts into it is on
[display-currency-conversion](display-currency-conversion.md).

## Entry points

- `authStore.setCurrency(code)` — `apps/mobile/src/stores/authStore.ts`
- `apps/mobile/src/utils/currency.ts` — pure `applyCurrencyChange(next, deps)`; test
  `apps/mobile/src/utils/__tests__/currency.test.ts`
- `apps/mobile/src/stores/exchangeRateStore.ts` — the subscription that reacts
- Callers: `apps/mobile/src/components/AccountSwitcher.tsx` (currency chips),
  `apps/mobile/src/components/settings/profile/ProfileSettings.tsx`

## Key concepts

**Optimistic, then persisted.** `applyCurrencyChange` no-ops when the currency is unchanged,
otherwise applies `updateUser({ currencyCode })` locally first and then persists with a
fire-and-forget `api.updateProfile({ currencyCode })` whose failure is a `console.warn` — it works
offline. The local update is what matters: `exchangeRateStore` subscribes to
`user.currencyCode`, reloads rates, and its other subscriptions on the expense/income totals
recompute every converted figure.

The same optimistic-then-persist shape is reused by `applyThemePatch` (`src/utils/theme.ts`) and
`applyPaymentInfoPatch` (`src/utils/paymentInfo.ts`).

## Invariants

**Every change of the base currency goes through `authStore.setCurrency`.** Do not duplicate the
optimistic/persist logic in a screen; a second path would skip either the rate reload or the
server write.

**A screen-local display currency must not touch `user.currencyCode`.** The wallet screen's
currency toggle is local, unpersisted state that resets on re-entry (see
[wallet-balance-history](wallet-balance-history.md)). The `setCurrency` in
`app/investment/transaction.tsx` and `app/purchase-requests/new.tsx` is each screen's own form
field of the same name, not this action.

## History

ABA-187 (`setCurrency` and the pure helper).
