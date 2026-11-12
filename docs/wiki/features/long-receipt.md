# Long receipt in several photos

*Hubs: [ai-features](../ai-features.md) · [mobile-app](../mobile-app.md) · [telegram-bot](../telegram-bot.md) ·
[whatsapp-bot](../whatsapp-bot.md) · [slack-bot](../slack-bot.md) · related:
[receipt-duplicate-warning](receipt-duplicate-warning.md), [bot-receipt-editing](bot-receipt-editing.md),
[receipt-image-memory](receipt-image-memory.md)*

## What this is

A receipt too long for one readable photo is photographed in 2–4 overlapping pieces, top to bottom,
and read as ONE receipt: one model call, one expense, one set of lines. Works in the app (phone and
desktop web) and in the Telegram, WhatsApp and Slack bots. Design:
`docs/superpowers/specs/2026-11-12-long-receipt-design.md`. Issue: [ABA-751](https://github.com/micode-ai/ai-budget-assistant/issues/789).

## Entry points

- `apps/api/src/modules/ai/ai.controller.ts` — `POST /ai/scan-receipt` takes `images` (2–4
  `{ imageBase64, mimeType }`) instead of `imageBase64`; billing of parts 2..N and refunds live here.
- `apps/api/src/modules/ai/utils/sanitize.ts` — `ScanReceiptRequestSchema` (and the
  `packages/shared-utils` copy), error codes `parts_count`, `parts_empty`, `parts_with_pdf`,
  `image_or_images`; `RECEIPT_PART_MIME_TYPES`.
- `apps/api/src/modules/ai/services/ocr.service.ts` — `parseReceiptParts`;
  `prompts/receipt-parts.prompt.ts` — the overlap rule.
- `apps/api/src/modules/expenses/receipt-parts.util.ts`, `expenses.service.ts`,
  `expenses.controller.ts` — `ExpenseReceiptPart` storage, `GET/PUT /expenses/:id/receipt-parts`
  (`?from=2` returns only stored parts), create with `receiptImageParts`.
- `apps/api/src/modules/expenses/receipt-duplicate.service.ts` — `receiptFingerprintParts`.
- `apps/api/src/common/bot-receipt-parts.ts` — the helper all three bots share (`appendPart`,
  `canBePart`, `pendingPointerKey`, the per-receipt lock constants).
- `apps/mobile/src/features/receipt/receiptParts.ts`, `useReceiptScanner.ts`,
  `components/receipt/ReceiptPartsCapture.tsx` (and `ReceiptPartsDropZone.web.tsx`),
  `db/receiptPartsRepository.ts`, `components/expenses/detail/ReceiptSection.tsx`.
- `modules/{telegram,whatsapp,slack}/handlers/photo.handler.ts` — the continuation flow.
- `apps/api/test/fixtures/long-receipts/` and `scripts/long-receipt-eval.mjs` — synthetic fixtures
  and the manual measurement.

## Key concepts

**Storage.** `Expense.receiptImage` stays part 1, so every existing reader keeps working unchanged.
Parts 2..N go in `ExpenseReceiptPart { id, expenseId, index 2..4, image, mimeType }`, cascade on
expense delete, `@@unique([expenseId, index])`.

**One model call per scan.** All parts go to the model together with a rule: they are consecutive
sections of ONE receipt that may overlap; output each purchased line once; drop lines duplicated only
by the overlap at the end of part N and the start of part N+1; keep genuinely repeated items; store
and date from the first part, totals from the last. Everything after the read is the ordinary
finalizer (reconciliation, category split, price check, duplicate info, attestation).

**App entry is a link, not the camera.** "Long receipt? Photograph it in parts" opens a parts
capture (R4); the camera and gallery buttons still scan one photo at once, so the single-photo path
is untouched. Each part is downscaled through `receiptImage.ts` like a single receipt. A mismatch
(the lines do not add up to the total on the device) offers Retake instead of Save.

**Viewer.** The expense detail shows part 1 and a thumbnail per further part; the full-screen viewer
opens ONE part at a time (R5), not a strip. The child statement appendix, "Extract items"
regeneration and cross-account move read every part.

**Bots have no timers.** A single photo scans at once. While a confirmation for that user and chat is
pending (30 min at most, the existing pending TTL), a new photo asks "Continuation of this receipt or
a new receipt?". "Continuation" re-reads all parts in one call and **replaces the card** (R6). Cache
keys: `{tg|wa|slack}:receipt-latest:{chatId}:{userId}` (the pending pointer), `{prefix}:scan:{tmpId}`
(the parked photo awaiting the answer), `{prefix}:receipt-busy:{receiptId}` (the lock, 300 s).
Callback ids: `receipt_part:{receiptId}:{tmpId}` / `receipt_new:{tmpId}` (Telegram, Slack),
`receipt_part--{receiptId}--{tmpId}` / `receipt_new--{tmpId}` (WhatsApp, `--` because UUIDs contain
`-`). Slack stores `cardTs` on the pending receipt so a re-posted card replaces the right message; a
Slack multi-image message scans the first image at once and offers the rest one by one (R2).

## Invariants

**Part 1 lives in `Expense.receiptImage`, parts 2..N in `ExpenseReceiptPart`.** Do not move part 1.

**A create re-push carrying part 1 without its parts wipes the stored parts.** So clients always
send ALL parts together with part 1, including offline retries and the retry after a failed local read
(a failed read is an error, never "no parts").

**One model call per scan, with the overlap rule.** Never a call per part.

**The fingerprint covers all parts in order** — SHA-256 over the parts' base64 concatenated
(`receiptFingerprintParts`). A single image fingerprints as before.

**Never attest when the totals do not reconcile.** The multi-part result goes through the same gate as
a single scan; a split receipt is the likeliest place for a dropped line.

**Billing is 2.0 per part times the model multiplier.** The static `@TrackAiUsage('ocr', 2.0)` covers
part 1; the controller charges `2.0 × (n−1) × multiplier` through `SubscriptionsService.trackAiUsage`
BEFORE the model call (that is what enforces the tier limit). A refused extra charge, a coded 400
(`parts_*`) or any Zod failure refunds part 1's guard charge — a client mistake must not cost a scan.

**Bots: no timers, one lock.** Continuation, save, cancel and typed corrections take the per-receipt
lock (`receipt-busy`); a typed correction merges onto a fresh read so it never drops parts. Charge the
part BEFORE deleting the parked photo. Parts are limited to jpeg/png/webp and 1.5 MB decoded, at most
4, cached in `CacheService`, never a module-level Map. Slack falls back to `thumb_1024`/`thumb_720`
for an over-cap original, always fetched (even for a lone photo with nothing pending, so a second photo in a
separate message can continue it). An image that still cannot be a part while a receipt is pending is REFUSED
(`receiptPartTooLarge`: finish the receipt above with Add or Cancel and send the photo again, or send a
smaller one), never silently scanned as a second charged receipt. A tap or typed correction while the
lock is held gets `receiptBusy` ("still reading, wait a moment, then tap again"). When the parts are full
the question is skipped.

**OCR logs carry no receipt content.** `readReceipt` logs only the response length and `finish_reason`;
the model's reading is the receipt itself, so never log it.

**Backups skip parts like images (R3).** The export strips `receiptImage`; parts are never exported
and restore ignores them.

**A PDF cannot be combined with parts** (400 `parts_with_pdf`).

## Known gaps

- The share sheet is unchanged (decision 5): several shared images stay separate receipts.
- The bot lock has no owner token; a continuation running longer than 300 s (`RECEIPT_BUSY_TTL_SEC`) can lose it.
- An offline single-photo receipt can show "could not load all parts" noise on the expense detail.
- WhatsApp: the old card's buttons still act on the updated receipt (a sent message cannot be edited).
- A continuation discards corrections typed on the old card (R6).
- Image parts are not rejected when part 1 is a PDF in the bots' stored receipt.
- The mismatch warning in the app is not recomputed after the user edits lines.
- The eval script is manual on purpose (it costs AI usage). The reconcile rate on the six synthetic
  fixtures has not been measured yet.

## History

[ABA-751](https://github.com/micode-ai/ai-budget-assistant/issues/789) — long receipt in several photos: parts table, multi-image scan, app parts capture, bot
continuation flow, synthetic fixtures. Rulings R1–R6 are recorded above.
