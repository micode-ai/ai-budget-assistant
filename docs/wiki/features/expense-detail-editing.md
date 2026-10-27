# Editing an expense or income after the fact

*Hub: [mobile-app](../mobile-app.md) · related: [expenses-service](expenses-service.md),
[bank-notification-capture](bank-notification-capture.md),
[mobile-screen-decompositions](mobile-screen-decompositions.md)*

## What this is

Three edits on an existing transaction that do not go through the ordinary field update: linking it
to a project, changing its currency, and pulling line items out of a receipt attached after the
expense was created. Also the full-screen receipt viewer with zoom, shared by the expense detail and
the scan confirm card.

## Entry points

- `apps/mobile/src/components/expenses/detail/ExpenseDetailsCard.tsx` — edit form (amount +
  currency chip, project picker), shared by `app/expense/[id].tsx` and desktop `ExpenseDialog`
- `apps/mobile/src/components/income/detail/IncomeDetailsCard.tsx` — the income equivalent
- `apps/mobile/src/components/expenses/detail/ReceiptSection.tsx` — "Extract items"
- `apps/mobile/src/components/expenses/detail/ExpenseItemsSection.tsx`
- `apps/mobile/src/components/receipt/ReceiptImageViewer.tsx` (phone) /
  `ReceiptImageViewer.web.tsx` (web) — the zoomable viewer, opened from `ReceiptSection` and from
  the preview on `apps/mobile/src/components/receipt/ReceiptConfirmCard.tsx`
- `apps/mobile/src/features/receipt/receiptZoom.ts` — the zoom/pan math, tested in
  `apps/mobile/src/features/receipt/__tests__/receiptZoom.test.ts`
- `expenseStore.setExpenseProject`, `apps/mobile/src/db/projectRepository.ts`
  (`addExpenseToProject` / `removeExpenseFromProject`), `apps/mobile/src/components/ProjectPicker.tsx`
- API: `ExpensesService.create` / `update` (the `projectId` branches),
  `ExpenseCrossAccountService.mergeExpenses`

## Key concepts

**The project link is a join row, not a column.** An expense's `projectId` lives in the
`project_expenses` table (server: `ProjectExpense`). `expenseStore.setExpenseProject(expenseId,
projectId | null)` updates memory, the local join table, and the server through
`api.updateExpense(id, { projectId })`. Server-side, `update()` soft-deletes the existing link and
upserts the new one; an explicit `null` clears. `UpdateExpenseDto.projectId` is `string | null`.
Both the create form and the detail card render the shared `ProjectPicker`.

**Changing the currency relabels, it never converts.** The edit-mode amount row is
`[amount input][currency chip]`; the chip opens the `SUPPORTED_CURRENCIES` picker and the value goes
out as `currencyCode` in the ordinary update. Everything downstream already handled the field —
`updateExpenseInDb` writes `currency_code`, the DTO accepts it, the service persists it — and
`currencyCode` is in neither `ENCRYPTION_FIELDS` tier, so no re-encrypt is needed. Splits, items and
trip shares carry no currency of their own and inherit the relabel. The income detail card has the
same chip and the same rule.

**Extracting items from a receipt attached later.** `ReceiptSection`'s "Extract items" re-runs
`POST /ai/scan-receipt` (photo or PDF) over the attached receipt and applies the lines to the
existing expense. `ExpenseItemsSection` renders for any expense whose receipt has loaded
(`hasReceipt`, reported through `onReceiptLoaded`), not only `source: 'ocr'` — mirrored in the
desktop `ExpenseDialog`. One OCR request per regeneration, tracked like any scan.

**When the receipt arrives as a second expense instead.** An auto-captured or imported expense that
is later scanned as a separate OCR expense is offered as a merge, and `mergeExpenses` re-points the
receipt's line items onto the survivor when the survivor has none. The pairing rules (which changed
in ABA-625) are on [bank-notification-capture](bank-notification-capture.md); the alert routing is
the shared `isMergeableDuplicate` / `alertAction` / `mergeTargets` in
`apps/mobile/src/features/dashboard/attentionActions.ts`. Expense rows show an origin badge for
`import` and `notification` sources (`ExpenseListItem`, desktop `TransactionTable`).

