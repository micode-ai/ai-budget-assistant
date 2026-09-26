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
currency within ±1 day, as `detectDuplicateCharge`. `withDuplicateInfo` checks the fingerprint first
too, so a client that skipped stage 1 (an older build, income or re-extract flows) still learns of an
exact re-upload.

## Invariants
- Client and server fingerprints must be computed over the same string; changing either side's
  normalisation silently disables stage 1 with no failing test on the other side.
- Every lookup is read-only and never throws — a failed check means "no duplicate", never a failed scan.
- The fingerprint is written with a conditional spread on BOTH create-upsert branches, so a push
  without one never clears a stored fingerprint.
- A warning, never a block: a match can be a genuine second purchase, or the bank-notification copy
  of this very receipt.

## Known gaps
- Expenses saved before ABA-603 have no fingerprint; only stage 2 catches them.
- The fingerprint rides only the first create push, like the receipt image; an offline retry through
  `syncPendingExpenses` does not carry it.
- A fresh camera photo is a different file — only stage 2 can catch it. Stage 1 on a re-picked
  gallery photo relies on the device downscaling the same source identically.
- Income receipt scans and the "Extract items" re-scan do not run stage 1.

## History
ABA-603 (the feature; bot scan flows unified into one `runScan` per bot).
