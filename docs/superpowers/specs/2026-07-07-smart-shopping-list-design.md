# Smart Shopping List + "Where's Cheaper" — Design (v1)

- **Date:** 2026-07-07
- **Status:** Approved (design), pending spec review
- **Builds on:** Personal Inflation Index (ABA-307), price-history module, receipt OCR line-items, Expense Map / geocoding (ABA-310/311)
- **Tracking issue:** ABA-{N} (to be created at finish)

## Summary

Turn the receipt-derived price data we already collect into a money-saving planning
tool. The user builds a shopping list; for every store they have personally shopped at,
we estimate the basket total from **their own historical per-product prices** and
highlight the cheapest store. No crowd-sourced averages — the moat is that the prices are
the user's real, receipt-verified prices, which competitors cannot reproduce without the
same receipt corpus.

The core insight that shapes the architecture: the basket-comparison engine is
**stateless** — it takes a set of products in the request body and returns ranked stores.
It does not depend on the persisted shopping list. This cleanly separates two concerns:
(1) the shared, persisted shopping list, and (2) the price-comparison engine, which works
on any set of products.

## Product decisions (the four forks, approved)

| Decision | Choice | Rationale |
|---|---|---|
| **MVP core** | Shopping list + "cheapest store for my basket" | Direct savings; reuses the already-built `StoreLatestPrice` (per-store latest price, cheapest-first). |
| **Predictive "time to rebuy"** | Phase 2 | Needs a new per-product cadence detector — a separable chunk. v1 ships only a "frequently bought" quick-add from the existing `listProducts`. |
| **Geo / "nearby" on map** | Phase 2 | Sparse data (not every expense has geo) + needs live GPS. Separate iteration. |
| **List persistence** | Server-only + MMKV read-cache | The list is a shared household artifact needing cross-member consistency — the same class as `purchaseRequestStore` / `familyFeedStore` / `tripStore`, all documented as "server-only, not offline-first." Full offline-first write-sync is out of scope for v1. |
| **Monetization** | List = **free**; basket comparison = **Pro** | The list grows the habit and the receipt-data moat (free). "Where's cheapest" is the premium magic and a natural free→paid hook, mirroring Story / Fat-Finder / AI-Insights (`@RequireTier('pro')`). |
| **Viewer role** | Viewers **can** add/check/remove list items | A shopping list is collaborative and low-risk — same reasoning as purchase-request voting being intentionally not behind `ViewerBlockGuard`. The basket-compare endpoint stays Pro-gated (tier, not role). |

## Goals

- Persist a single shared shopping list per account; any member (incl. viewer) can add,
  check off, edit quantity, and remove items.
- Add items either from the user's tracked products (`GET /price-history/products`,
  searchable, sorted by frequency, with a "frequently bought" strip) or as free text.
- Given the current list, return each visited store's estimated basket total, coverage
  (how many list items the store has a price for), missing items, and a per-item
  "cheapest store" breakdown; highlight the cheapest store that covers the whole basket.
- Pro-gate the comparison; surface the existing `Paywall` when a free user taps "Compare".

## Non-goals (explicitly deferred to Phase 2)

- Predictive "time to rebuy" cadence detector (median-gap heuristic per product).
- Geo "nearby" filtering + a "cheapest basket" overlay on the Expense Map.
- Multiple named lists (v1 = one active list per account).
- Push alert "a staple you buy got more expensive" (partially covered already by anomaly
  `price_increase` + the Inflation Index).
- SQLite mirror / offline-first write-sync for the list.

## Architecture

```
┌─ shopping-list module (NEW) ─────────────┐   ┌─ price-history module (EXTEND) ─────┐
│  Persisted shared list, scoped by         │   │  POST /price-history/basket          │
│  accountId. CRUD only.                     │   │  body: { items:[{canonicalName,qty}]}│
│  GET/POST/PATCH/DELETE /shopping-list      │   │  → ranked stores (stateless)          │
│  JwtAuthGuard + AccountContextGuard        │   │  @RequireTier('pro')                  │
│  (no ViewerBlockGuard — collaborative)     │   │  reuses fetchRows + per-store-latest  │
└────────────────────────────────────────────┘   └──────────────────────────────────────┘
                     │                                          │
                     └──────────  mobile: shoppingListStore  ───┘
                                  (calls both; store is just the UI's item set)
```

The basket endpoint lives in **price-history** because it needs that module's data access
(`fetchRows`, alias resolution, per-unit price derivation). The **shopping-list** module is
pure CRUD and has no dependency on price-history — the mobile client is what joins them.

### 1. Data model — new table `shopping_list_items`

One table, no parent `shopping_lists` table (one active list per account = YAGNI; multiple
named lists is a Phase-2 concern). Prisma migration; **no SQLite mirror** (server-only).

