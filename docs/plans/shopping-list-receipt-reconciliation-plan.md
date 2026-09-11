# Plan: Auto-check off shopping list items when a matching receipt is scanned

Product idea: `docs/product-ideas/shopping-list-receipt-reconciliation.md`
Orchestration run: f10d1d67-d9b3-4b8d-8547-5faa5b0dbe4a

## Decision log (answers to the idea's open questions)

1. **Match bar**: exact match only, after normalization (`normalizeProductName` —
   the same key the server's `product_category_rules` cache already uses).
   No fuzzy/substring matching. A false-positive auto-check is worse than a
   missed one; the idea's own conservative-bar suggestion is the one we build.
2. **Where it runs**: entirely **client-side**, in the mobile app, right after
   a receipt-scanned expense is actually created (`useReceiptSave.handleConfirmExpense`,
   after `addExpense()` resolves) — not inline at OCR-preview time (nothing is
   "on the shopping list" yet at that point, the expense doesn't exist), and
   not a fire-and-forget server hook. The client already holds BOTH halves of
   the match (`shoppingListStore.lists[].items` and the receipt's edited line
   items) in memory at that exact moment, so no new server endpoint, no new
   Prisma migration, and no round trip are needed — this really is "mostly
   wiring", as the idea's cost estimate assumed. The auto-check itself reuses
   the *existing* `PATCH /shopping-list/items/:id` (`isChecked`) write path,
   the same one a manual tap already uses.
   - Scope: the mobile app's own receipt scan-and-save flow only (shared by
     the routed screen `app/expense/receipt.tsx` and the ABA-499 desktop
     `ExpenseDialog`, since both go through `useReceiptSave`). Telegram /
     WhatsApp / Slack bot receipt scans are explicitly OUT of scope for this
     pass — noted as a deferred follow-up, since bots create the expense
     server-side with no client-side shopping-list state to reconcile against.
3. **Opt-out toggle**: yes — a personal, device-local preference (mirrors
   `locationSettingsStore`'s shape exactly), default **ON**. Surfaced as a
   toggle in `DataSettings.tsx` (Settings → Data), next to the existing
   location-capture and community-price toggles — the closest existing
   precedent for "a receipt scan silently does something extra, off by
   choice." Not server-synced: this is a per-device automation preference,
   not account data, so no migration and no `User` column.

## Why no server change

Re-reading the idea's sketch against the actual post-create hook chain
(`ExpenseCreatedHooksService`) surfaced a real constraint: every hook there is
fire-and-forget and explicitly documented as "never throws into the caller" —
none of them feed a result back into the create response. Making the
match+undo synchronously visible on the confirm screen (the idea's own UX
ask) while keeping that contract intact would have meant either (a) breaking
the fire-and-forget convention for one feature, or (b) a second round trip
after create just to ask "what got checked off". Since the mobile client
already has both the just-scanned receipt's line items AND the live shopping
list in memory at save time, doing the match purely on-device is strictly
simpler, needs zero backend code, and is fully offline-capable (it works even
if the device is offline when the receipt is saved, exactly like every other
optimistic shopping-list write).

## Task checklist

- [x] Survey existing code: `ShoppingListService`, `ProductRulesService`
      (`normalizeProductName`), `ExpenseCreatedHooksService`, mobile
      `shoppingListStore`, `useReceiptSave`.
- [x] Write module contracts (`docs/contracts/`).
- [x] `packages/shared-utils`: add `normalizeProductName` mirror
      (`src/formatting/product-name.ts`), exported from `formatting/index.ts`.
- [x] Mobile: pure matcher `src/features/shopping-list/receiptReconciliation.ts`
      (`matchReceiptToShoppingList`) + unit tests.
- [x] Mobile: `src/stores/shoppingListAutoCheckStore.ts` (device-local toggle,
      default ON) mirroring `locationSettingsStore.ts`.
- [x] Mobile: `shoppingListStore.ts` — add `reconcileWithReceipt(receiptLines)`
      and `undoReceiptReconciliation(itemIds)` actions, reusing the existing
      `updateShoppingListItem`/`api.updateItem` write path `toggleChecked`
      already uses.
- [x] Mobile: wire `useReceiptSave.handleConfirmExpense` to call
      `reconcileWithReceipt` after a successful save, and extend the
      post-save alert with a "N items checked off" line + an Undo button when
      anything matched.
- [x] Mobile: `DataSettings.tsx` — add the "Auto-check off from receipts"
      toggle section.
- [x] i18n: add new keys to all 9 locale files
      (`receipt.shoppingListChecked_one/_other`, `receipt.undoShoppingListCheck`,
      `shoppingList.autoCheckFromReceipts`, `shoppingList.autoCheckFromReceiptsDesc`).
- [x] Unit tests: matcher, store actions, `useReceiptSave` wiring (existing
      test files extended/added).
- [x] Update `docs/product-ideas/shopping-list-receipt-reconciliation.md`
      frontmatter `status: building`.
- [x] Run mobile + shared-utils relevant test files; fix any failures.
- [x] Run `finish-aba-task` step: ABA GitHub issue + CLAUDE.md + user_docs update.

## Deferred / explicitly out of scope

- Bot (Telegram/WhatsApp/Slack) receipt scans.
- `ProductAlias` (per-account rename) resolution in the match — a renamed
  product just won't auto-match; user still checks it off by hand.
- Server-side / cross-device propagation of the "just auto-checked, still
  undoable" state — Undo only works for the duration the success alert (or
  the in-memory session) is live, matching how the rest of this screen's
  session-scoped state behaves.
