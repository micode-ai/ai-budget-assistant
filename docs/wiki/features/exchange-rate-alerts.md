# Exchange-rate watch alerts

*Hub: [api](../api.md)*

## What this is

A personal "notify me when this currency pair hits my target" watch, set from the currency-exchange
screen. Per `userId`, with no `accountId` at all.

## Entry points

- `apps/api/src/modules/exchange-rate-alerts/` — the module
- `exchange-rate-alert.cron.ts` — hourly check, plus a daily history cleanup
- `apps/mobile/src/stores/exchangeRateWatchStore.ts` — server-only, no SQLite mirror
- `apps/mobile/src/features/wallet/rateAlerts.ts` — `partitionRateAlerts`
- `apps/mobile/app/wallet/rate-alerts.tsx`, `src/components/wallet/RateAlertsSection.tsx`

Migration: `20260902120000_add_exchange_rate_watches`.

## Key concepts

**Personal, not account-scoped.** The controller keeps a class-level `AccountContextGuard` for
consistency with every other controller, but the service ignores `req.accountId` entirely — the same
precedent as `GET /wallet/summaries`.

**Hourly, grouped by base currency.** The cron pages active watches and groups each page by
`fromCurrency` before calling the **existing singleton** `ExchangeRateService`, so it costs at most
one provider call per distinct base currency actually watched, regardless of watch count. That
service already caches each base for an hour, so hourly polling adds no load beyond what is cached.

## Invariants

**Do not provide a second `ExchangeRateService`.** Import `CurrencyExchangeModule` — the
`GeocodingService` duplicate-instance mistake is the precedent.

**One-shot, with a rollback.** On a hit the row is marked inactive with its triggered rate **before**
the push is sent — preventing a concurrent run from double-sending — then the send is **awaited**,
and a failure rolls the row back to active. A lost push must not permanently lose a one-shot alert
with no other surface telling the user it fired.

**No `ViewerBlockGuard`.** A personal rate target is not account-mutating data, the same treatment as
the display currency or the accent colour. The mobile entry point must therefore sit **outside**
`canEdit` too — hiding it from a viewer would deny what the API grants.

**No per-type notification preference.** It follows the precedent that an explicit one-off action
request needs no opt-out beyond deleting the watch itself.

**A per-watch and per-currency-group try/catch** means one bad row cannot abort the batch.

**Delete is a scoped `deleteMany({id, userId})`** — 404 on a mismatch rather than leaking existence.

**Triggered rows must be cleaned up.** The active cap only ever bounded the active set, so without a
retention job a fired one-shot lived forever.

**Compare timestamps with `new Date(value)`, not `.getTime()`.** The store keeps the API response
untouched, so `createdAt` / `triggeredAt` are ISO **strings** at runtime despite the entity typing
them `Date` — and a fired row with a null timestamp must sort last, not throw.

**The list needs its own screen, not just the section on the exchange screen.** That section filters
to the pair currently selected, which left an alert on a forgotten pair unreachable and a fired one
invisible in the app entirely — even though the API returns it as the only record that it fired.

**Its entry point is a full-width nav row, not a fourth button in the actions row.** That row is
`flexWrap` with `minWidth: 100, flex: 1` per button, so a fourth item wraps onto its own line and
stretches full width, colliding with the section below. The row holds at most three, and its third is
itself conditional — so this only broke for a multi-account user, and no test could catch it.

## Known gaps

- The count-then-create cap is not atomic. Harmless: it is an abuse guard, not a hard invariant.
- No recurring or "still above X" digest mode — one-shot only.
- The push deep-links to the exchange screen rather than the list, deliberately: once the target is
  hit, the useful next action is recording the exchange.

## History

The feature, plus ABA-484 (the dedicated list screen) and ABA-492 (the nav-row placement).
