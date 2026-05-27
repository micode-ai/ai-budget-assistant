# Merchant Management (mobile) — Design

**Date:** 2026-05-27
**ABA issue:** to be created on completion (follow-up to ABA-140)
**Status:** Approved (design)
**Depends on:** the `merchant` field feature (ABA-140) — `Expense.merchant`, SQLite column, store filters/selectors, `MerchantInput`.

## Problem

`merchant` is a free-text field on each expense. Users can set/edit/clear it per expense
(via `MerchantInput` on create/edit), but there is no way to manage merchants across
expenses: no list of all merchants, no bulk rename, no merge of OCR-produced variants
(e.g. `Żabka ZF351`, `Zabka ZF351`, `Sklep Żabka ZE600` → `Żabka`), no global delete.
Today that cleanup only happens via raw SQL on prod.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Approach | Option 1 — lightweight, **no normalized `Merchant` entity**, no new API endpoint |
| Platform | Mobile (Settings → Merchants) |
| Operations | **Rename** (renaming to an existing name auto-**merges**) + **Delete** (clears merchant) |
| Multi-select merge | Out of scope (rename-to-existing covers mapping) |
| Tier gating | None (data cleanup, free) |

## Approach

All operations are **bulk string updates** over the existing offline-first expense store —
no `Merchant` table, no new server endpoint. A rename/merge/delete sets `merchant` for every
non-deleted expense in the current account whose `merchant` exactly equals the source value,
then syncs the affected rows through the **existing** `syncPendingExpenses` path (which already
runs `maybeEncrypt`, so E2EE accounts re-encrypt the merchant correctly).

Why not a server bulk endpoint: for E2EE accounts the server stores `merchant` as ciphertext
in `encrypted_payload` and cannot match plaintext, so a server-side `UPDATE ... WHERE merchant=X`
would silently miss encrypted accounts and bypass the offline-first local cache. Reusing
`syncPendingExpenses` is correct for both encrypted and non-encrypted accounts and adds no API.

## Changes by layer

### 1. `apps/mobile/src/utils/merchant.ts` (+ test)
Add a counts selector next to `getDistinctMerchants`:
```ts
export function getMerchantCounts(expenses: Expense[]): { merchant: string; count: number }[]
```
- Excludes soft-deleted rows and empty/whitespace merchants.
- Counts by case-sensitive exact `merchant` value (so distinct stored variants are listed
  separately — that's the point of the screen).
- Sorted by `count` desc, then `merchant` (localeCompare).
Add unit tests in `apps/mobile/src/utils/__tests__/merchant.test.ts` (dedup/skip-deleted/sort).

### 2. `apps/mobile/src/stores/expenseStore.ts`
- `ExpenseState` interface: add
  ```ts
  getMerchantCounts: () => { merchant: string; count: number }[];
  renameMerchant: (from: string, to: string | null) => Promise<number>;
  ```
- `getMerchantCounts`: `() => computeMerchantCounts(get().expenses)` (import the util).
- `renameMerchant(from, to)`:
  1. Find non-deleted expenses with `merchant === from`. If none, return 0. If `to === from`, return 0 (no-op).
  2. In-memory `set`: for matching rows, `merchant: to || undefined`, `updatedAt: new Date()`,
     `syncStatus: e.syncStatus === 'synced' ? 'pending' : e.syncStatus`.
  3. Local SQLite — one statement:
     `UPDATE expenses SET merchant = ?, updated_at = ?, sync_status = 'pending'
      WHERE account_id = ? AND merchant = ? AND is_deleted = 0`
     (`to` may be `null`; `accountId` from `useAccountStore.getState().currentAccountId`).
     Add a repository helper `bulkRenameMerchant(accountId, from, to)` in `expenseRepository.ts`
     rather than inlining SQL in the store.
  4. Fire-and-forget `get().syncPendingExpenses()` to push the affected rows (re-encrypts for E2EE).
  5. Return the affected count.
- Delete = `renameMerchant(from, null)`.

### 3. `apps/mobile/app/settings/merchants.tsx` (new screen)
- Nav header with title `t('merchants.title')` and back (new-screen convention).
- Body: `getMerchantCounts()` rendered as rows `"<merchant> · <count>"`, sorted by count.
  Each row opens an action sheet / inline actions: **Rename** and **Delete**.
- **Rename**: a modal with a prefilled `TextInput` (trimmed). On save:
  - reject empty/whitespace (must enter a name);
  - if unchanged, just close;
  - else `const n = await renameMerchant(original, value.trim());` then toast/alert
    `t('merchants.renamed', { count: n })`. If the typed name already exists in the list,
    it merges naturally (no special handling).
- **Delete**: confirm `t('merchants.deleteConfirm', { count })`; on confirm
  `await renameMerchant(merchant, null)`, toast `t('merchants.deleted', { count: n })`.
- Empty state (`t('merchants.empty')`) when `getMerchantCounts()` is empty.
- Loading/refresh: reads from the in-memory store (already hydrated); a pull-to-refresh that
  calls `loadExpenses({ force: true })` is optional, not required.

### 4. Settings hub link
Add a "Merchants" row to the Settings list (`app/settings/index.tsx`), adjacent to the existing
**Categories** entry, routing to `/settings/merchants` with an appropriate icon (e.g. `storefront-outline`).

### 5. i18n (all 8 locales: en, de, es, fr, pl, ru, ua, be)
New `merchants` namespace keys: `title`, `rename`, `delete`, `renameTitle`, `renamePlaceholder`,
`deleteConfirm` ("Clear merchant from {{count}} expenses?"), `renamed` ("Updated {{count}} expenses"),
`deleted` ("Cleared {{count}} expenses"), `empty` ("No merchants yet"), and a Settings-hub label
`settings.merchants` ("Merchants"). Follow the `i18n-add-strings` discipline.

### 6. Docs (finish-aba-task)
- CLAUDE.md note (merchant management screen + `renameMerchant` bulk pattern).
- user_docs `03-expenses-and-income.md` (8 locales): short note under the Merchant section that
  merchants can be renamed/merged/deleted in Settings → Merchants. Then `npm run generate:help`.
- Create the ABA issue.

## Edge cases

- Rename to empty/whitespace → rejected in the UI (deletion is a separate explicit action).
- Rename to the same value → no-op (returns 0).
- Rename whose target already exists → merge (rows converge on the same string); the list
  collapses the two entries on next render.
- Large merchant (e.g. 56 rows) → 56 rows marked pending and re-uploaded by `syncPendingExpenses`;
  acceptable for occasional cleanup, inherits existing per-row sync behavior.
- Case-only rename (`zabka` → `Żabka`) → updates the stored value to the typed casing.

## Out of scope / follow-ups

- Normalized `Merchant` entity / FK; server-side bulk endpoint.
- Multi-select merge mode; auto-mapping rules applied to future imports/OCR.
- Income merchants; admin-dashboard merchant management.
- **Capture-time merchant reconciliation (OCR + voice)** — its own sibling spec
  `2026-05-27-merchant-capture-reconciliation-design.md` (sub-feature B). Built after this one;
  shares the `merchant` util and `MerchantInput`.

## Testing

- Unit: `getMerchantCounts` (counts, skip-deleted, skip-empty, sort).
- Manual: rename a merchant → all its expenses update + list collapses; rename to existing →
  merge; delete → merchant cleared on its expenses and removed from the list and the Expenses-tab
  filter; verify on a non-E2EE account that the change reaches the server (and conceptually that
  E2EE goes through `syncPendingExpenses` re-encryption).
- `tsc --noEmit` + eslint on changed files.
