# Smart Shopping List

*Hub: [api](../api.md) · [offline-sync](../offline-sync.md)*

## What this is

Shared, offline-first shopping lists, plus a Pro-gated "where's cheapest" basket comparison built
on the receipt price-history corpus, restock predictions, and deal detection.

## Entry points

- `apps/api/src/modules/shopping-list/` — CRUD, `addItemsByName`, `removeItemsByName`,
  `reconcileWithReceipt`, the templates sibling service
- `apps/api/src/modules/price-history/basket-calculator.ts` — `computeBasket`
- `shopping-reminder.cron.ts` — the daily push
- `common/utils/notification-dedup-ledger.ts` — the generic ledger
- `apps/mobile/src/stores/shoppingListStore.ts`, `shoppingListSync.ts`
- `apps/mobile/app/shopping-list/{index,compare,map}.tsx`

Migrations: `20260707173751_add_shopping_lists`, `20260717120000_add_shopping_notification_log`,
`20260914000000_add_shopping_list_templates`.

## Key concepts

**This module does not use the generic `/sync` machinery.** It has its own SQLite mirror and a
pull-merge cycle: load local → push pending via REST CRUD → pull full → merge upsert → tombstone by
absence.

**Pure, unit-tested cores.** `computeBasket` (per-store latest price, coverage-gated "cheapest"
badge, stale-price flag, majority currency), `predictRestock` (median gap between purchases, ≥3
points) and `detectDeals` (a store's recent price ≥15% below the product's 90-day average, within a
14-day window) mirror each other deliberately.

**Templates are server-only reference data**, not offline-first: no `clientId`, no `syncVersion`, no
soft delete. They mirror the in-memory `merchantRulesStore` precedent rather than the offline-first
`shoppingListStore` one.

## Invariants

**The local row `id` is the `clientId`, permanently.** It never adopts the server PK.

**Mark synced ONLY on the server ack.** Marking before it caused a hydrate-during-create silent
delete.

**The pending sweep pushes `createList` THEN `updateList`**, or an offline rename or archive is
reverted.

**`mergeServerLists` skips still-pending clientIds**, so a stale server copy cannot clobber a local
edit.

**`getLists` materializes a default list only when the account has ZERO lists total**, not when it
merely has zero non-archived ones. The looser condition un-archived the same `default-{accountId}`
list whenever you archived your last one, so an archived list popped back with all its items on the
next pull. Archiving everything must leave an empty create-a-list state.

**`getLists` returns archived lists**, so a cross-device archive is distinguishable from a delete.
Omitting them once caused an account-wide silent delete: the merge tombstoned, then pushed
`deleteList` for a list that was still present. For the same reason the pull-merge loads the FULL
set (`includeArchived=true`) and displays only the filtered one — a locally-archived, still-pending
list must be in the merge's local snapshot to be protected by the pending guard.

**Direct-POST create is idempotent on `clientId`.**

**Item writes are not `ViewerBlockGuard`-gated** (the list is collaborative); `deleteList` is. The
same split governs templates: create, rename and apply are any member; delete is `canEdit`.

**`apply` merges, never replaces.** Each template item is compared by `normalizeProductName` against
the target list's existing non-deleted items; a match is skipped, everything else is created with
its own fresh `clientId` so offline-first clients adopt it on the next pull.

**Every push is gated through the dedup ledger.** `predictRestock` is level-triggered, so a
frequently-bought staple stays perpetually overdue — the cron used to say "buy bread" every morning.
Restock fires once per purchase cycle (the key embeds `lastPurchase`, so only a repurchase re-arms
it); deals once per product+merchant+ISO-week; both behind a soft per-account per-type floor. Dedup
is insert-and-catch-P2002, with no `$transaction`.

**The whole per-account loop body is try/catch-wrapped**, so one account's DB error cannot abort the
run.

**The cron's member query filters only on `pushToken`/`isActive`** and relies on
`NotificationsService.sendToUser`'s per-type gate, so a deal-only opt-in still receives deal pushes.

**Receipt reconciliation is exact-match-after-normalization, never fuzzy.** A false-positive
auto-check is worse than a missed one. The server-side path (for bots) is deliberately separate from
the mobile one and is **not** wired into `ExpensesService.create` — both the app's own scans and
every bot use `source: 'ocr'` with nothing to tell them apart, so a shared hook would double-run.

**The bot reconciliation call has its own `.catch()`, separate from the surrounding try/catch**,
because by the time it runs the expense already exists — its failure must never be reported as an
expense-creation failure.

## Known gaps

- Alias-aware reconciliation on mobile is best-effort: it uses whatever the price-history store
  happens to hold this session, so a product renamed on another device still will not auto-match.
  The server-side path always has the full alias table.
- No quantity parsing and no named-list targeting for the three AI chat tools.
- Templates have no management screen — rename and delete are inline in the same sheet.

## History

ABA-330 (M1–M6) · ABA-332 (the shopping hub quick action) · ABA-348 (archive-to-empty-state; the
AI chat add tool) · ABA-350 (push de-duplication) · ABA-352 and ABA-429 (screen decomposition,
twice — it grew back once) · ABA-360 (remove and query chat tools) · ABA-455 (the ledger
generalised) · ABA-531 and ABA-545 (receipt reconciliation, mobile then bots) · ABA-548 (templates).
