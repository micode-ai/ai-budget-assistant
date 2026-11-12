# Long Receipt in Several Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A long receipt can be scanned as 2–4 overlapping photos — in the app's scan screen and through the Telegram, WhatsApp and Slack bots — producing one expense with each line counted once, all parts stored with the expense.

**Architecture:** `POST /ai/scan-receipt` gains an `images` array; `OcrService.parseReceiptParts` sends all parts to one model call with an overlap rule, then runs the unchanged finalizer (reconciliation, attestation, duplicate info). Part 1 stays in `Expense.receiptImage`; parts 2..N live in a new `ExpenseReceiptPart` table (API) and `expense_receipt_parts` (device). Bots keep scanning a single photo at once and offer "continuation or new receipt" when another photo arrives while a receipt is pending.

**Tech Stack:** NestJS 10, Prisma 5, OpenAI vision (`OCR_RECEIPT_MODEL`), Expo 54 / React Native (+ web), expo-sqlite, Telegraf, WhatsApp Cloud API, Slack Events API, Jest.

**Spec:** `docs/superpowers/specs/2026-11-12-long-receipt-design.md` (including "Decisions after the builder check" — binding).

## Global Constraints

- A multi-part scan has 2–4 image parts in top-to-bottom order; a PDF cannot be combined with parts (400 `parts_with_pdf`); a single `imageBase64` request behaves exactly as today.
- One model call reads all parts; prompt rule: parts are consecutive sections of ONE receipt that may overlap; output each purchased line once; drop lines duplicated only by the overlap between part N's end and part N+1's start; keep genuinely repeated items; store/date from the first part, totals from the last.
- Validation is the existing finalizer: reconciliation, category split, price check, duplicate info, attestation. A multi-part result never attests when totals do not reconcile (same gate as today).
- Duplicate fingerprint of a multi-part scan = SHA-256 over all parts' base64 concatenated in order (`receiptFingerprintParts`).
- AI usage: 2.0 per part × the user's model cost multiplier; the static `@TrackAiUsage('ocr', 2.0)` covers part 1; the controller records `2.0 × (n − 1) × multiplier` more through `SubscriptionsService.trackAiUsage` BEFORE the model call (it enforces the tier limit).
- Storage: `Expense.receiptImage` = part 1 (every existing reader unchanged); parts 2..N in `ExpenseReceiptPart { id, expenseId, index (2..4), image Bytes, mimeType }`, cascade on expense delete, `@@unique([expenseId, index])`.
- Readers extended to all parts: expense detail (vertical strip), child statement appendix, "Extract items" regeneration, backups export/restore, cross-account move. All other readers keep reading part 1 only.
- Each part is downscaled on the client through `receiptImage.ts` exactly as a single receipt is today.
- Bots: no timers. A single photo scans immediately as today. While a pending receipt exists in that chat (≤ 30 min, the existing pending TTL), a new photo asks "Continuation of this receipt or a new receipt?". Continuation re-reads all parts in one call and replaces the pending card. Parts cached as downscaled JPEG ≤ 1.5 MB each, ≤ 4, same TTL, in `CacheService` under each bot's existing prefix; never module-level Maps; a mutated cached object is written back with `cache.set`.
- Share sheet unchanged (several shared images stay separate receipts).
- Repo rules: schema + migration in one commit (DB-free `prisma migrate diff` if no DB, no DROP); no runtime import from `@budget/shared-*` in `apps/api`; both `ScanReceiptRequestSchema` copies (API `ai/utils/sanitize.ts`, `packages/shared-utils/src/validation/index.ts`) updated; fire-and-forget via `logFireAndForget`; every i18n key in 9 locales (app) and in `common/bot-i18n/shared-messages.ts` (bots, 9 languages); phone + desktop web together; component-level platform split; never log image bytes.

## Review Focus

