# Receipt confirm card — line items

## What this is
The list of recognized lines on the receipt confirm card, after a scan and before the expense is
saved. Every line is shown (no cutoff), can be tapped to edit name / quantity / unit price / total,
deleted, or added by hand. Shared by the phone screen and the desktop `ReceiptDialog`.

## Entry points
- `apps/mobile/src/components/receipt/ReceiptItemsEditor.tsx` — the list, rendered by `ReceiptConfirmCard.tsx`
- `apps/mobile/src/features/receipt/itemEditing.ts` — pure helpers: `reindexAfterRemoval`, `formatItemQuantityLine`
- `apps/mobile/src/hooks/useReceiptCategorySplit.ts` — owns the real items array; edits go back through it

## Key concepts
- The editor holds only "which row is expanded" and its draft; every committed change goes through
  `onEditItem` / `onAddItem` / `onRemoveItem`, which recompute the category split.
- A collapsed row shows the name, the total and, under the name, a quantity line from
  `formatItemQuantityLine`: `2 × 3,49 zł`, `0.437 × …` for a weighed line, `×N` when OCR read no
  unit price, nothing when OCR read no quantity. It is shown for quantity 1 too, matching the saved
  expense's item row (`src/components/expenses/detail/ExpenseItemsSection.tsx`).

## Invariants
- The quantity line uses the same `qty × unit price` shape as the saved expense's row — the count
  must read the same before and after saving.
- Weighed quantities are rounded to 3 decimals for display only; the stored value is untouched.

## Known gaps
- Bot receipt previews (`features/bot-receipt-editing.md`) do not show the quantity line.

## History
- ABA-663 — quantity line added; before it, quantity and unit price were visible only inside a row's edit form.
