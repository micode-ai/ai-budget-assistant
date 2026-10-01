# Editing an expense or income after the fact

*Hub: [mobile-app](../mobile-app.md) · related: [expenses-service](expenses-service.md),
[bank-notification-capture](bank-notification-capture.md),
[mobile-screen-decompositions](mobile-screen-decompositions.md)*

## What this is

Three edits on an existing transaction that do not go through the ordinary field update: linking it
to a project, changing its currency, and pulling line items out of a receipt attached after the
expense was created.

## Entry points

- `apps/mobile/src/components/expenses/detail/ExpenseDetailsCard.tsx` — edit form (amount +
  currency chip, project picker), shared by `app/expense/[id].tsx` and desktop `ExpenseDialog`
- `apps/mobile/src/components/income/detail/IncomeDetailsCard.tsx` — the income equivalent
- `apps/mobile/src/components/expenses/detail/ReceiptSection.tsx` — "Extract items"
- `apps/mobile/src/components/expenses/detail/ExpenseItemsSection.tsx`
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

## Invariants

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
suggestion's pairing rules rewritten).
