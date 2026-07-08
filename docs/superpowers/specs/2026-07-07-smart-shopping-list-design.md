# Smart Shopping List + "Where's Cheaper" — Design (full scope)

- **Date:** 2026-07-07
- **Status:** Approved (design), pending spec review — **full scope, nothing deferred**
- **Builds on:** Personal Inflation Index (ABA-307), price-history module, receipt OCR line-items, Expense Map / geocoding (ABA-310/311), offline-first sync (SyncChange), notifications + crons
- **Tracking issue:** ABA-{N} (to be created at finish)

## Summary

Turn the receipt-derived price data we already collect into a full money-saving planning
tool. The user builds shared shopping lists; for every store they have personally shopped
at, we estimate the basket total from **their own historical per-product prices**, rank
stores (optionally by distance), predict what they're due to restock, and alert them when a
staple gets cheaper. The moat is that every price is the user's real, receipt-verified
price — competitors cannot reproduce it without the same receipt corpus.

Two architectural spines:
1. The **basket-comparison engine is stateless** — it takes a set of products (and optional
   coordinates) in the request body and returns ranked stores. It does not depend on the
   persisted list. This keeps the list and the price intelligence cleanly decoupled.
2. The **list itself is offline-first** (SQLite + sync), because a shopping list is used
   in-store where connectivity is poor. The price *comparison* stays online (needs the full
   corpus and is Pro-gated), but the list, suggestions cache, and check-off work offline.

## Product decisions (approved)

| Decision | Choice | Rationale |
|---|---|---|
| **Scope** | Everything below, built as milestones M1–M6 in order | User directive: defer nothing. Milestones = build sequence, not feature cuts. |
| **List persistence** | **Offline-first** (SQLite mirror + SyncChange union + sync.service handlers) | A shopping list is used in-store offline. Mirrors the expense offline-first path. |
| **Multiple lists** | Named lists, one auto-created default per account | Households keep "weekly shop", "party", etc. Active list selected client-side (MMKV). |
| **Restock prediction** | Per-product median-gap detector + daily reminder push | Reuses the recurring-suggestion heuristic; surfaced as a suggestions strip **and** an opt-in push. |
| **Geo / nearby** | Basket endpoint accepts coords → `distanceKm`/`nearby`; map surface reuses `ExpenseMapView` | Store coords derived from most-recent `locationLat/Lng` per merchant; live GPS via existing `captureCurrentLocation`. |
| **Deal alerts** | Price-drop push when a tracked staple is cheaper than its recent average | New opportunity alert (distinct from Inflation Index / anomaly `price_increase`). |
| **Monetization** | List + suggestions + reminders = **free**; basket compare + nearby map + deal alerts = **Pro** | Free tier grows the habit and the receipt-data moat; the *comparison intelligence* is the premium hook (mirrors Story / Fat-Finder / AI-Insights `@RequireTier('pro')`). |
| **Viewer role** | Viewers can add/check/remove list items; compare/deals are tier-gated, not role-gated | Collaborative + low-risk, same as purchase-request voting being outside `ViewerBlockGuard`. |

If any monetization or the multiple-lists call is wrong, say so — those are the two most
adjustable product choices.

## Milestones

Each milestone is independently shippable and testable; they are built in this order.

### M1 — List + basket compare (the core loop)
The persisted (offline-first) shared list and the stateless Pro `POST /price-history/basket`
comparison. This alone delivers the headline value.

### M2 — Offline-first sync for the list
SQLite mirror + `SyncChange` union entries + `sync.service` handlers so the list survives
offline and syncs across members/devices. (Folded tightly with M1's mobile store — the store
is written offline-first from the start; M2 is the sync-plumbing half.)

### M3 — Restock prediction (suggestions strip + reminder push)
Per-product cadence detector; `GET /shopping-list/suggestions`; a "Time to restock" strip on
the list screen; `shopping-reminder.cron.ts` daily push (opt-in preference).

### M4 — Geo / "cheaper nearby"
Store-coordinate derivation; basket endpoint accepts `{lat,lng}` → `distanceKm`/`nearby`;
`app/shopping-list/map.tsx` reusing `ExpenseMapView` to plot candidate stores with basket
totals in popups; "sort by cheapest / by nearby" toggle.

### M5 — Multiple named lists
`ShoppingList` parent table + FK; list switcher UI; auto-created default list; rename/delete/
archive.