```prisma
model ShoppingListItem {
  id            String   @id @default(uuid())
  accountId     String   @map("account_id")
  clientId      String   @map("client_id")
  canonicalName String?  @map("canonical_name") // resolved tracked product; null = free text
  rawLabel      String   @map("raw_label")       // what is displayed / what the user typed
  quantity      Decimal  @default(1) @db.Decimal(10, 3)
  note          String?
  isChecked     Boolean  @default(false) @map("is_checked")
  addedByUserId String   @map("added_by_user_id")
  sortOrder     Int      @default(0) @map("sort_order")
  isDeleted     Boolean  @default(false) @map("is_deleted")
  syncVersion   Int      @default(0) @map("sync_version")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@unique([accountId, clientId])
  @@index([accountId, isChecked])
  @@map("shopping_list_items")
}
```

`clientId` + `@@unique([accountId, clientId])` supports idempotent create (the client
resends the same create on retry — follow the ABA-316 pre-check + catch-P2002-outside-tx
pattern). `Account` gets a `shoppingListItems ShoppingListItem[]` relation.

### 2. Basket engine — pure function `computeBasket(rows, basket, now?)`

Standalone file `price-history/basket-calculator.ts` (mirrors `trip-share-calculator.ts` /
`settle-up-calculator.ts` — pure + unit-tested, no Prisma). Input `rows` = the same
`RawItemRow[]` that `fetchRows` already produces (alias-resolved, per-unit price).

Logic:
- Restrict to the majority/base currency (same approach as the inflation index — mixing
  currencies in a single total is meaningless).
- For each basket item, find the **latest** unit price per store (`merchant`), by date.
- Per store: `estimatedTotal = Σ(latestPrice[store][item] × item.quantity)` over the items
  that store has any price for.
- **Coverage:** `coveredItems / totalItems`, plus `missingItems: string[]`. A store that
  only prices 2 of 8 items must not win on a misleadingly small total — the "cheapest"
  badge is awarded only among stores covering the whole basket (fall back to ≥80% coverage
  if no store covers 100%, and label it "best partial").
- **Freshness:** carry `latestDate` per price; set `hasStale: true` if any contributing
  price is > 90 days old. Still used, but flagged in the UI.

