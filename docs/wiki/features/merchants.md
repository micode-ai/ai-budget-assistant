# Merchants

*Hub: [mobile-app](../mobile-app.md) · related: [merchant-category-rules](merchant-category-rules.md),
[analytics-tab-breakdowns](analytics-tab-breakdowns.md)*

## What this is

Where an expense was spent, as a plain free-text field — filled by receipt OCR, voice, bank-push
capture and imports, editable by hand, filterable, and cleaned up from a management screen that can
rename, merge and delete merchant names and suggests merges of obvious variants.

## Entry points

- Schema: `Expense.merchant String?` + `@@index([accountId, merchant])`; mobile SQLite
  `merchant TEXT`. Incomes have no merchant field.
- `apps/mobile/src/utils/merchant.ts` — `getDistinctMerchants`, `getMerchantCounts`,
  `resolveExistingMerchant`, `merchantFingerprint`, `suggestMerchantGroups`
- `apps/mobile/src/components/MerchantInput.tsx` — free text + autocomplete from
  `expenseStore.getDistinctMerchants()`
- `apps/mobile/app/settings/merchants.tsx` → `apps/mobile/src/components/settings/merchants/MerchantsSettings.tsx`
- `expenseStore.renameMerchant`, `expenseStore.mergeMerchants`; `bulkRenameMerchant` /
  `bulkMergeMerchants` in `apps/mobile/src/db/expenseRepository.ts`
- `apps/mobile/src/stores/merchantSuggestionStore.ts` — persisted dismissals (`resolveDismissed`)
- Filter UI: `apps/mobile/src/components/expenses/ExpenseFilterBar.tsx`,
  `apps/mobile/src/components/MerchantPickerSheet.tsx`, `useExpensesScreenData`

## Key concepts

**Encrypted like `description`.** `merchant` is in `ENCRYPTION_FIELDS.expense.tier1`
(`packages/shared-utils/src/constants/index.ts`), so push paths run it through `maybeEncrypt` and the
pull merge reads the decrypted value. Clearing it on edit sends `''`, treated as absent everywhere.

**Filtering is client-side only** — there is no `?merchant=` API parameter.
`ExpenseFilters.merchants: string[]` is a multi-select (default `[]`) matching any selected
merchant; the search box also matches merchant substrings. Category and merchant pills share one row
with the right-aligned `sumConverted` total (`src/utils/total.ts`); the income tab has the category
pill only.

**Capture reconciliation snaps, it never guesses.** Receipt OCR and voice pre-fill the merchant via
`resolveExistingMerchant(input, getDistinctMerchants())` — an exact case-insensitive, trimmed match
snaps to the existing canonical spelling — and show the editable `MerchantInput`. Voice stores its
merchant in `merchant`; older voice rows kept it in `notes` and were not migrated.

**Management.** The screen lists distinct merchants with counts. Rename-to-an-existing-name is a
merge; rename to `null` clears. Selection mode merges several into an editable canonical target.
Both write one account-scoped SQL `UPDATE` (marking rows `pending`), update memory, and call
`syncPendingExpenses()`, which re-encrypts on the push. The same screen also hosts the merchant
rule re-apply flow from [merchant-category-rules](merchant-category-rules.md).

**Grouping suggestions.** `merchantFingerprint` takes the first alphabetic token of at least four
characters that is not in `FINGERPRINT_STOPWORDS` (generic venue words, legal forms, Polish cities)
as a brand key; `suggestMerchantGroups` groups variants sharing a fingerprint (two or more members)
with a title-cased canonical name. Only the top three groups by spend are shown as banners, and a
dismissal persists per fingerprint (MMKV id `merchant-suggestions`).

## Invariants

**The heuristic never auto-merges.** It only proposes; the user confirms each merge. Automatic
normalization exists only on the server's dictionary side.

**Every write affordance is `canEdit`-gated**, and merchants cannot be created by hand — they are
derived from expenses, so the screen has no `+` (see [reference-data-screens](reference-data-screens.md)).

## History

ABA-140 (the field, OCR/import population, filters) · ABA-141 (management screen, capture
reconciliation, voice writes `merchant`) · ABA-142 (one filter row, multi-select picker) · ABA-254
(multi-merge, grouping suggestions, persisted dismissals).
