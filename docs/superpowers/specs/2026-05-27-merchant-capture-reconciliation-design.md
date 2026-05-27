# Merchant Capture Reconciliation (OCR + Voice) — Design

**Date:** 2026-05-27
**ABA issue:** to be created on completion (follow-up to ABA-140)
**Status:** Approved (design)
**Sibling spec:** `2026-05-27-merchant-management-design.md` (sub-feature A — management screen). This is sub-feature B; build after A. Shares `apps/mobile/src/utils/merchant.ts` and `MerchantInput`.

## Problem

When adding an expense via receipt OCR or voice, the captured merchant does not reuse the
account's existing merchants — it spawns new variants (e.g. each Żabka receipt with a different
store number becomes a distinct merchant). Users want capture to reconcile against existing
merchants.

## Key finding (corrects an earlier assumption)

The AI **already extracts a merchant** for both flows; no AI/server change is needed:
- **OCR**: `ocr.service.ts` returns `merchant` (the receipt's merchant name). `receipt.tsx`
  already persists it (ABA-140) but shows it **read-only**.
- **Voice**: the categorization parse returns `merchant`; `voice.tsx` already reads
  `parsedExpense.merchant` into an `editMerchant` field — but currently **saves it into `notes`**
  (`voice.tsx` ~line 120: `notes: editMerchant.trim() || undefined`), a stand-in from before the
  merchant column existed.

So B is **mobile-only**: route voice's merchant to the real field, make OCR's merchant editable,
and reconcile both against existing merchants.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Matching strategy | **Suggest + confirm (safe)**: editable field pre-filled from OCR/voice, autocomplete from existing merchants, exact (case-insensitive, trimmed) match auto-snaps to the existing canonical value. No fuzzy auto-mapping. |
| Voice merchant capture | Use the merchant the AI already extracts; save it to `merchant` (not `notes`). No AI-parse change. |

## Changes by layer (all mobile)

### 1. `apps/mobile/src/utils/merchant.ts` (+ test)
Add a reconciliation helper:
```ts
/** If `input` matches an existing merchant case-insensitively (trimmed), return that
 *  existing canonical value; otherwise return the trimmed input. '' for blank input. */
export function resolveExistingMerchant(input: string | null | undefined, existing: string[]): string
```
Unit tests: exact case/whitespace variant snaps to canonical (`'zabka zf351 '` + existing
`['Zabka ZF351']` → `'Zabka ZF351'`); unknown input returned trimmed; blank → `''`.

### 2. OCR — `apps/mobile/app/expense/receipt.tsx`
- Replace the read-only merchant row with an editable `MerchantInput` (it already autocompletes
  from `getDistinctMerchants`).
- Pre-fill state with `resolveExistingMerchant(scannedReceipt.merchant, getDistinctMerchants())`
  so an exact match to an existing merchant snaps to the canonical casing.
- Save the (possibly edited) value: `merchant: merchant.trim() || undefined` in `addExpense`.

### 3. Voice — `apps/mobile/app/expense/voice.tsx`
- Replace the plain merchant `TextInput` (~line 266) with `MerchantInput` bound to the existing
  `editMerchant`/`setEditMerchant` state.
- Pre-fill via `resolveExistingMerchant(parsedExpense.merchant, getDistinctMerchants())` where
  `editMerchant` is initialized (~line 72).
- In `addExpense` (~line 115), change `notes: editMerchant.trim() || undefined` to
  `merchant: editMerchant.trim() || undefined` (stop overloading `notes`). Leave `notes` unset
  unless the voice flow has a genuine notes source (it doesn't — so drop the notes line).
- `getDistinctMerchants` is read from `useExpenseStore`.

### 4. i18n
Reuse existing keys. `voice.merchant` already exists. `MerchantInput` uses
`expenses.merchant`/`merchantPlaceholder` (added in ABA-140). No new keys expected; add only if a
screen needs a new label.

### 5. Docs (finish-aba-task)
CLAUDE.md note (OCR/voice reconcile merchant via `resolveExistingMerchant` + `MerchantInput`;
voice now stores merchant in `merchant`, not `notes`). user_docs touch-up if user-visible. ABA issue.

## Migration note (existing voice expenses)

Past voice expenses stored their merchant in `notes`. This change does **not** retro-migrate them
(out of scope; could be a separate SQL backfill like the OCR one). New voice expenses use the
`merchant` field.

## Edge cases

- OCR/voice returns no merchant → field blank, no snap, user may type one (with suggestions).
- Exact match differing only by case/whitespace → snaps to existing canonical casing.
- Store-number variants (`Żabka ZF351`) still differ from canonical `Żabka` → NOT auto-merged at
  capture (suggest+confirm only); the user can pick `Żabka` from suggestions, or clean up later via
  the management screen (sub-feature A). This is intentional (no risky fuzzy auto-map).

## Out of scope / follow-ups

- Fuzzy/brand auto-mapping at capture; mapping-rule storage.
- Retro-migration of voice merchants currently in `notes`.
- Imports (bank/Wise) capture reconciliation; income.

## Testing

- Unit: `resolveExistingMerchant` (snap/no-snap/blank).
- Manual: scan a receipt whose merchant matches an existing one (case variant) → field shows the
  existing canonical, saved to `merchant`; voice an expense → merchant lands in the `merchant`
  field (not notes) and autocompletes from existing.
- `tsc --noEmit` + eslint on changed files.