1. **Overlap that contains a genuinely repeated item** (two cartons of milk, one in the overlap and one below it): both kept — pinned in Task 2 (prompt contract test asserts the repeated-item instruction is present) and Task 9 (fixture with a repeated item).
2. **Parts sent in the wrong order or an unrelated second receipt**: totals do not reconcile → the existing warning and "Retake parts" — pinned in Task 2 (unreconciled multi-part never attests) and Task 5 (retake resets parts).
3. **Tier limit reached on part 3 of 4**: the request is refused before any model call and nothing is charged beyond what the guard already counted — pinned in Task 3.
4. **Bot: a photo arrives while a different user's receipt is pending in a group chat**: the pending pointer is per user+chat, never mixes users — pinned in Task 7.
5. **Old app build or bot sending `imageBase64` only**: identical behaviour and fingerprint to today — pinned in Task 3.

---

## File Structure

API:
- `apps/api/src/modules/ai/utils/sanitize.ts` — `ScanReceiptRequestSchema` with `images`.
- `apps/api/src/modules/ai/services/ocr.service.ts` — `parseReceiptParts`.
- `apps/api/src/modules/ai/prompts/receipt-parts.prompt.ts` — the overlap instructions (constant).
- `apps/api/src/modules/ai/services/receipt-fingerprint.util.ts` (or the file that holds `receiptFingerprint` today) — `receiptFingerprintParts`.
- `apps/api/src/modules/ai/ai.controller.ts` — scan-receipt branches on parts; extra usage.
- `apps/api/prisma/schema.prisma` + migration `20261115000000_expense_receipt_parts`.
- `apps/api/src/modules/expenses/` — DTO `receiptImageParts`, `saveReceiptParts`/`getReceiptParts`, routes `GET|PUT /expenses/:id/receipt-parts`.
- Readers: `ai/services/receipt-rescan.service.ts`, `children/child-statement.service.ts`, `backups/backups.service.ts`, `expenses/expense-cross-account.service.ts`.
- Bots: `apps/api/src/common/bot-receipt-parts.ts` (shared pending-parts helpers), `telegram|whatsapp|slack/handlers/photo.handler.ts`, `common/bot-i18n/shared-messages.ts`.

Shared: `packages/shared-utils/src/validation/index.ts` (schema mirror), `packages/shared-types` (DTO types for parts).

Mobile:
- `src/services/ai.api.ts` (`scanReceiptParts`), `src/services/expenses.api.ts` (`getReceiptParts`, `saveReceiptParts`).
- `src/db/client.native.ts` (table `expense_receipt_parts`), `src/db/receiptPartsRepository.ts`.
- `src/features/receipt/useReceiptScanner.ts` (parts state), `src/features/receipt/receiptParts.ts` (pure helpers).
- `src/components/receipt/ReceiptCaptureView.tsx` (+ desktop drop), `ReceiptConfirmCard.tsx` ("Retake parts"), `src/hooks/useReceiptSave.ts`, `src/stores/expenseStore.ts`.
- `src/components/expenses/detail/ReceiptSection.tsx` and `ReceiptImageViewer(.web).tsx` (strip).
- i18n `receipt.parts.*` in 9 locales.

Fixtures: `apps/api/test/fixtures/long-receipts/` (synthetic, see Task 9).

---

### Task 1: Data model and migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`; Create: `apps/api/prisma/migrations/20261115000000_expense_receipt_parts/migration.sql`
- Modify: `packages/shared-types/src/dto/*` (expense create DTO type), `packages/shared-types/src/entities/*` (receipt part type)

**Interfaces:**
- Produces (Prisma): `ExpenseReceiptPart { id String @id @default(uuid()), expenseId String @map("expense_id"), index Int, image Bytes, mimeType String @map("mime_type"), createdAt DateTime @default(now()) @map("created_at") }` → `expense_receipt_parts`, relation to `Expense` `onDelete: Cascade`, `@@unique([expenseId, index])`; `Expense.receiptParts ExpenseReceiptPart[]`.
- Produces (types): `ReceiptImagePart { imageBase64: string; mimeType: string }`; `CreateExpenseDto.receiptImageParts?: ReceiptImagePart[]` (parts 2..N).