### M6 — Deal alerts (staple price drops)
Price-drop detector over recent per-store prices; `shopping_deal` push type + preference;
folded into the reminder cron. Capped like anomaly pushes (≤3/day/account).

## Architecture

```
┌─ shopping-list module (NEW) ─────────────────┐   ┌─ price-history module (EXTEND) ──────┐
│  Lists + items, scoped by accountId.           │   │  POST /price-history/basket           │
│  Offline-first (SQLite mirror + sync).          │   │  body:{items[],lat?,lng?} (stateless) │
│  GET/POST/PATCH/DELETE /shopping-list[/items]   │   │  → ranked stores (+distance)          │
│  GET /shopping-list/suggestions (restock)       │   │  @RequireTier('pro')                   │
│  shopping-reminder.cron.ts (reminders + deals)  │   │  reuses fetchRows + per-store-latest   │
│  JwtAuthGuard + AccountContextGuard             │   │  storeLocations from locationLat/Lng   │
│  (no ViewerBlockGuard on item writes)           │   └────────────────────────────────────────┘
└──────────────────────────────────────────────────┘                    │
                     │                                                    │
                     └──────────  mobile: shoppingListStore  ─────────────┘
                                  (offline-first list; online Pro compare + map)
```

`POST /price-history/basket` lives in **price-history** (it needs `fetchRows`, alias
resolution, per-unit price, and store-location derivation). The **shopping-list** module owns
lists, items, suggestions, and the cron. The mobile client joins them.

### 1. Data model (Prisma + SQLite mirror)

Two new tables. **Both are offline-first** → mirrored in `apps/mobile/src/db/schema` and wired
into sync.

```prisma
model ShoppingList {
  id            String   @id @default(uuid())
  accountId     String   @map("account_id")
  clientId      String   @map("client_id")
  name          String
  isDefault     Boolean  @default(false) @map("is_default")
  isArchived    Boolean  @default(false) @map("is_archived")
  sortOrder     Int      @default(0) @map("sort_order")
  createdByUserId String @map("created_by_user_id")
  isDeleted     Boolean  @default(false) @map("is_deleted")
  syncVersion   Int      @default(0) @map("sync_version")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  account Account            @relation(fields: [accountId], references: [id], onDelete: Cascade)
  items   ShoppingListItem[]

  @@unique([accountId, clientId])
  @@index([accountId, isArchived])
  @@map("shopping_lists")
}

model ShoppingListItem {
  id             String   @id @default(uuid())
  accountId      String   @map("account_id")
  shoppingListId String   @map("shopping_list_id")
  clientId       String   @map("client_id")
  canonicalName  String?  @map("canonical_name") // resolved tracked product; null = free text
  rawLabel       String   @map("raw_label")
  quantity       Decimal  @default(1) @db.Decimal(10, 3)
  note           String?
  isChecked      Boolean  @default(false) @map("is_checked")
  addedByUserId  String   @map("added_by_user_id")
  sortOrder      Int      @default(0) @map("sort_order")
  isDeleted      Boolean  @default(false) @map("is_deleted")
  syncVersion    Int      @default(0) @map("sync_version")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  account      Account      @relation(fields: [accountId], references: [id], onDelete: Cascade)
  shoppingList ShoppingList @relation(fields: [shoppingListId], references: [id], onDelete: Cascade)

  @@unique([accountId, clientId])
  @@index([shoppingListId, isChecked])
  @@map("shopping_list_items")
}
```

`clientId` + `@@unique([accountId, clientId])` → idempotent create (ABA-316 pre-check +
catch-P2002-outside-tx). A default list is auto-created lazily on first `GET /shopping-list`
if the account has none. `Account` gets `shoppingLists` + `shoppingListItems` relations.

### 2. Basket engine — pure function `computeBasket(rows, basket, storeCoords?, origin?, now?)`

Standalone `price-history/basket-calculator.ts` (mirrors `trip-share-calculator.ts` — pure,
unit-tested, no Prisma). Input `rows` = the `RawItemRow[]` `fetchRows` already produces.

- Restrict to the majority/base currency (mixing currencies in a total is meaningless).
- Per basket item → latest unit price per store, by date.
- Per store: `estimatedTotal = Σ(latestPrice[store][item] × quantity)` over priced items.
- **Coverage:** `coveredItems / totalItems` + `missingItems[]`. "Cheapest" badge awarded only
  among stores covering the whole basket; if none, best ≥80% coverage ("best partial").
