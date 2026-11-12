# Long receipt in several photos — design

Status: draft · 2026-11-12. Owner asked: a long receipt can be sent as two (or more)
overlapping photos — top, then a bottom that overlaps the top — in the app and through the bots.
Everything else marked *(my call)*.

## Intent

A long supermarket receipt does not fit in one sharp photo. Today the scan takes exactly one
image (`POST /ai/scan-receipt` reads one `imageBase64`), and sharing two photos creates two
separate expenses. The user wants to photograph the receipt in parts, with an overlap, and get one
expense with one clean list of lines.

## Goals

- In the app: after the first photo, "Add next part" takes another photo (or picks one); up to
  4 parts *(my call)*; one scan returns one receipt.
- In the bots (Telegram, WhatsApp, Slack): photos the user sends together can be read as one
  long receipt.
- Lines that appear in two parts because of the overlap are counted once.
- The existing checks still decide whether the result is trusted: line sum vs total
  (`receiptTotalsReconcile`), duplicate warning, category split, price check, community
  attestation rules.

## Non-goals

- Stitching images into one picture on the device or server. *(my call — the model reads the
  parts directly; no image library is needed)*
- Multi-part PDFs (a PDF can already hold several pages).
- Automatic detection that two separately sent photos belong together without the user saying
  so. *(my call — a wrong merge is worse than asking)*

## Anti-goals

- Silently merging two different receipts into one expense.
- Double-counting overlapped lines, or dropping a real repeated purchase (two identical lines
  that are genuinely two items).

## How it works

### API *(my call)*

- `POST /ai/scan-receipt` accepts either the existing `imageBase64` (unchanged for old app builds
  and bots) or `images: [{ imageBase64, mimeType }]` with 2–4 parts in top-to-bottom order.
  Images only; a PDF stays single.
- One model call receives all parts in order, with instructions: the parts are consecutive
  sections of ONE receipt that may overlap; output each purchased line once; where the end of
  part N and the start of part N+1 show the same lines, keep one copy; keep genuinely repeated
  items (the receipt prints them as separate lines in non-overlapping regions, or as a quantity).
  Header data (store, date) comes from the first part, totals from the last.
- The result goes through the unchanged validation: if the line sum does not reconcile with the
  total, the response carries the existing "not reconciled" state and the user sees the usual
  warning on the confirm card (they can fix lines, as today).
- AI usage: 2.0 per part (a part costs what a receipt costs today).
- Each part is downscaled on the client as receipts are today (`receiptImage.ts`). The stored
  receipt image for the expense: all parts kept, in order, under the existing receipt storage
  (expense detail shows them as a strip). *(my call)*
- Community price attestation: a multi-part scan can attest only if the same gates pass
  (confidence, reconciliation, ≥ 2 lines, geocoded store).

### App

- Receipt scan screen (phone + desktop web): after a part is captured, a row of thumbnails with
  "Add next part" (camera/picker on phone, drop or choose on desktop) and "Done — read receipt".
  The scan runs once, on Done. A hint: "Photograph from top to bottom with a small overlap."
- Share sheet: unchanged in v1 (decision 5).

### Bots

- **Telegram:** photos sent as one album (`media_group_id`) are collected (short buffer, ~2 s
  after the last item) and the bot asks: "One long receipt or N separate receipts?" with two
  buttons. One → multi-part scan; N → today's behaviour per photo.
- **WhatsApp:** no albums; photos from the same user arriving within 15 s of each other are
  grouped and get the same question. *(my call)*
- **Slack:** a message with several image files gets the same question.
- Single photos behave exactly as today.
- Grouping state lives in `CacheService` under the bots' existing key prefixes with TTL (never a
  module-level map); the question's buttons expire with it.
- The rest of the bot flow (confirm card, line editing, category, save) is unchanged and sees one
  receipt.

## Decisions after the builder check *(all my calls)*

1. **Storage.** `Expense.receiptImage` stays part 1, so every existing reader (backups, public
   API, receipt split, cross-account move, statement) keeps working unchanged. Parts 2..N go to a
   new `ExpenseReceiptPart { expenseId, index, image Bytes, mimeType }` table (migration; cascade
   delete). Readers that should show the whole receipt are extended: expense detail (a vertical
   strip), the child statement appendix, "Extract items" regeneration (re-reads all parts),
   backups (export/restore the parts), cross-account move (parts move with the expense). Mobile
   SQLite gets a matching `expense_receipt_parts` table; parts sync with the receipt image the
   same way the image does today.
2. **Fingerprint and attestation.** The duplicate fingerprint of a multi-part scan is the SHA-256
   of all parts' base64 concatenated in order. A multi-part result attests for community prices
   only under the same gates as today — in particular, never when the totals do not reconcile.
3. **Recovery.** A failed reconciliation shows the existing warning; the confirm card adds
   "Retake parts" next to the manual line editing. The ≥ 80 % target is a goal measured on a
   fixture set built during the work, not a release gate. Both copies of `ScanReceiptRequestSchema`
   (API sanitize and shared-utils) are updated deliberately.
4. **Bots — no timers.** A single photo is scanned at once, exactly as today. While a receipt
   confirmation is pending in that chat, the next photo makes the bot ask "Continuation of this
   receipt or a new receipt?" (two buttons). Continuation re-reads all parts together and replaces
   the pending card; new receipt behaves as today. A Telegram album arrives as separate updates, so
   it naturally follows the same rule. Pending parts are cached as downscaled JPEG (≤ 1.5 MB each,
   ≤ 4 parts, same TTL as the pending receipt) under the bots' existing key prefixes.
5. **Share sheet.** Out of scope for v1: several shared images stay separate receipts as today;
   the long-receipt flow is the scan screen's "Add next part". *(reduces risk in the Android
   share queue; can follow later)*
6. **Billing.** Usage is 2.0 per part, recorded dynamically (not the static decorator weight);
   the tier limit check accounts for the number of parts before the call.
7. **Limits.** 2–4 image parts; a PDF cannot be combined with parts (400); `communityBaseline`
   works as for a single image; total request size stays within the existing limits after the
   client downscale (each part ≤ the existing receipt size).

## Success *(my call)*

- A two-part photo of a long receipt yields one expense whose line sum reconciles in ≥ 80% of
  test receipts (a small fixture set of real long receipts, anonymised).
- No change for single-photo scans.

## Left to the builder

Exact prompt wording, the fixture set, UI layout details (desktop via aba-web-designer), cache key
names, i18n keys (9 locales), wiki page and user docs.
