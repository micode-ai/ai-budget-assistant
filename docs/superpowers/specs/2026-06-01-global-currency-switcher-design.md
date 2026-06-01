# Global Currency Switcher — Design

**Date:** 2026-06-01
**Status:** Approved (pending implementation plan)

## Problem

Today the only way to change the app's base/display currency is **Settings → Profile**, which
updates `user.currencyCode`. That value is the single source that drives every converted total
across the app (via `exchangeRateStore`). Users want to switch currency quickly from any screen,
with a control that is lightweight and unobtrusive.

## Decision Summary

| Decision | Choice |
|---|---|
| Semantics | Persist the base currency (`user.currencyCode`) — same as Profile today, just reachable everywhere. **No** separate temporary "display currency" concept. |
| Placement | Embed in the existing `AccountSwitcher` (zero extra header space) rather than a new header pill, floating button, or tab-bar element. |
| Menu layout | Account list on top, a **"Display currency"** chip section below it, then "Manage accounts". |
| Trigger label | Account icon + account name (ellipsis-truncated) + `·` + **currency symbol** (always visible, never truncated) + chevron. |
| Roles | Available to all roles incl. `viewer` — `currencyCode` is a user preference, not account-scoped data. |

## Why embed in AccountSwitcher

There is no universal header component across all screens, but every main tab already renders
`AccountSwitcher` (tab headers via `headerLeft`; the home hero bar via `<AccountSwitcher compact />`).
Reusing it gives a single mount point that is already present on every money-showing screen, costs no
additional horizontal space, and keeps one combined "context" control (which account + which currency).

## Mechanism (reuses what exists)

Changing currency is already wired end-to-end:

1. `updateUser({ currencyCode })` updates local auth state.
2. `exchangeRateStore` has a deferred subscription on `user.currencyCode`; when it changes it calls
   `loadRates()`, which refetches rates with the new base and recomputes all converted totals
   reactively.
3. `api.updateProfile({ currencyCode })` persists it server-side.

So the new code is mostly UI; the data flow already exists (see `settings/profile.tsx` lines 91–94 and
`exchangeRateStore.ts` lines 116–126).

## Components

### 1. Trigger (pill in header)

`[👤 Семей… · € ▾]`

- Account-type icon (existing) + account name (existing, `numberOfLines={1}` ellipsis) + separator `·`
  + **currency symbol** + chevron.
- The currency symbol comes from `SUPPORTED_CURRENCIES` (`packages/shared-utils`, already has
  `{ code, name, symbol }`).
- The symbol is rendered after the (flex-shrinking) name so the name truncates first and the symbol
  stays visible at narrow widths. Works in both default and `compact` (home) modes.

### 2. Menu (single modal on tap)

Reuses the existing modal. New structure:

- **Section "Account"** — current account list (unchanged: tap switches account + reloads data).
- Divider.
- **Section "Display currency"** — a wrapping row of compact chips, one per `SUPPORTED_CURRENCIES`
  entry (USD / EUR / PLN / GBP / UAH / RUB / BYN); the active currency chip is highlighted. Tap = change
  currency.
- **"Manage accounts"** button (unchanged).

### 3. Currency-change handler

On chip tap:

1. `updateUser({ currencyCode })` immediately (instant UI; triggers the rate reload subscription).
2. `api.updateProfile({ currencyCode }).catch(warn)` — fire-and-forget so it works offline. A failed
   server push is logged with `console.warn` (never `console.error`, per the offline-first logging rule).
3. Close the modal. The updated symbol in the pill is the confirmation.

If `currencyCode === current`, no-op.

### 4. Menu always opens (small behavior change)

Currently `handleTriggerPress` routes single-account users straight to `/account/list` and only opens
the modal when `accounts.length > 1`. Change: the modal **always** opens (so the currency control is
reachable even with one account). The "Manage accounts" button inside the modal preserves the path to
account management.

### 5. Shared change-currency helper (avoid duplication)

Add a `setCurrency(code: Currency)` action to `authStore` that does the optimistic `updateUser` +
fire-and-forget `updateProfile` so `AccountSwitcher` and `settings/profile.tsx` share one
implementation. Profile keeps working as the "full" path, calling the same action.

## Files

| File | Change |
|---|---|
| `apps/mobile/src/components/AccountSwitcher.tsx` | Trigger label (symbol), always-open behavior, "Display currency" chip section, change handler. |
| `apps/mobile/src/i18n/locales/*.ts` (8 files) | New key `accounts.displayCurrency` (section title). |
| `apps/mobile/app/settings/profile.tsx` | Route its currency change through the new `authStore.setCurrency` action (no UX change). |
| `apps/mobile/src/stores/authStore.ts` | New `setCurrency(code)` action (optimistic `updateUser` + fire-and-forget `updateProfile`). |

## Edge cases

- **Single account** — modal still opens; currency section present.
- **Offline** — local update applies instantly; server sync retried via normal flow; failure logged as `warn`.
- **Rate fetch fails for new currency** — `loadRates` already catches and leaves prior rates;
  `convertAmount` falls back to the raw amount when a rate is missing (existing behavior).
- **Viewer role** — allowed (user preference, not account data); no `canEdit` gating.

## Testing

- Unit test the shared change-currency helper: optimistic `updateUser` is called, `api.updateProfile`
  is invoked, and a rejected `updateProfile` does not throw (warn path).
- Unit/render test the pill label composition: long account name truncates while the currency symbol
  remains present.

## Out of scope (YAGNI)

- A separate temporary "display currency" that bypasses the saved profile preference.
- A dedicated tab-bar / floating currency control.
- Currency switching on Stack detail screens (they show a single transaction in its own currency).
