# Edit Wallet Initial Balance — Design

**Date:** 2026-04-16
**Status:** Approved by user (brainstorming phase)
**Scope:** Mobile app (`apps/mobile`) only. No API, shared-types, or DB schema changes.

## Problem

On the wallet screen (`apps/mobile/app/wallet/index.tsx`) users see their initial
balance per currency, but there is no way to edit it. The adjacent "Set initial
balance" screen (`apps/mobile/app/wallet/set-balance.tsx`) looks like a creation
form — existing balances are listed below with only a delete (trash) action.

The store already exposes `updateInitialBalance(id, amount)` (wired to SQLite
and the server sync), but no UI consumes it. Users currently have to delete a
balance and re-create it, or rely on the implicit overwrite behaviour of
`setInitialBalance` (same currency replaces the existing row), which is not
discoverable.

## Goal

Provide two discoverable entry points that take the user into an explicit
"edit" mode of the existing `set-balance` screen:

1. **Tap on a currency card** on the wallet main screen (`wallet/index.tsx`).
2. **Pencil icon** next to the existing trash icon in the balance list on
   `wallet/set-balance.tsx`.

Both entry points route to `/wallet/set-balance?editId=<balanceId>`, which
switches the screen into edit mode for that balance.

## Non-goals

- No history of initial-balance changes.
- No changes to `walletStore`, Prisma schema, or `shared-types`.
- No changes to deletion or exchange/transfer flows.
- No refactor of `set-balance.tsx` beyond what is needed for edit mode.

## User flow

### Entry 1 — wallet main screen

- Each `balanceCard` (per-currency card at `wallet/index.tsx:87-147`) becomes a
  `TouchableOpacity` when `canEdit` is true.
- A small pencil icon (`Ionicons name="pencil-outline"`) is placed in the top-
  right of the card header as an affordance hint. Tap target is the whole card.
- On press:
  `router.push({ pathname: '/wallet/set-balance', params: { editId: balance.id } })`
  where `balance.id` comes from the corresponding `walletBalances` entry
  matched by `currencyCode` (the `walletSummary` array exposes `currencyCode`
  but not `id` — we look it up in `walletBalances` inside the tap handler).

### Entry 2 — set-balance list

- In the existing row rendered at `wallet/set-balance.tsx:91-110`, a new pencil
  `TouchableOpacity` is added to the left of the delete button.
- Tap calls `router.setParams({ editId: balance.id })` — no navigation, same
  screen re-renders in edit mode with the form pre-filled.

### Edit mode on `set-balance.tsx`

Triggered when `useLocalSearchParams().editId` is present.

Behaviour changes vs. the existing create mode:

| Element | Create mode | Edit mode |
|---|---|---|
| Title | `wallet.setInitialBalance` | `wallet.editInitialBalance` |
| Currency chips | All clickable | Only the edited balance's currency is rendered, visually in the active state, not interactive. (We hide the other chips entirely — there is no use case for "change currency of an existing balance.") |
| Amount input | Empty, placeholder "0.00" | Pre-filled with the balance's `initialAmount`, formatted as plain number |
| Primary button | `common.save` | `common.update` |
| Secondary button | none | `common.cancel` → `router.back()` |
| Success alert | `wallet.balanceSaved` | `wallet.balanceUpdated` |
| Save handler | `setInitialBalance(currency, amount)` | `updateInitialBalance(editId, amount)` |

After a successful update in edit mode, we clear `editId` via
`router.setParams({ editId: undefined })` and keep the user on the screen so
they can see the refreshed list, matching create-mode behaviour (which clears
the form but stays on screen).

Edit mode still renders the existing-balances list below, so users can jump to
another balance via the pencil icon without leaving the screen.

### Validation

Same validation as create mode: `parseFloat(amount)` must be a finite number
`>= 0`. No new edge cases.

## Implementation outline

**Files touched (mobile only):**

1. `apps/mobile/app/wallet/index.tsx`
   - Wrap each `balanceCard` in `TouchableOpacity` when `canEdit`.
   - Look up `balance.id` from `walletBalances` by `currencyCode` in the tap
     handler (fall back to no-op if not found — shouldn't happen).
   - Add pencil icon in `balanceHeader`.
2. `apps/mobile/app/wallet/set-balance.tsx`
   - Read `editId` from `useLocalSearchParams`.
   - Derive `editingBalance = walletBalances.find(b => b.id === editId && !b.isDeleted)`.
   - On mount / when `editId` changes, seed both `amount` (from
     `editingBalance.initialAmount.toString()`) and `selectedCurrency`
     (from `editingBalance.currencyCode`) via `useEffect`.
   - If `editId` is present but `editingBalance` is not found (e.g. store
     not yet loaded, or stale id), fall back to create-mode UI without
     error. No loading spinner.
   - Branch title, button label, save handler, and currency-chip rendering on
     `editingBalance`.
   - Add pencil icon button in each list row, alongside the existing trash
     button; pressing it calls `router.setParams({ editId: balance.id })`.
   - Add a `Cancel` button in edit mode that calls `router.back()` (or clears
     `editId` if no back-stack entry exists — `router.canGoBack()` check).
   - After successful `updateInitialBalance`, clear the edit state so the
     user sees the refreshed list: prefer `router.setParams({ editId: '' })`
     (empty string, more reliable than `undefined` in Expo Router) and
     reset local form state. Implementer should verify on device that
     `useLocalSearchParams().editId` becomes falsy afterwards.
3. `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be}.ts`
   - Add `wallet.editInitialBalance`, `wallet.balanceUpdated`, `common.update`.
   - Reuse existing `common.cancel`.

**No changes to:**
- `apps/mobile/src/stores/walletStore.ts` (already has `updateInitialBalance`)
- `apps/mobile/src/db/*` (already handled by the store)
- `apps/api/*`, `packages/*`

## Manual test plan

Run mobile app; verify each:

- [ ] Wallet main screen: tap USD card → set-balance opens with USD selected and amount pre-filled, title reads "Edit initial balance".
- [ ] In edit mode, other currency chips are not visible/interactable.
- [ ] Change amount → tap Update → alert shows, return to wallet → USD initial balance and `currentBalance` reflect the new value.
- [ ] On set-balance screen: tap pencil icon next to a listed balance → form pre-fills with that balance; previously shown form is replaced.
- [ ] Tap Cancel in edit mode → screen goes back or clears `editId`; no mutation happens.
- [ ] Delete icon still works in both modes.
- [ ] Viewer role (`canEdit === false`) on main screen: cards are not tappable, no pencil icon rendered.
- [ ] Offline: editing still updates UI immediately; `syncStatus` becomes `pending`; sync fires when back online (observable via DevTools logs — same path as create).
- [ ] Translations render in all 8 locales (spot-check en, ru, ua).

## Risks / open questions

- **`walletSummary` vs `walletBalances`:** the main screen iterates
  `walletSummary` (which is computed, no `id` field), but we need the row
  `id` to edit. Mitigation: look it up in `walletBalances` by `currencyCode`
  inside the tap handler. This mapping is unambiguous because
  `setInitialBalance` replaces any existing non-deleted row for the same
  currency.
- **`router.setParams` for entry-2 flow:** Expo Router's `setParams` updates
  `useLocalSearchParams` on the same screen. If the user then presses
  hardware back, they expect to leave the wallet flow entirely — not re-enter
  the pre-edit state of this screen. This matches current behaviour (no
  navigation was stacked), so no special handling needed.
- **Currency chip rendering in edit mode:** hiding other chips is cleaner than
  disabling them. Confirmed in the design.
