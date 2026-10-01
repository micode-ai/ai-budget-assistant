# Mobile screen decompositions

*Hub: [mobile-app](../mobile-app.md) · related: [home-screen](home-screen.md),
[desktop-transactions-screen](desktop-transactions-screen.md),
[settings-desktop-shell](settings-desktop-shell.md)*

## What this is

A register of the screens that were split out of oversized route files, stating which file owns
what today. Each split followed the same shape: pure logic and form state in a hook (or a
`src/features/<area>/` module), presentational JSX in `src/components/<area>/`, and a route that
only composes them. Several bodies later moved out of `app/` entirely so a desktop dialog or
settings pane could host them — nothing under `src/` may import from `app/`.

## Key concepts

**The shape.** The screen keeps simple local UI state and the save/submit handler; a sub-form with
its own state machine gets a hook + component pair; theme-dependent lookup tables and formatters go
to a pure, theme-parameterised module so they can be unit-tested without the screen. A component
that must expose its save to a parent's button does it through `forwardRef` +
`useImperativeHandle` (`triggerSave()`), never a second edit implementation.

**Where each screen lives now.**

| Route | Owns today | Extracted pieces |
|---|---|---|
| `app/income/[id].tsx` | not-found guard, `isEditing`, delete, action row | `src/components/income/detail/IncomeDetailsCard.tsx` — amount + details cards, every `edit*` field and picker, tags fetch, debt-repayment banner, debt info; `triggerSave()` via ref |
| `app/account/[id].tsx` | account info edit / delete / leave | `src/components/account/FinancialMonthSheet.tsx` (anchor-day sheet), `MembersSection.tsx` (members, roles, pending invitations, invite), `TripSection.tsx` — **two** exports, `TripActionsCard` (settle-up, payment settings, trip map) and `TripArchiveButton` (owner-only archive with the unconfirmed-settle-up force retry), one module because they share the archive lifecycle but render in non-adjacent slots |
| `app/debts/index.tsx` | tab / filter / refresh / add-sheet state, the `FlatList` | `src/features/debts/debtDisplay.ts` (`getStatusColor`, `getStatusBackgroundColor`, `formatDueDate`); `src/components/debts/` — `DebtSummaryCards`, `DebtSegmentedTabs`, `DebtFilterChips`, `DebtListItem`, `AddDebtSheet`, `DebtsEmptyState`, `DebtsBottomNav` |
| `app/fat-finder.tsx` | data loading, month navigation, the AI-cost confirmation | `src/features/fat-finder/fatFinderDisplay.ts` (`TYPE_ICONS`, `SEVERITY_LABELS`, severity colours, dates, month label); `src/components/fat-finder/` — `MonthPicker`, `FatFinderHeader`, `FatFinderFooter`, `FindingCard` (owns its own expand/collapse) |
| `app/expense/receipt.tsx` | route chrome only: close, title, `AiUsageBadge`, the share-to-capture queue prompt | `src/components/receipt/ReceiptExpenseView.tsx` — the whole flow (also hosted by the desktop `ReceiptDialog`), composing `src/hooks/useReceiptCategorySplit.ts` (split state, server-split seeding, proposed categories), `src/hooks/useReceiptSave.ts` (create / hand off to the form, GPS capture), `ReceiptCaptureView.tsx`, `ReceiptConfirmCard.tsx` (with `ReceiptItemsEditor.tsx`), `ItemCategorySheet.tsx`; image helpers in `src/features/receipt/receiptImage.ts` |
| `app/wallet/transfer.tsx` | the history header button | `src/components/wallet/TransferCreateView.tsx` (also hosted by desktop `TransferDialog`), on `src/hooks/useTransferForm.ts` (all form state, currency/account sync, FX lookup, cross-fill, frequent-route prefill, `Max`, submit) and `FrequentTransferChips`, `TransferAccountCard`, `TransferAvailableRow` |
| `app/wallet/[id].tsx` | read-only detail view and the edit layout | `src/hooks/useTransferEditForm.ts`; reuses `TransferAccountCard` for the edit-mode pickers |
| `app/expense/new.tsx` | nothing — a one-line host | `src/components/expenses/create/ExpenseCreateForm.tsx` (also hosted by desktop `CreateDialog`) — basic fields, trip split, submit; sub-forms `useDebtExpenseFields` + `DebtExpenseFields`, `useRecurringExpenseFields` + `RecurringExpenseFields`, `useCategorySplitEditor` + `CategorySplitSection` |
| `app/settings/products.tsx` | the `<Stack.Screen>` title override | `src/components/settings/products/ProductsSettings.tsx` — list, search, AI backfill; hooks `useProductMultiSelect`, `useProductRename`, `useProductMerge`; modals `RenameProductModal`, `MergeProductsModal`, `ProductDetailModal` in `src/components/settings/` |

The home tab is on [home-screen](home-screen.md); the desktop transactions screen's dialog split is
on [desktop-transactions-screen](desktop-transactions-screen.md).

## Invariants

**Extend the owning hook or component, not the route file.** Every row above was split because a
route had grown past several hundred lines with a dozen or more `useState` hooks; a new field or
feature goes into the piece that owns that concern, and a new sub-form gets its own hook +
component pair rather than another inline `useState`.

**The transfer edit form does not show the available balance or the `Max` button.** For an edit,
the transfer's own amount has already left the source balance, so the create screen's
`TransferAvailableRow` would double-count it; `chipBalance` returns `null` and the currency picker
stays hidden while editing. `fromCurrency` / `toCurrency` are derived from the selected accounts,
not separate state.

**A sheet that renders as an overlay stays at screen level** (`ItemCategorySheet`), wherever in the
tree its trigger lives.

## Known gaps

- `ExpenseCreateForm.tsx`, `ProductsSettings.tsx` and `ExpenseDetailsCard.tsx` have regrown to
  several hundred lines each since their splits; `app/expense/[id].tsx` was never split the same
  way (tech-debt `expense-detail-screen-oversized`).

## History

ABA-414 (account detail) · ABA-424 (debts) · ABA-439 (Fat Finder) · ABA-448 (receipt scan) ·
ABA-469 (transfer create) · ABA-477 (expense create) · ABA-478 (products settings) · ABA-479
(transfer detail) · ABA-496 (income detail) · ABA-499, ABA-517 and the settings desktop shell
(bodies moved out of `app/` so desktop dialogs and panes can host them).
