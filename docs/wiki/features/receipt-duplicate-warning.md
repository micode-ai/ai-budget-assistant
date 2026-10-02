# Receipt duplicate warning

## What this is
Warns before a receipt is recorded twice — in the app (phone and web) and in the Telegram,
WhatsApp and Slack bots. Two stages: the same FILE is caught before OCR spends an AI request; the
same RECEIPT in a different file is caught after OCR, before the save. Both only warn; nothing
blocks a save.

## Entry points
- `apps/api/src/modules/expenses/receipt-duplicate.service.ts` — `receiptFingerprint`,
  `ReceiptDuplicateService.findByFingerprint` / `findLikely`, pure `pickLikelyDuplicate`.
- `apps/api/src/modules/ai/ai.controller.ts` — `GET /ai/receipt-duplicate?fingerprint=` (stage 1).
- `apps/api/src/modules/ai/services/ocr.service.ts` — `withDuplicateInfo` (stage 2, on every scan).
- `apps/mobile/src/features/receipt/useReceiptScanner.ts` — `onDuplicate` option;
  `receiptFingerprint.ts`, `receiptDuplicate.ts`; UI in `components/receipt/ReceiptExpenseView.tsx`
  and `DuplicateReceiptBanner.tsx`.
- Bots: `scanOrWarn` / `runScan` / `handleRescanCallback` in each `modules/{telegram,whatsapp,slack}/handlers/photo.handler.ts`;
  strings in `common/bot-i18n/shared-messages.ts` (`receiptDuplicate*`, `scanAnyway`, `scanRequestExpired`).

## Key concepts
**The fingerprint is SHA-256 of the base64 TEXT, whitespace removed** — not of the decoded bytes.
The app computes it on the device with `expo-crypto` over the exact string it is about to upload, so
the pre-check sends 64 hex characters instead of the file. It is stored on `Expense.receiptFingerprint`
when the expense is created (the scan response returns it; the client and bots hand it back).

**Stage 1 lives outside `scan-receipt` on purpose.** `AiUsageGuard` charges the request before the
handler runs, so a check inside the scan endpoint would still cost the AI request it exists to save.
The bots likewise check before `trackAiUsage`, and park the scan in Redis (`*:dupscan:{id}`, 30 min)
so "Scan anyway" needs no re-upload.

**Stage 2 reuses the post-save duplicate rule** — same payee label (`expensePayee`), amount and
currency within ±1 day, as `detectDuplicateCharge`. Against a **bank-captured** row (`source`
`notification` or `import`) it then falls back to the push↔receipt pairing: a loose payee match
(`payeesLooselyMatch`), else a SINGLE bank row on amount alone, flagged `amountOnly` (ABA-630).

**A bank copy can be merged from the scan screen (ABA-630).** The match carries `source`; when it is a
bank copy the banner names the origin and shows a "Merge into one expense" box — ticked by default,
unticked when `amountOnly`. Saving with it ticked sends `mergeWithExpenseId` on the create;
`ExpenseCreatedHooksService.mergeBankCopy` folds the bank row into the receipt through
`ExpenseCrossAccountService.mergeExpenses` BEFORE `checkExpense`, so no `possible_merge` alert is
raised for a pair already merged. The receipt is the survivor (items, image, category, the shop's
real name); tags, project and notes gap-fill from the bank row. The app hides the bank row
optimistically. `withDuplicateInfo` checks the fingerprint first
too, so a client that skipped stage 1 (an older build, income or re-extract flows) still learns of an
exact re-upload.

## Invariants
- Client and server fingerprints must be computed over the same string; changing either side's
  normalisation silently disables stage 1 with no failing test on the other side.
- Every lookup is read-only and never throws — a failed check means "no duplicate", never a failed scan.
- The fingerprint is written with a conditional spread on BOTH create-upsert branches, so a push
  without one never clears a stored fingerprint.
- A warning, never a block: a match can be a genuine second purchase, or the bank-notification copy
  of this very receipt. The merge happens only on the user's tick.
- `mergeWithExpenseId` folds only a `notification`/`import` row in the same account, and only from an
  `ocr` create — the server re-checks both, so a client cannot use it to delete an arbitrary expense.
- The amount-only fallback applies to bank rows ONLY; two manual rows are never paired on amount.

## Known gaps
- Expenses saved before ABA-603 have no fingerprint; only stage 2 catches them.
- The fingerprint rides only the first create push, like the receipt image; an offline retry through
  `syncPendingExpenses` does not carry it.
- A fresh camera photo is a different file — only stage 2 can catch it. Stage 1 on a re-picked
  gallery photo relies on the device downscaling the same source identically.
- Income receipt scans and the "Extract items" re-scan do not run stage 1.
- `mergeWithExpenseId` rides only the first create push; an offline retry does not carry it — the
  post-save `possible_merge` alert still catches the pair.
- The bots warn at scan time but do not offer the merge.

## History
ABA-603 (the feature; bot scan flows unified into one `runScan` per bot) · [ABA-630](https://github.com/micode-ai/ai-budget-assistant/issues/660) (bank-copy
matching and the merge checkbox).
