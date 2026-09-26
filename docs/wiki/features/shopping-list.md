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
- `apps/api/src/modules/shopping-list/shopping-list-guest.controller.ts` — the public guest
  surface, `apps/api/src/modules/shopping-list/helpers/guest-list-page{,-i18n}.ts`

Migrations: `20260707173751_add_shopping_lists`, `20260717120000_add_shopping_notification_log`,
`20260914000000_add_shopping_list_templates`, `20260924000000_add_shopping_list_guest_token`.

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

- **The guest toggle is Post/Redirect/Get.** `POST /sl/:token/items/:itemId/toggle` answers 303 to `/sl/:token`; rendering the page straight from the POST let a refresh re-submit and flip the item back ([ABA-600](https://github.com/micode-ai/ai-budget-assistant/issues/624)). Each row is one submit button with a drawn tick box — a `disabled` checkbox inside the button swallowed clicks on the box.
- **On web the share button copies the link.** `shareLinkOrCopy` falls back to the clipboard when `Share.share` rejects (a desktop browser); only a failed create is reported as an error.


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
auto-check is worse than a missed one. `normalizeProductName` is mirrored from the API's canonical
copy into `shared-utils`, so the client keys on the exact same rule the server's product-category
rules do.

**Reconcile after the expense exists, never at OCR-preview time.** Nothing is "on the list" until
the expense is actually saved, so the mobile call sits in the save handler right after `addExpense`
succeeds — and it reuses the *existing* item-update endpoint a manual checkbox tap already uses, so
it works offline with no new API surface. Candidates are unchecked items across **non-archived**
lists only.

**The alias map is opportunistic on mobile and complete on the server.** OCR invents a fresh
`canonicalName` per scan and has no memory of a prior rename, so the client resolves through
whatever the price-history store happens to hold this session, adding no network call. The server
path always has the account's full alias table.

**Auto-check is undoable and opt-out.** The success alert carries an Undo that reverts exactly those
ids unconditionally — safe even if the user has since toggled one by hand — and a device-local MMKV
toggle defaults **ON**, unlike location capture, because this is a convenience automation rather
than a privacy-sensitive capture.

**The mobile and server implementations are deliberately separate**, and the server one is **not**
wired into `ExpensesService.create`: both the app's own scans and every bot use `source: 'ocr'` with
nothing to tell them apart, so a shared hook would double-run reconciliation for the app path.

**The bot reconciliation call has its own `.catch()`, separate from the surrounding try/catch**,
because by the time it runs the expense already exists — its failure must never be reported as an
expense-creation failure.

### From the AI chat

Three tools reach the list from chat: `add_to_shopping_list({ items })`,
`remove_from_shopping_list({ items })` and `get_shopping_suggestions()`.

**The two writes execute immediately** — no confirmation card and no read cache. `chat.service.ts`
routes them in dedicated branches **before** the `isWriteAction` confirmation/viewer check, because
item writes are not `ViewerBlockGuard`-gated in the app either, so viewers may add and remove too.
Add goes through `ShoppingListService.addItemsByName` — the first non-archived list, else it revives
or creates `default-{accountId}` — one item per name with a fresh server `clientId`. The executor
also tolerates a lone `item` string.

**Remove matches, it never fails.** `removeItemsByName` matches case-insensitively on `rawLabel`
(falling back to `canonicalName`) among **unchecked**, non-deleted items across every non-archived
list, soft-deletes the first match per name with a `syncVersion` bump, and returns the rest as
`notFoundLabels` — one bad name does not fail the others. There is no "mark as bought" tool:
removing via chat is how "I already bought X" is handled.

**Suggestions are an ordinary read tool** — cached 10 minutes through the generic
`executeWithCache` path with no dedicated branch; top 5 each of `getRestockSuggestions` and
`getDeals` (both free endpoints, so the tool bypasses no gate). The system prompt separates it from
`get_inflation_shield`: this is today's restock and deals, the shield is long-term stock-up advice.

Confirmations are deterministic in nine languages (`PromptBuilder.getShoppingListAddText` /
`…RemoveText`), and the phone renders its own result cards. The phone sees a chat-added item on its
next pull.

### Guest share link (ABA-587)

A public, unauthenticated link so someone with no account — "can you grab milk on your way
home" — can see one list and check items off, without becoming a member. Reuses the isolation
pattern of receipt-split's `GuestController` (`docs/contracts/shopping-list-guest-share-link.md`
has the full contract), but is its own self-contained implementation — own `sl/(.*)` prefix
exclusion, own i18n/HTML helpers, no shared code with the receipt-split guest surface.

**One token per list, on the list row itself** (`ShoppingList.guestToken`), not a participant
table — unlike a receipt split's many payers, a shopping list guest link has only one shared
view, so a second table would model a distinction this feature doesn't have. `POST
/shopping-list/:id/guest-link` is **idempotent**: re-sharing returns the existing token rather
than rotating it, so a link already handed to someone keeps working. `DELETE .../guest-link` is
a safe no-op when there is no active link — the mobile client tracks no local "is a link active"
state, so it calls Revoke freely.

**No expiry.** The link dies implicitly when the list is archived or soft-deleted (`findUsableList`
filters `isArchived:false, isDeleted:false`), or explicitly via Revoke — never on a timer.

**Guest capability is read + check-off only** — no add, rename, or delete. `POST
/sl/:token/items/:itemId/toggle` re-scopes the item lookup to `shoppingListId: list.id`: a token
only proves "you may act on THIS list," so a bare `itemId` is never trusted on its own (the one
IDOR-shaped risk in the feature). A guest's toggle bumps `syncVersion` exactly like an authenticated
`updateItem` does, so it reaches real members through the ordinary REST pull-merge above — no
`/sync` involvement, no Family Feed event (the base feature has none for its own authenticated
writes either, so adding one only for the guest path would be new scope).

**`findUsableList` is a single query**, deliberately NOT the two-query split
`GuestController.findUsableParticipant` uses to keep an unknown-vs-dead receipt-split token from
being a timing oracle — that split exists because a receipt split's liveness carries a
payment-status signal worth hiding. A shopping-list guest link protects no money and no other
party's financial data, so the worst a timing difference could leak here ("a token existed at some
point") isn't sensitive.

**No amounts, ever.** A shopping list item has no price, so unlike the receipt-split guest page
this surface has structurally less to leak — no accountId, no member names, no financial figures,
only this one list's own item labels.

**Mobile is online-only, no SQLite mirror.** `shoppingListStore.shareList`/`revokeShareLink` are
thin passthroughs to the API — the guest token is a server-side bearer credential this module's
own offline-first mirror has no notion of, same precedent as account-transfers' `moveExpense`.

## Known gaps

- Alias-aware reconciliation on mobile is best-effort: it uses whatever the price-history store
  happens to hold this session, so a product renamed on another device still will not auto-match.
  The server-side path always has the full alias table.
- No quantity parsing and no named-list targeting for the three AI chat tools.
- Templates have no management screen — rename and delete are inline in the same sheet.
- The guest share link has no rotate-without-revoking: "Revoke" then "Share" again is the
  rotation path. No QR code (receipt-split has one for its own group-split flow; not built here).

## History

ABA-330 (M1–M6) · ABA-332 (the shopping hub quick action) · ABA-348 (archive-to-empty-state; the
AI chat add tool) · ABA-350 (push de-duplication) · ABA-352 and ABA-429 (screen decomposition,
twice — it grew back once) · ABA-360 (remove and query chat tools) · ABA-455 (the ledger
generalised) · ABA-531 and ABA-545 (receipt reconciliation, mobile then bots) · ABA-548
(templates) · ABA-587 (guest share link).