**The receipt viewer zooms.** Tapping the receipt thumbnail (or "View image") on the expense
detail, or the small preview on the scan confirm card, opens `ReceiptImageViewer` (`{ visible, uri,
onClose }`). On the phone: pinch from 1× (fit) up to 5×, double-tap toggles fit and 2.5× around
the tap point, one-finger pan when zoomed, built on `react-native-gesture-handler` +
`react-native-reanimated` with no new dependency. On web (component-level `.web.tsx` split): the
mouse wheel zooms around the cursor, drag pans, double-click toggles, a touch double-tap and a
two-finger pinch work on touch screens, and corner buttons zoom in, out and back to fit. PDFs keep
their old behaviour (share/open) in both places. All the arithmetic — fit size, scale clamp, edge
clamp, zoom around a point, the double-tap toggle, the wheel step — lives in the pure
`receiptZoom.ts`, whose functions are `'worklet'`s so the phone runs them on the UI thread inside
gesture callbacks; there is no component renderer in this repo, so that module carries the tests.

## Invariants

**The viewer never lets the receipt leave the screen and always opens at fit.** Scale is clamped
to 1×–5×, and translation is clamped per axis so the scaled image never shows empty space beside
it (an axis narrower than the screen stays centred). The zoomable surface is mounted only while
the viewer is visible and keyed on the uri, so reopening — or a new image — starts from fit with
fresh state; do not hoist the zoom state above that mount.

**Zoom is a transform over the same bitmap.** The viewer renders the file URI the screen already
holds (the materialized receipt, or the downscaled scan copy), laid out at screen size with
`contain`, and scales it with a transform — it never decodes a larger bitmap or builds a `data:`
URL ([receipt-image-memory](receipt-image-memory.md)). The price is that 5× magnifies a stored
800px-wide copy, not the original photo.

**The phone viewer has its own `GestureHandlerRootView` inside the `Modal`.** On Android the
app-level root does not reach the modal window, and without it no gesture fires. The close button
and the web corner buttons are offset by the safe-area insets; the modal is
`statusBarTranslucent`/`navigationBarTranslucent`, so without the insets they would sit under the
system bars.

**On web, a touch double-tap toggles the zoom exactly once.** The web viewer detects a touch
double-tap from pointer events, but Chrome Android and iOS Safari may also fire `dblclick`, which
would zoom straight back out. `shouldHandleDoubleClick` in `receiptZoom.ts` drops a `dblclick` that
is touch-generated or comes within 500 ms of a touch toggle; a drag or either finger of a pinch is
never counted as a tap. The wheel is captured on the whole overlay, so the page behind never
scrolls while the viewer is open.


**Never set the project through the generic `updateExpense(id, updates)`.** The field is not a
column, and `undefined` is dropped from the JSON body, so clearing is impossible that way.

**Regeneration replaces the line items, never appends,** and asks first when the expense already
has items. Running OCR twice would otherwise duplicate every line.

**Saving or attaching a receipt image fires no anomaly check.** Attach and anomaly detection are
deliberately separate; only an expense create runs the detectors.

**A project id resolves as `id` OR `clientId`, within the account, on update as on create.** The
phone's local project id is the server's `clientId`; `update()` once matched on `id` only and
silently dropped the link for a project created on the device (ABA-626). An unknown project id
leaves the existing link alone rather than failing the edit — the project may simply not have
synced yet; an explicit `null` clears it.

## History

ABA-379 (expense currency editable; income followed under tech-debt `income-currency-not-editable`)
· ABA-568 (receipt item regeneration, the merge suggestion, origin badges) · ABA-625 (the
suggestion's pairing rules rewritten) · receipt zoom viewer ([ABA-700](https://github.com/micode-ai/ai-budget-assistant/issues/733)).
