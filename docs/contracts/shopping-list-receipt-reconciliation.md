# Module Contract: Auto-check off shopping list items when a matching receipt is scanned

**Feature:** `shopping-list-receipt-reconciliation`
**Status:** building
**Date:** 2026-09-11
**Product idea:** `docs/product-ideas/shopping-list-receipt-reconciliation.md`

**Context:** entirely client-side (mobile app). No API endpoint, no Prisma
migration, no `User` column — see "Why no server change" in
`docs/plans/shopping-list-receipt-reconciliation-plan.md`. Reuses the
existing `PATCH /shopping-list/items/:id` write path (`isChecked`) that a
manual checkbox tap already uses.

---

## 1. `packages/shared-utils` — normalization mirror

```typescript
// packages/shared-utils/src/formatting/product-name.ts
export function normalizeProductName(name: string): string
```

Byte-identical mirror of the API's canonical
`apps/api/src/modules/merchant-rules/product-rules.service.ts`'s
`normalizeProductName` — same "deliberately duplicated pair" convention as
`financial-month.ts`/`wallet-currencies.ts` (the API has no build step and
cannot import `@budget/shared-utils` at runtime; the mobile client can and
does). Both copies must be kept identical by hand; a change to one requires
the same change to the other, and to both copies' test files
(`apps/api/src/modules/merchant-rules/product-key.spec.ts` and the new
`apps/mobile/src/utils/__tests__/productName.test.ts`).

Exported from `packages/shared-utils/src/formatting/index.ts`.

---

## 2. Mobile — pure matcher

```typescript
// apps/mobile/src/features/shopping-list/receiptReconciliation.ts

export interface ReceiptReconciliationLine {
  description: string;
  canonicalName?: string | null;
}

export function matchReceiptToShoppingList(
  candidates: Array<Pick<ShoppingListItem, 'id' | 'canonicalName' | 'rawLabel' | 'isChecked'>>,
  receiptLines: ReceiptReconciliationLine[],
): Array<Pick<ShoppingListItem, 'id' | 'rawLabel'>>
```

Behaviour:
- Builds a `Set<string>` of `normalizeProductName(line.canonicalName?.trim() || line.description)`
  for every receipt line (skips lines that normalize to an empty string).
- Returns every **unchecked** candidate whose
  `normalizeProductName(item.canonicalName?.trim() || item.rawLabel)` is in
  that set. Already-checked candidates are always skipped, even if passed in
  (defensive — callers are expected to pre-filter, but the guard is cheap and
  makes the function safe to call with an unfiltered list).