- [ ] **Step 1:** Add the model and relation.
- [ ] **Step 2:** Generate SQL DB-free (`git show HEAD:apps/api/prisma/schema.prisma > <scratch>/old.prisma`; `npx prisma migrate diff --from-schema-datamodel <scratch>/old.prisma --to-schema-datamodel prisma/schema.prisma --script`). Expected: CREATE TABLE + unique index + FK only; no DROP.
- [ ] **Step 3:** `npx prisma generate`; `npm run typecheck`. Expected: PASS.
- [ ] **Step 4: Commit** — `feat(receipts): receipt parts data model`

### Task 2: OCR — read several parts as one receipt

**Files:**
- Create: `apps/api/src/modules/ai/prompts/receipt-parts.prompt.ts` + spec
- Modify: `apps/api/src/modules/ai/services/ocr.service.ts`, the file exporting `receiptFingerprint`
- Test: `apps/api/src/modules/ai/services/ocr.service.parts.spec.ts`

**Interfaces:**
- Produces: `RECEIPT_PARTS_INSTRUCTIONS: string` (the Global Constraints overlap rule, including "keep genuinely repeated items" and "header from the first part, totals from the last").
- Produces: `receiptFingerprintParts(parts: string[]): string` — SHA-256 hex over `parts.join('')`; `receiptFingerprintParts([one]) === receiptFingerprint(one)`.
- Produces: `OcrService.parseReceiptParts(parts: ReceiptImagePart[], userId: string, accountId: string, userPrompt?: string, scanOptions?: ReceiptFinalizeOptions): Promise<ReceiptExpense>` — one `readReceipt('Vision', …)` call whose user content is the text prompt (+ `RECEIPT_PARTS_INSTRUCTIONS`) followed by one `image_url` per part in order; then `receiptFinalizer.finalizeReceipt(…)`; then duplicate info with `receiptFingerprintParts`. Throws `BadRequestException` for < 2 or > 4 parts or any `application/pdf` part.

- [ ] **Step 1: Write failing tests:**
  - `sends one model call with N image parts in order after the text prompt`
  - `prompt contains the overlap and repeated-item instructions`
  - `fingerprint covers all parts in order; reordering changes it; one part equals receiptFingerprint`
  - `unreconciled multi-part result carries no scanAttestation` (finalizer called with the normal options; reconciliation false → no token)
  - `rejects 1 part, 5 parts and a PDF part`
- [ ] **Step 2:** `cd apps/api && npx jest src/modules/ai/services/ocr.service.parts src/modules/ai/prompts` — Expected: FAIL.
- [ ] **Step 3:** Implement; reuse `buildReceiptSystemPrompt`, `buildReceiptUserText`, `OCR_RECEIPT_MODEL`, the 4096 max tokens (raise to 6144 for ≥ 3 parts *(builder may tune)*); log sizes only, never bytes.
- [ ] **Step 4:** Tests PASS; existing `ocr.service.spec.ts` PASS unchanged.
- [ ] **Step 5: Commit** — `feat(ocr): read a long receipt from several overlapping photos`

### Task 3: Scan endpoint, both schemas, usage per part

**Files:**
- Modify: `apps/api/src/modules/ai/utils/sanitize.ts`, `packages/shared-utils/src/validation/index.ts`, `apps/api/src/modules/ai/ai.controller.ts`
- Test: `apps/api/src/modules/ai/ai.controller.scan-parts.spec.ts`

**Interfaces:**
- Produces: `ScanReceiptRequestSchema` = existing fields with `imageBase64` optional, plus `images: z.array(z.object({ imageBase64: z.string().min(1), mimeType: z.string().optional() })).min(2).max(4).optional()`, refined: exactly one of `imageBase64` / `images`.
- Controller: when `images` present → `subscriptionsService.trackAiUsage(userId, 'ocr', 2.0 * (n − 1) * getAiCostMultiplier(user.aiModel), accountId)` first, then `ocrService.parseReceiptParts(...)` with the same `communityBaseline` option; else today's path untouched.