- **Freshness:** `hasStale` if any contributing price > 90 days old.
- **Distance (M4):** if `storeCoords[merchant]` and `origin` are present → `distanceKm`
  (haversine) and `nearby` (≤ configurable radius, default 5 km). Response can be sorted by
  price or by distance client-side.

Output: `{ currency, stores[], perItemCheapest[], missingEverywhere[] }`.

### 3. Restock predictor — pure function `predictRestock(purchasesByProduct, now?)` (M3)

Standalone `shopping-list/restock-predictor.ts`. Input: per-canonicalName sorted purchase
dates. Compute the **median gap** between consecutive purchases (need ≥3 purchases);
`dueInDays = medianGap - daysSinceLastSeen`; `isDue = dueInDays <= 0`. Returns products
sorted by most-overdue. Ignores products with < 3 purchases (not enough signal) and one-offs.

### 4. Deal detector — pure function `detectDeals(rows, now?)` (M6)

For each tracked product, compare the **latest** per-store price against the product's recent
average (last 90 days, same currency); a store price meaningfully below average (e.g. ≥15%)
→ a deal `{ canonicalName, store, price, avgPrice, dropPct }`. Feeds the reminder cron.

### 5. API endpoints

**price-history (extend):**
- `POST /price-history/basket` — `+ SubscriptionTierGuard @RequireTier('pro')`. Body
  `BasketCompareDto { items:{canonicalName,quantity}[]; lat?:number; lng?:number }`
  (`class-validator`, 1–100 items). → `BasketCompareResponse`.

**shopping-list (new):** class-level `JwtAuthGuard + AccountContextGuard`; `accountId`/`userId`
from `req` (never client-supplied):
- `GET /shopping-list` — lists (non-archived) + their active items; lazily creates the default.
- `POST /shopping-list` / `PATCH /shopping-list/:id` / `DELETE /shopping-list/:id` — list CRUD
  (rename/archive/delete). Owner/editor for delete-list; add/rename allowed for all members.
- `POST /shopping-list/:id/items` — add item (idempotent on `clientId`).
- `PATCH /shopping-list/items/:itemId` — check / quantity / label / note / sortOrder.
- `DELETE /shopping-list/items/:itemId` — soft-delete.
- `POST /shopping-list/:id/clear-checked` — bulk soft-delete checked (declared before dynamic
  `:id` collisions — ABA-166 ordering).
- `GET /shopping-list/suggestions` — restock suggestions for the account (M3).

No `ViewerBlockGuard` on item writes (collaborative, approved).

### 6. Cron — `shopping-reminder.cron.ts` (M3 + M6)

`@Cron('0 10 * * *')` daily. For each account with a default/active list: run `predictRestock`
and `detectDeals`; send a `shopping_reminder` push (due items) and/or a `shopping_deal` push
(price drops), each gated by its own user preference and capped ≤3/day/account (anomaly
pattern). Localized via `notification-i18n.ts` (9 langs).

### 7. Shared types

- New `packages/shared-types/src/dto/shopping-list.ts`: `ShoppingList`, `ShoppingListItem`,
  create/update DTOs, `RestockSuggestion`.
- `price-history.ts` additions: `BasketCompareDto`, `BasketStoreResult` (`+distanceKm?`,
  `nearby?`), `BasketPerItemCheapest`, `BasketCompareResponse`.
- `sync.ts` **discriminated union**: add `shopping_list` + `shopping_list_item` `SyncChange`
  members with their payload interfaces; `sync.service` handlers take `Extract<SyncChange,{...}>`.
- Entities in `entities/index.ts` as needed. New `NotificationType` members
  `'shopping_reminder' | 'shopping_deal'`; `NotificationPreferencesResponse` gains
  `shoppingReminders` + `shoppingDeals`.

### 8. Mobile (`apps/mobile/`)

- **DB:** `src/db/schema/index.ts` + two repositories `shoppingListRepository.ts`,
  `shoppingListItemRepository.ts` (raw `executeSql`, soft-delete/timestamp conventions); SQLite
  migrations in `client.native.ts`.
- **Sync:** offline-first writes → SQLite first, queue `syncQueue`; pull-merge in the store.
- **Store:** `src/stores/shoppingListStore.ts` — offline-first list/items + active-list id
  (MMKV); online `basketResult`/`loadBasket(coords?)`, `suggestions`/`loadSuggestions()`.