- Exact match only, after normalization. No fuzzy/substring matching, no
  `ProductAlias` resolution (that needs a network round trip this
  offline-capable client-only check doesn't otherwise need — a renamed
  product simply won't auto-match, same as an unmatched free-text item).
- Pure: no I/O, no store reads, no clock. Order of the returned array follows
  the input `candidates` order.

---

## 3. Mobile — device-local opt-out preference

```typescript
// apps/mobile/src/stores/shoppingListAutoCheckStore.ts

interface ShoppingListAutoCheckState {
  enabled: boolean;       // default true — reads MMKV, absent key = enabled
  setEnabled: (enabled: boolean) => void;
}
export const useShoppingListAutoCheckStore: UseBoundStore<...>
```

MMKV id `'shopping-list-auto-check'`, key `'enabled'`. Mirrors
`locationSettingsStore.ts`'s shape exactly, except the default is **ON**
(`mmkv.getString(KEY) !== 'false'`, i.e. absent-or-anything-but-'false' reads
as enabled) — this is a convenience automation, not a privacy-sensitive
capture, so it defaults to doing the helpful thing. Device-local only, not
server-synced (not account data), not reset on logout (same treatment as
`locationSettingsStore`).

---

## 4. Mobile — `shoppingListStore` new actions

```typescript
// apps/mobile/src/stores/shoppingListStore.ts

reconcileWithReceipt: (
  receiptLines: ReceiptReconciliationLine[],
) => { checked: Array<{ id: string; rawLabel: string }> };

undoReceiptReconciliation: (itemIds: string[]) => void;
```

`reconcileWithReceipt`:
- No-ops (`{ checked: [] }`) if `useShoppingListAutoCheckStore.getState().enabled`
  is `false`, or if `receiptLines` produces no usable normalized keys.
- Candidates = every unchecked, non-deleted item across every **non-archived**
  list in `get().lists` (mirrors the scoping `removeItemsByName` uses
  server-side: `shoppingList.isArchived === false`).
- On a match: optimistic `set({ lists: ... })` flips `isChecked: true` for
  every matched item (same shape as the existing `toggleChecked` action),
  then for each matched id, fire-and-forget
  `updateShoppingListItem(id, { isChecked: true })` (local SQLite) and
  `api.updateItem(id, { isChecked: true })` (server) — the exact same two
  calls `toggleChecked` already makes, so sync/offline behaviour is
  unchanged and already covered by existing conventions.
- Returns `{ checked: [{id, rawLabel}, ...] }` for the caller to build UI
  copy from. Never throws (SQLite/API failures are caught and logged the
  same way every other shopping-list write already does — the in-memory
  optimistic state is the source of truth for the alert either way).

`undoReceiptReconciliation`:
- Takes the exact `id` list `reconcileWithReceipt` returned. Sets
  `isChecked: false` for those ids only (never re-derives a match), same
  optimistic + local-SQLite + fire-and-forget-`api.updateItem` shape as
  above. Safe to call even if the user has since manually toggled one of
  those items in the meantime — it unconditionally sets `false`, so an
  "Undo" always means "these specific rows go back to unchecked", not "redo
  the match".

---

## 5. Mobile — wiring into the receipt save flow

```typescript
// apps/mobile/src/hooks/useReceiptSave.ts — handleConfirmExpense, after
// `await addExpense(...)` succeeds and before the existing success alert:

const reconciliation = useShoppingListStore.getState().reconcileWithReceipt(
  editedItems.map((item) => ({
    description: item.description,
    canonicalName: item.canonicalName ?? null,
  })),
);
```

The existing `showAlert(...)` call (both the plain-success and the
batch-session-checkpoint branches) gains:
- An extra body line when `reconciliation.checked.length > 0`:
  `t('receipt.shoppingListChecked', { count: reconciliation.checked.length })`
  (i18next `_one`/`_other` plural, mirrors `sessionCount_one/_other`).
- An extra leading button, `{ text: t('receipt.undoShoppingListCheck'),
  onPress: () => { useShoppingListStore.getState().undoReceiptReconciliation(reconciliation.checked.map(c => c.id)); finish(); } }`,
  present only when `reconciliation.checked.length > 0`. `finish()` is the
  existing helper (calls `onDone`/`router.back()` + `maybeAskForReview()`) —
  Undo behaves like Done once pressed, since a native `Alert` cannot stay
  open after any button press.
- `handleEditExpense` (hand-off to the manual form, no expense created yet)
  is **not** touched — reconciliation only ever runs once an expense has
  actually been created.

Scope: this hook is shared by the routed screen (`app/expense/receipt.tsx` →
`ReceiptExpenseView`) and the ABA-499 desktop `ExpenseDialog`, so both
surfaces get this for free with no separate desktop wiring.

---

## 6. Mobile — settings toggle

```tsx
// apps/mobile/src/components/settings/data/DataSettings.tsx
```

New section "Shopping list" (`t('shoppingList.autoCheckSectionTitle')`,
reusing the existing `sectionTitle`/`card`/`fieldRow` styles already defined
in this file), placed after the existing "Community prices" section and
before "Reports & Email":

```tsx
<Switch
  value={useShoppingListAutoCheckStore((s) => s.enabled)}
  onValueChange={useShoppingListAutoCheckStore((s) => s.setEnabled)}
  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
/>
```

Label `t('shoppingList.autoCheckFromReceipts')`, description
`t('shoppingList.autoCheckFromReceiptsDesc')`. No `canEdit` gate — this is a
personal device preference, same treatment as the location-capture and
community-price toggles already in this file.

---

## 7. i18n — new keys (all 9 locales: en/de/es/fr/pl/ru/ua/be/nl)

| Key | Namespace | Notes |
|---|---|---|
| `shoppingListChecked_one` / `_other` | `receipt` | count-pluralized, mirrors `sessionCount_one/_other` |
| `undoShoppingListCheck` | `receipt` | button label ("Undo") |
| `autoCheckSectionTitle` | `shoppingList` | settings section header |
| `autoCheckFromReceipts` | `shoppingList` | toggle label |
| `autoCheckFromReceiptsDesc` | `shoppingList` | toggle description |

---

## 8. Error cases / edge behaviour

| Condition | Behaviour |
|---|---|
| Toggle OFF | `reconcileWithReceipt` returns `{checked: []}` immediately, no state change, no alert line, no Undo button |
| No shopping lists / all archived / all items already checked | `{checked: []}`, alert unchanged (byte-identical to before this feature) |
| Receipt has no line items (`editedItems` empty) | `receiptLines` is `[]`, `matchReceiptToShoppingList` returns `[]` before touching any store state |
| SQLite write fails | Logged (`console.error`, matching every other shopping-list write in this file), optimistic in-memory state (and thus the alert/Undo) is unaffected |
| Server `api.updateItem` fails (offline) | Logged (`console.warn`, matching `toggleChecked`), row stays queued for the next sync sweep like any other pending shopping-list edit — Undo still works locally in the meantime |
| User presses Undo | Both matched rows revert to unchecked, locally and (fire-and-forget) on the server; `finish()` still runs — Undo does not keep the alert open |
| Item was renamed via `ProductAlias` on another device | Not resolved — the raw `canonicalName`/`rawLabel` strings are compared as-is; a stale/renamed pair simply doesn't match (documented limitation, not a bug) |