- [ ] **Step 1: Write failing tests:** `imageBase64-only request takes today's path and fingerprint`; `images of 2 records 2.0 extra (×multiplier) before the OCR call`; `tier limit hit on the extra usage → refused, OCR never called`; `both fields or neither → 400`; `PDF in images → 400 parts_with_pdf`; shared-utils schema accepts/rejects the same cases.
- [ ] **Step 2:** Run the spec — FAIL.
- [ ] **Step 3:** Implement both schema copies identically (comment each naming the other).
- [ ] **Step 4:** Tests PASS; `bash scripts/check-no-shared-utils-runtime-import.sh` PASS.
- [ ] **Step 5: Commit** — `feat(ai): scan-receipt accepts 2–4 parts, charged per part`

### Task 4: Expense receipt parts — store, serve, and every reader

**Files:**
- Modify: `apps/api/src/modules/expenses/{expenses.service.ts,expenses.controller.ts,dto/index.ts}`, `expense-cross-account.service.ts`, `apps/api/src/modules/ai/services/receipt-rescan.service.ts`, `apps/api/src/modules/children/child-statement.service.ts` (+ pdf), `apps/api/src/modules/backups/backups.service.ts`
- Test: specs beside each

**Interfaces:**
- Produces: create accepts `receiptImageParts` (≤ 3 extra parts; requires `receiptImageBase64`); `ExpensesService.getReceiptParts(accountId, expenseId): Promise<Array<{ index: number; imageBase64: string; mimeType: string }>>` (index 1 = `receiptImage`); `saveReceiptParts(accountId, expenseId, parts: ReceiptImagePart[])` replaces parts 2..N in one `$transaction` (part 1 written to `receiptImage`); `deleteReceiptImage` also deletes parts. Routes `GET /expenses/:id/receipt-parts`, `PUT /expenses/:id/receipt-parts` (ViewerBlockGuard), resolving the expense by `OR:[{id},{clientId}]` within the account.
- Readers: rescan reads all parts and calls `parseReceiptParts` when > 1; statement appendix renders every part (within the existing per-image and total caps); backups export/restore parts with id remapping; cross-account move keeps parts with the moved expense.

- [ ] **Step 1: Write failing tests:** `create with parts stores part 1 on the expense and 2..N in the table`; `GET receipt-parts returns all in order; foreign account → 404`; `PUT replaces parts atomically`; `delete receipt image removes parts`; `rescan of a 3-part receipt calls parseReceiptParts with 3 parts`; `statement appendix includes all parts`; `backup round-trip restores parts`; `cross-account move keeps parts`.
- [ ] **Step 2:** `npx jest src/modules/expenses src/modules/ai/services/receipt-rescan src/modules/children src/modules/backups` — FAIL.
- [ ] **Step 3:** Implement; `findAll` select unchanged (parts are never in list responses).
- [ ] **Step 4:** Tests PASS; api typecheck; eslint on changed files.
- [ ] **Step 5: Commit** — `feat(expenses): store and serve all receipt parts`

### Task 5: App — capture, confirm and save several parts (phone + desktop)

**Files:**
- Create: `apps/mobile/src/features/receipt/receiptParts.ts` + `__tests__/receiptParts.test.ts`, `apps/mobile/src/db/receiptPartsRepository.ts` + test
- Modify: `src/db/client.native.ts` (table `expense_receipt_parts(expense_id TEXT, idx INTEGER, image TEXT, mime TEXT, PRIMARY KEY(expense_id, idx))`, idempotent create), `src/services/ai.api.ts` (`scanReceiptParts(parts, userPrompt?)`), `src/services/expenses.api.ts` (`getReceiptParts`, `saveReceiptParts`), `src/features/receipt/useReceiptScanner.ts`, `src/components/receipt/ReceiptCaptureView.tsx`, `ReceiptConfirmCard.tsx`, `src/hooks/useReceiptSave.ts`, `src/stores/expenseStore.ts` (`addExpense` takes `receiptImageParts`, saves locally and sends with create), 9 locales
- Desktop: the receipt capture/drop on web (`.web.tsx` sibling where the capture view splits today)