Output shape (see shared-types below): `{ currency, stores[], perItemCheapest[], missingEverywhere[] }`.
`missingEverywhere` = free-text or never-purchased items no store can price (shown so the
user understands why a store's coverage is < 100%).

### 3. API endpoints

**price-history module (extend):**
- `POST /price-history/basket` — `JwtAuthGuard + AccountContextGuard + SubscriptionTierGuard`,
  `@RequireTier('pro')`. Body `BasketCompareDto { items: { canonicalName: string; quantity: number }[] }`
  (`class-validator`; 1–100 items). Loads rows via a reused/extracted `fetchRows`, calls
  `computeBasket`, returns `BasketCompareResponse`. Declared **after** the existing static
  routes but the path prefix `basket` does not collide with `products/*` or `price-points/*`.

**shopping-list module (new):** class-level `JwtAuthGuard + AccountContextGuard`, `accountId`
and `userId` taken from `req` (never a client-supplied field):
- `GET /shopping-list` — active (non-deleted) items, `sortOrder` then `createdAt`.
- `POST /shopping-list` — add item (idempotent on `clientId`, ABA-316 pattern).
- `PATCH /shopping-list/:id` — update `isChecked` / `quantity` / `rawLabel` / `note` / `sortOrder`.
- `DELETE /shopping-list/:id` — soft-delete (`isDeleted = true`).
- `POST /shopping-list/clear-checked` — soft-delete all checked items in one query
  (declared before `:id` routes to avoid the `:id = "clear-checked"` shadow — ABA-166).

No `ViewerBlockGuard` on the shopping-list writes (collaborative, approved above).

### 4. Shared types (`packages/shared-types/src/dto/`)

New file `shopping-list.ts` (entities + DTOs) and additions to `price-history.ts`:

```ts
// shopping-list.ts
export interface ShoppingListItem {
  id: string;
  canonicalName: string | null;
  rawLabel: string;
  quantity: number;
  note: string | null;
  isChecked: boolean;
  addedByUserId: string;
  sortOrder: number;
}
export interface CreateShoppingListItemDto {
  clientId: string; canonicalName?: string | null; rawLabel: string;
  quantity?: number; note?: string;
}
export interface UpdateShoppingListItemDto {
  isChecked?: boolean; quantity?: number; rawLabel?: string; note?: string | null; sortOrder?: number;
}

// price-history.ts additions
export interface BasketCompareDto { items: { canonicalName: string; quantity: number }[]; }
export interface BasketStoreResult {
  merchantName: string;
  estimatedTotal: number;
  coveredItems: number;
  totalItems: number;
  missingItems: string[]; // canonicalNames this store cannot price
  hasStale: boolean;      // any contributing price > 90 days old
  isCheapest: boolean;    // best store among those with full (or ≥80%) coverage
}
export interface BasketPerItemCheapest {
  canonicalName: string; cheapestStore: string | null; price: number | null;
}
export interface BasketCompareResponse {
  currency: string;
  stores: BasketStoreResult[];            // sorted cheapest → most expensive
  perItemCheapest: BasketPerItemCheapest[];
  missingEverywhere: string[];            // items no visited store can price
}
```

Reuse: `ProductListItem` (already exists) powers the "add item" picker; `StoreLatestPrice`
logic is reused inside `computeBasket` but the response uses the richer types above.

### 5. Mobile (`apps/mobile/`)

- `src/stores/shoppingListStore.ts` — server-only, optimistic with rollback (mirrors
  `purchaseRequestStore` / `priceHistoryStore`), MMKV read-cache so the last-loaded list is
  visible offline. `basketResult` + `loadBasket()` state (calls `POST /price-history/basket`).
- `src/services/shoppingList.api.ts` — CRUD + `compareBasket()`; registered in the `api` barrel.
- `app/shopping-list/index.tsx` — the list: checkbox rows, quantity stepper, `+ Add` button,
  a **"Compare prices"** CTA. Header registered (title + back — new-screen header rule).
- Add-item bottom-sheet (or `app/shopping-list/add.tsx`) — searchable picker over
  `GET /price-history/products` (sorted by `purchaseCount`) + a "Frequently bought" strip
  (top N) + free-text add (→ `canonicalName: null`).
- `app/shopping-list/compare.tsx` — ranked stores; cheapest highlighted; per store: total,
  coverage `x/y`, missing items; a "per item — cheapest store" breakdown. Pro-gated: a free
  user tapping "Compare" triggers `useUpgradeStore.getState().show(...)` and the mounted
  `<UpgradeGate>` Paywall instead of navigating.
- Entry points: (a) new home quick action `shopping` (add to `QUICK_ACTION_KEYS`, icon
  `cart-outline`, default **on**); (b) a Settings-hub row; (c) a "Plan a shop" link from
  `InflationIndexSection` in the Analytics tab.
- `canEdit` gating is **not** applied to add/check/remove (viewers participate); it is not
  relevant to compare (that's tier-gated).

### 6. i18n

New `shoppingList.*` key group in **all 9 locales** (`en/de/es/fr/pl/ru/ua/be/nl`) — list
screen, add sheet, compare screen (cheapest badge, coverage "x of y", missing-items note,
stale-price note, empty state), quick-action label, Settings-hub row. `en.ts` is the source
of truth; run the i18n sync per the `i18n-add-strings` skill.

### 7. Testing

- `basket-calculator.spec.ts` — pure-function coverage: cheapest selection, coverage math,
  missing items, stale flag, single-store fallback, majority-currency filtering, quantity
  scaling, empty basket.
- `shopping-list.service.spec.ts` — account scoping, idempotent create (clientId), clear-checked,
  soft-delete.
- Controller routing spec for `clear-checked` declared before `:id` (ABA-166 regression guard).

## Dependency order (per CLAUDE.md)

1. `packages/shared-types` — `shopping-list.ts` + `price-history.ts` basket DTOs.
2. `apps/api/prisma/schema.prisma` — `ShoppingListItem` + `Account` relation → `migrate dev` + `generate`.
3. `apps/api/src/modules/shopping-list/` — module/controller/service (+ `bootstrap-api-module` skill).
4. `apps/api/src/modules/price-history/` — `basket-calculator.ts`, `POST /basket`, extract/reuse `fetchRows`.
5. `apps/mobile` — api file → store → screens → quick action / Settings / Analytics link.
6. `apps/mobile/src/i18n/locales/*` — all 9 files.
7. Tests + docs (CLAUDE.md entry, `user_docs`) + ABA issue (finish-aba-task skill).

## Risks / open questions

- **Coverage vs. cheapest fairness.** The "cheapest badge only among full-coverage stores,
  else best ≥80%" rule is a judgment call; the compare screen must always show coverage so
  the number is never misleading. If most baskets have no full-coverage store, revisit the
  threshold.
- **Stale prices.** A 6-month-old price is a weak predictor. v1 flags but still uses them; if
  this proves noisy, Phase 2 could down-weight or exclude prices older than the period.
- **Free-text items** never price-compare (no `canonicalName`); they appear under
  `missingEverywhere`. The UI must make clear these are informational, not a store failure.
- **Product identity** relies on the existing canonical-name / alias machinery; garbage-in
  (bad OCR names) surfaces here too. The existing rename/merge/backfill-ai tools mitigate it.

## Phase 2 backlog (not in this spec)

Predictive "time to rebuy" (per-product median-gap detector, surfaced as a suggestions strip
and optional push) · geo "nearby" filter + Expense-Map "cheapest basket" overlay (derive
store coordinates from the most-recent `locationLat/Lng` per merchant) · multiple named lists
· staple-price-drop/increase push alerts · offline-first write-sync for the list.
