# Batch receipt scanning

*Hub: [ai-features](../ai-features.md) · related: [share-to-capture](share-to-capture.md),
[store-rating-prompt](store-rating-prompt.md), [mobile-screen-decompositions](mobile-screen-decompositions.md)*

## What this is

Clearing a whole stack of receipts in one sitting. The receipt scanner already loops back into
capture after each save ("Scan another"); this adds a running count and a gentle checkpoint every
fifteen receipts, so a long session has a sense of progress and a natural place to stop.

## Entry points

- `apps/mobile/src/features/receipt/receiptScanSession.ts` — `RECEIPT_SESSION_CHECKPOINT_INTERVAL`,
  `isReceiptSessionCheckpoint(count)` (unit-tested)
- `apps/mobile/src/hooks/useReceiptScanSession.ts` — `{ count, recordSaved }`
- `apps/mobile/src/hooks/useReceiptSave.ts` — the `onSaved` callback and the post-save alert
- `apps/mobile/src/components/receipt/ReceiptExpenseView.tsx` — wires the two together; hosted by
  `apps/mobile/app/expense/receipt.tsx` and the desktop `ReceiptDialog`
- `apps/mobile/src/components/receipt/ReceiptCaptureView.tsx` — the count pill
- i18n: `receipt.sessionCount` (pluralised), `receipt.sessionCapTitle`, `receipt.sessionCapBody`,
  `receipt.scanAnother`

## Key concepts

**The loop.** After a successful save, `useReceiptSave` calls the optional `onSaved()`, which
records the save and returns `{ count, isCheckpoint }`, then shows the result alert with
`receipt.scanAnother` (back to capture, no navigation) and `common.done` (leave). On a checkpoint
the alert's copy changes to `receipt.sessionCapTitle` / `sessionCapBody`; the two actions stay
exactly the same. Once at least one receipt is saved, the capture view shows a pill with the count,
visible just as the user is about to scan the next one.

**The count is plain component state.** `useReceiptScanSession` keeps it in `useState` with a
`useRef` mirror, so `recordSaved()` can return the post-increment value synchronously — the caller
needs it in the same tick to decide whether this save is a checkpoint. Leaving the screen resets it;
that is the intended meaning of one continuous session, not a gap.

## Invariants

**The checkpoint nudges, it never stops the loop.** It recurs on every multiple of the interval and
keeps both actions; a blocking cap would punish exactly the user the feature is for.

**Do not persist or store-back the count.** It describes one visit to the screen.

**Telemetry counts visits, not saves.** `ReceiptExpenseView` emits `completed` once per mount even
though one mount can save many receipts — otherwise a ten-receipt session reported 1 started against
10 completed and pinned the derived `abandoned` at zero. The pill still counts every save.

## Known gaps

- Expense flow only. `app/income/receipt.tsx` shares `useReceiptScanner` but not `useReceiptSave`,
  has its own scan-another alert, and income receipts are scanned far less often.

## History

ABA-480 (the session count and checkpoint).