**Interfaces:**
- `receiptParts.ts`: `MAX_RECEIPT_PARTS = 4`; `addPart(parts: ScanPart[], p: ScanPart): ScanPart[]` (refuses beyond 4); `removePart(parts, index)`; `canScan(parts): boolean` (≥ 1).
- `useReceiptScanner` gains `parts`, `addPart`, `removePart`, `scanParts()` (1 part → today's `scanReceipt`; ≥ 2 → `scanReceiptParts`), `retakeParts()` (clears parts and result).
- UI: after a capture, thumbnails + "Add next part" + "Read receipt"; hint "Photograph from top to bottom with a small overlap"; confirm card shows "Retake parts" when parts > 1; each part downscaled via `receiptImage.ts` before base64.

- [ ] **Step 1: Write failing tests:** `addPart caps at 4`; `scanParts with one part calls scanReceipt, with two calls scanReceiptParts in order`; `retakeParts clears parts and result`; `addExpense with parts writes expense_receipt_parts locally and includes receiptImageParts in the create payload`; repository round-trip.
- [ ] **Step 2:** `cd apps/mobile && npx jest src/features/receipt src/db src/stores` — FAIL.
- [ ] **Step 3:** Implement phone and desktop; keys in 9 locales; viewers read-only.
- [ ] **Step 4:** Tests PASS; full mobile jest once; typecheck; lint. Best-effort visual check at 390/1280 px.
- [ ] **Step 5: Commit** — `feat(receipts): scan a long receipt in several photos in the app`

### Task 6: App — show all parts on the expense

**Files:**
- Modify: `src/components/expenses/detail/ReceiptSection.tsx`, `src/components/receipt/ReceiptImageViewer.tsx` + `.web.tsx`, the desktop `ExpenseDialog` host, `src/stores/expenseStore.ts` (`loadReceiptParts(expenseId)`: local first, then `GET receipt-parts` online)
- Test: `src/features/receipt/__tests__/receiptPartsView.test.ts` (pure ordering/merge helper)

**Interfaces:** `loadReceiptParts(expenseId): Promise<Array<{ index; uri }>>` — file URIs, never `data:` URLs (receipt-image-memory rule); the viewer renders a vertical strip; one part renders exactly as today.

- [ ] **Step 1:** Failing test for the merge helper (local parts win; server parts fill gaps; sorted by index).
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement phone + desktop.
- [ ] **Step 4:** Tests PASS; typecheck; lint.
- [ ] **Step 5: Commit** — `feat(receipts): show every part of a long receipt`

### Task 7: Bots — shared pending-parts helper and Telegram

**Files:**
- Create: `apps/api/src/common/bot-receipt-parts.ts` + spec
- Modify: `apps/api/src/modules/telegram/handlers/photo.handler.ts` (+ spec), `apps/api/src/common/bot-i18n/shared-messages.ts`

**Interfaces:**
- `bot-receipt-parts.ts`: `MAX_BOT_PARTS = 4`; `MAX_BOT_PART_BYTES = 1_572_864`; `pendingPointerKey(prefix: string, chatId: string, userId: string): string` → `${prefix}:receipt-latest:${chatId}:${userId}`; `appendPart(cache: CacheService, receiptKey: string, part: ReceiptImagePart, ttlSec: number): Promise<'ok' | 'full' | 'too_large' | 'expired'>` (reads the pending receipt, appends, writes back with `cache.set`, keeps TTL).
- Pending receipt data gains `parts: ReceiptImagePart[]` (part 1 = today's `receiptImageBase64`).
- Telegram: after a scan creates a pending receipt, set the pointer (TTL = `PENDING_RECEIPT_TTL_SEC`). On a new photo with a live pointer: reply `receiptContinuationQuestion` with buttons `receipt_part:{receiptId}:{tmpId}` (continuation) and `receipt_new:{tmpId}` (new); the new photo is parked under `telegram:scan:{tmpId}` (existing pending-scan pattern). Continuation → `appendPart` → `ocrService.parseReceiptParts(all parts)` → replace the pending receipt (items, totals, fingerprint, attestation) and edit/re-send the confirm card. New → today's scan. Save sends `receiptImageParts`.
- Shared messages (9 languages): `receiptContinuationQuestion`, `receiptContinuationYes`, `receiptContinuationNo`, `receiptPartsFull`, `receiptPartTooLarge`.

- [ ] **Step 1: Write failing tests:** helper: `appendPart writes back with cache.set and caps at 4`, `too_large over the byte cap`, `expired when the receipt key is gone`; Telegram: `single photo with no pointer scans immediately (unchanged)`, `photo with a live pointer asks the question`, `continuation re-reads all parts in one call and replaces the card`, `new receipt scans the photo alone`, `pointer is per chat and user — another user's photo in a group is not offered as continuation`, `save passes receiptImageParts`.
- [ ] **Step 2:** `npx jest src/common/bot-receipt-parts src/modules/telegram` — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests PASS; api typecheck; eslint on changed files.
- [ ] **Step 5: Commit** — `feat(bots): Telegram accepts a long receipt in several photos`

### Task 8: Bots — WhatsApp and Slack

**Files:**
- Modify: `apps/api/src/modules/whatsapp/handlers/photo.handler.ts` (+ spec), `apps/api/src/modules/slack/handlers/photo.handler.ts` (+ spec)

**Interfaces:** same flow as Task 7 through `bot-receipt-parts.ts`, with each bot's button/callback format (WhatsApp interactive reply ids use `--` separators; Slack block actions; respect the Slack `file_share` subtype rule and no `blocks: []` on `chat.update`). A Slack message with several image files: the first is scanned, the rest are offered one by one as continuation (same question) *(builder's call: process sequentially)*.

- [ ] **Step 1: Write failing tests** mirroring Task 7's list for each bot, plus `slack message with 2 images: first scans, second asks continuation`.
- [ ] **Step 2:** `npx jest src/modules/whatsapp src/modules/slack` — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests PASS; typecheck; eslint.
- [ ] **Step 5: Commit** — `feat(bots): WhatsApp and Slack accept a long receipt in several photos`

### Task 9: Fixtures, reconcile-rate script, docs

**Files:**
- Create: `apps/api/test/fixtures/long-receipts/README.md`, `apps/api/test/fixtures/long-receipts/*.json` (expected lines + totals), `scripts/long-receipt-eval.mjs`
- Create: `docs/wiki/features/long-receipt-parts.md`; Modify: `docs/wiki/index.md` + hub, `docs/wiki/log.md` (ABA-TBD), `docs/wiki/features/bot-receipt-editing.md`, `receipt-image-memory.md`, `account-backups.md` (pointers)
- Modify: `user_docs/<9 langs>/04-voice-and-receipt.md` ("Long receipts"), then `npm run generate:help` and the public help rebuild per `features/help-content-pipeline.md` (`LANDING_BASE= ROBOTS="index,follow,max-image-preview:large"`, `git add -f` changed pages only)

**Interfaces:**
- Fixtures are SYNTHETIC: receipts rendered from made-up shops, items and prices into images (e.g. an HTML/canvas template screenshotted by the script, or hand-made images), then cut into 2–3 overlapping crops; no real user data. At least 6 receipts, including one with a repeated item across the overlap boundary.
- `scripts/long-receipt-eval.mjs --api <url> --token <env>`: sends each fixture's crops to `/ai/scan-receipt`, compares line count and totals with the expected JSON, prints reconcile rate. Manual (costs AI usage), never in CI.

- [ ] **Step 1:** Write fixtures + script; `node --check scripts/long-receipt-eval.mjs`.
- [ ] **Step 2:** Docs, user docs in 9 languages; `npm run generate:help`; `python scripts/wiki-lint.py` — no findings.
- [ ] **Step 3: Commit** — `docs(receipts): long receipt fixtures, eval script, wiki and user docs`