- **API:** `src/services/shoppingList.api.ts` (+ `compareBasket`); registered in the `api` barrel.
- **Screens** (all with registered headers — new-screen rule):
  - `app/shopping-list/index.tsx` — active list: checkbox rows, quantity stepper, `+ Add`, a
    "Time to restock" suggestions strip (M3), list switcher (M5), **"Compare prices"** CTA.
  - add-item bottom-sheet — searchable picker over `GET /price-history/products` (by frequency)
    + "Frequently bought" strip + free-text add.
  - `app/shopping-list/compare.tsx` — ranked stores, cheapest highlighted, coverage `x/y`,
    missing items, per-item cheapest breakdown; Pro-gated via `useUpgradeStore`/`Paywall`.
  - `app/shopping-list/map.tsx` (M4) — `ExpenseMapView` with candidate stores + basket totals in
    popups; cheapest / nearby toggle; My-location via `captureCurrentLocation`.
- **Entry points:** new home quick action `shopping` (`QUICK_ACTION_KEYS`, icon `cart-outline`,
  default on); Settings-hub row; "Plan a shop" link from `InflationIndexSection` (Analytics);
  push deep-links (`shopping_reminder`/`shopping_deal` → the list).
- **Preferences:** toggles for `shoppingReminders` + `shoppingDeals` in
  `settings/notifications.tsx`.

### 9. i18n

New `shoppingList.*` group in **all 9 locales** (list, add sheet, suggestions strip, compare,
map, list switcher, quick-action label, Settings row, empty/stale/coverage/deal copy) +
`notification-i18n.ts` entries for the two push types. `en.ts` = source of truth; sync per the
`i18n-add-strings` skill.

### 10. Testing

- `basket-calculator.spec.ts` — cheapest, coverage, missing, stale, single-store, currency
  filter, quantity scaling, distance/nearby, empty basket.
- `restock-predictor.spec.ts` — median gap, due/not-due, < 3 purchases ignored.
- `deal-detector.spec.ts` — drop threshold, currency scoping, no-average edge.
- `shopping-list.service.spec.ts` — account scoping, idempotent create, default-list
  auto-create, clear-checked, soft-delete, suggestions.
- Controller routing spec (`clear-checked` / static-before-dynamic — ABA-166).
- `sync.service` handler coverage for the two new entity types.

## Dependency order (per CLAUDE.md)

1. `packages/shared-types` — `shopping-list.ts`, `price-history.ts` basket DTOs, `sync.ts` union,
   `NotificationType`, entities.
2. `apps/api/prisma/schema.prisma` — `ShoppingList` + `ShoppingListItem` + `Account` relations →
   `migrate dev` + `generate`.
3. `apps/api/src/modules/shopping-list/` — module/controller/service/dto, `restock-predictor.ts`,
   `deal-detector.ts`, `shopping-reminder.cron.ts` (`bootstrap-api-module` skill).
4. `apps/api/src/modules/price-history/` — `basket-calculator.ts`, `POST /basket`, store-coords
   derivation; extract/reuse `fetchRows`.
5. `apps/api/src/modules/sync/` — handlers for the two new entity types.
6. `apps/api` notifications — new types + preference plumbing in `NotificationsService.sendToUser`.
7. `apps/mobile` — schema → repositories → store → api → screens → quick action / Settings /
   Analytics link / notification toggles.
8. `apps/mobile/src/i18n/locales/*` — all 9 files + `notification-i18n.ts`.
9. Tests + docs (CLAUDE.md entry, `user_docs`, full tech docs) + ABA issue (finish-aba-task).

## Risks / open questions

- **Scope.** This is large (6 milestones, offline-first sync, cron, geo, push). It is built and
  reviewed milestone-by-milestone; M1+M2 must land as a coherent unit (offline-first list +
  compare) before M3–M6.
- **Coverage vs. cheapest fairness.** "Cheapest badge only among full-coverage stores, else best
  ≥80%" is a judgment call; the compare screen always shows coverage so the number is never
  misleading.
- **Stale prices.** v1 flags but still uses prices > 90 days old; if noisy, down-weight later.
- **Store coordinates are sparse** — only merchants with at least one geo-tagged expense get a
  pin/distance. `nearby` silently omits stores without coords (documented in the UI).
- **Restock false positives** — irregular buyers produce noisy medians; the ≥3-purchase gate and
  median (not mean) reduce this; reminders are opt-in.
- **Push fatigue** — reminder + deal pushes are per-type opt-in and capped ≤3/day/account.
- **Free-text items** never price-compare (no `canonicalName`) → shown under `missingEverywhere`
  as informational, not a store failure.
