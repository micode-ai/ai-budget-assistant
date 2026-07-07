# Smart Shopping List — Mobile Core (M1 + M2 client) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the offline-first mobile shopping-list UI (shared list + add items + "compare prices" Pro screen) backed by SQLite, syncing through the REST CRUD endpoints built in Plan 1.

**Architecture:** Mirror the app's real offline-first pattern (`expenseStore` + `expenseSync.ts`): write SQLite first, mark rows `sync_status='pending'`, fire-and-forget the REST call, and reconcile via a dedicated `shoppingListSync.ts` (load-local → push-pending → pull-full via `GET /shopping-list` → merge upsert + tombstone-by-absence → reload). The basket comparison is an online, Pro-gated REST call rendered on its own screen.

**Tech Stack:** Expo / React Native, Zustand, SQLite (raw `executeSql`), MMKV, i18next (9 locales), TypeScript.

## Global Constraints

- **Offline-first via per-row `sync_status`** — the `sync_queue` table in `client.native.ts` is DEAD (nothing writes it); do NOT use it. Follow `expenseStore`/`expenseSync.ts`: SQLite-first write, mark `sync_status='pending'`, fire-and-forget REST, on failure revert the row to `'pending'` and `console.warn` (NEVER `console.error` — it renders a full-screen red LogBox on a normal offline add).
- **Mobile does NOT call `/sync/push`|`/sync/pull`.** Use the Plan-1 REST CRUD endpoints (`GET /shopping-list`, `POST /shopping-list`, `PATCH/DELETE /shopping-list/:id`, `POST /shopping-list/:id/items`, `PATCH/DELETE /shopping-list/items/:itemId`, `POST /shopping-list/:id/clear-checked`) and `POST /price-history/basket`.
- **SQLite migration** lives in `apps/mobile/src/db/client.native.ts` (an `expoDb.execSync(\`CREATE TABLE IF NOT EXISTS ...\`)` block + entries appended to the `indexes` array). The Drizzle declaration in `src/db/schema/index.ts` is typed reference only — keep it in sync but it does not create tables.
- SQLite column conventions: timestamps are **epoch-ms integers** (`Date.getTime()`), `is_deleted` is `0|1`, rows carry `client_id`, `sync_status TEXT DEFAULT 'pending'`, `sync_version INTEGER`.
- Import entities/DTOs from `@budget/shared-types` (`ShoppingList`, `ShoppingListItem`, `BasketCompareResponse`, etc.).
- **Collaborative gating:** viewers CAN add/check/remove items (server has no `ViewerBlockGuard` on item writes) — do NOT `canEdit`-gate item operations. Only **delete-list** is editor+ (server gates it) — hide that affordance when `!canEdit`.
- **Pro-gate:** the "Compare prices" action is Pro. If the user is not pro/business OR the basket call returns a 403 `TIER_REQUIRED`, call `useUpgradeStore.getState().show(t('shoppingList.comparePaywall'), 'pro')` instead of showing results.
- **New screens MUST register a header** (title + back) in `app/_layout.tsx` — recurring project rule.
- **i18n:** every new `shoppingList.*` key must exist in all 9 locales (`en/ru/ua/pl/es/fr/de/be/nl`); use the `i18n-add-strings` skill to keep them in sync. `en.ts` is the source of truth.

---

### Task 1: SQLite schema — shopping_lists + shopping_list_items

**Files:**
- Modify: `apps/mobile/src/db/client.native.ts` (add a CREATE TABLE block + index entries)
- Modify: `apps/mobile/src/db/schema/index.ts` (add two Drizzle tables — typed reference)

**Interfaces:**
- Produces: SQLite tables `shopping_lists`, `shopping_list_items` on device; Drizzle types `ShoppingListRecord`, `ShoppingListItemRecord`.

- [ ] **Step 1: Add the CREATE TABLE block in `client.native.ts`**

Find an existing `expoDb.execSync(\`CREATE TABLE IF NOT EXISTS ...\`)` block (e.g. the projects block ~line 267-377) and add a new sibling block:

```ts
expoDb.execSync(`CREATE TABLE IF NOT EXISTS shopping_lists (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  name TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  is_archived INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_by_user_id TEXT,
  is_deleted INTEGER DEFAULT 0,
  sync_status TEXT DEFAULT 'pending',
  sync_version INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER
)`);
expoDb.execSync(`CREATE TABLE IF NOT EXISTS shopping_list_items (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  shopping_list_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  canonical_name TEXT,
  raw_label TEXT NOT NULL,
  quantity REAL DEFAULT 1,
  note TEXT,
  is_checked INTEGER DEFAULT 0,
  added_by_user_id TEXT,
  sort_order INTEGER DEFAULT 0,
  is_deleted INTEGER DEFAULT 0,
  sync_status TEXT DEFAULT 'pending',
  sync_version INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER
)`);
```

- [ ] **Step 2: Add indexes to the `indexes` array**

In the `indexes` string array (~line 613-670) add:

```ts
'CREATE INDEX IF NOT EXISTS idx_shopping_lists_account ON shopping_lists(account_id, is_archived)',
'CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list ON shopping_list_items(shopping_list_id, is_checked)',
```

- [ ] **Step 3: Add the Drizzle table declarations in `schema/index.ts`**

Mirror the `projects` table shape (line ~209). Add `shoppingLists` and `shoppingListItems` `sqliteTable(...)` declarations with the same columns as above (camelCase props → snake_case column names), plus `export type ShoppingListRecord = typeof shoppingLists.$inferSelect;` and `export type ShoppingListItemRecord = typeof shoppingListItems.$inferSelect;`.

- [ ] **Step 4: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/db/client.native.ts apps/mobile/src/db/schema/index.ts
git commit -m "feat(mobile): add shopping_lists + shopping_list_items SQLite tables"
```

---

### Task 2: Repositories — shoppingListRepository + shoppingListItemRepository

**Files:**
- Create: `apps/mobile/src/db/shoppingListRepository.ts`
- Create: `apps/mobile/src/db/shoppingListItemRepository.ts`
- Test: `apps/mobile/src/db/__tests__/shoppingListMappers.test.ts`

**Interfaces:**
- Produces (list repo): `rowToShoppingList(row)`, `upsertShoppingList(list)`, `getAllShoppingLists(accountId)`, `deleteShoppingList(id)`, `getPendingShoppingLists(accountId)`, `markShoppingListSynced(id, serverId?)`.
- Produces (item repo): `rowToShoppingListItem(row)`, `upsertShoppingListItem(item)`, `getItemsForList(listId)`, `updateShoppingListItem(id, patch)`, `softDeleteShoppingListItem(id)`, `getPendingShoppingListItems(accountId)`, `markShoppingListItemSynced(id, serverId?)`.
- Consumes: `executeSql`, `withTransaction` from `./client`; `ShoppingList`, `ShoppingListItem` from `@budget/shared-types`.

Follow `projectRepository.ts` exactly for the `executeSql` call shape, epoch-ms timestamps, `is_deleted 0|1`, `sync_status`, `client_id`/local-id split, and `rowToX` mappers.

- [ ] **Step 1: Write the failing mapper test**

The pure row↔entity mappers are the testable unit. In `shoppingListRepository.ts`/`shoppingListItemRepository.ts` the mappers must be exported.

```ts
// apps/mobile/src/db/__tests__/shoppingListMappers.test.ts
import { rowToShoppingList } from '../shoppingListRepository';
import { rowToShoppingListItem } from '../shoppingListItemRepository';

describe('shopping-list row mappers', () => {
  it('maps a list row to a ShoppingList entity (booleans, no items)', () => {
    const list = rowToShoppingList({
      id: 'l1', account_id: 'a1', client_id: 'c1', name: 'Weekly',
      is_default: 1, is_archived: 0, sort_order: 2, created_by_user_id: 'u1',
      is_deleted: 0, sync_status: 'synced', sync_version: 3,
      created_at: 1000, updated_at: 2000,
    });
    expect(list.name).toBe('Weekly');
    expect(list.isDefault).toBe(true);
    expect(list.isArchived).toBe(false);
    expect(list.sortOrder).toBe(2);
    expect(list.items).toEqual([]);
  });

  it('maps an item row to a ShoppingListItem entity (quantity number, isChecked bool, null canonicalName)', () => {
    const item = rowToShoppingListItem({
      id: 'i1', account_id: 'a1', shopping_list_id: 'l1', client_id: 'ci1',
      canonical_name: null, raw_label: 'Milk', quantity: 2, note: null,
      is_checked: 1, added_by_user_id: 'u1', sort_order: 0,
      is_deleted: 0, sync_status: 'synced', sync_version: 1,
      created_at: 1000, updated_at: 2000,
    });
    expect(item.rawLabel).toBe('Milk');
    expect(item.quantity).toBe(2);
    expect(item.isChecked).toBe(true);
    expect(item.canonicalName).toBeNull();
    expect(item.shoppingListId).toBe('l1');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/mobile && npx jest src/db/__tests__/shoppingListMappers.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `shoppingListRepository.ts`**

Follow `projectRepository.ts`. Export `rowToShoppingList` (maps `is_default/is_archived/is_deleted` `1|0`→boolean, `items: []`), `upsertShoppingList` (INSERT … ON CONFLICT(id) DO UPDATE, same as projects upsert), `getAllShoppingLists(accountId)` (`WHERE account_id=? AND is_deleted=0 AND is_archived=0 ORDER BY sort_order, created_at`), `deleteShoppingList(id)` (`UPDATE … SET is_deleted=1, sync_status='pending', updated_at=?`), `getPendingShoppingLists(accountId)` (`WHERE account_id=? AND sync_status='pending'`), `markShoppingListSynced(id, serverId?)` (`UPDATE … SET sync_status='synced', id = COALESCE(?, id)` — only rewrite id when a serverId is provided, mirroring how expenses reconcile clientId→serverId).

- [ ] **Step 4: Implement `shoppingListItemRepository.ts`**

Same conventions. `getItemsForList(listId)` = `WHERE shopping_list_id=? AND is_deleted=0 ORDER BY sort_order, created_at`. `updateShoppingListItem(id, patch)` writes only provided columns + `sync_status='pending'`, `updated_at`. `softDeleteShoppingListItem(id)` sets `is_deleted=1, sync_status='pending'`. `getPendingShoppingListItems(accountId)` and `markShoppingListItemSynced(id, serverId?)` as above.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/mobile && npx jest src/db/__tests__/shoppingListMappers.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/db/shoppingListRepository.ts apps/mobile/src/db/shoppingListItemRepository.ts apps/mobile/src/db/__tests__/shoppingListMappers.test.ts
git commit -m "feat(mobile): shopping-list SQLite repositories with mapper tests"
```

---

### Task 3: API client — shoppingLists.api.ts

**Files:**
- Create: `apps/mobile/src/services/shoppingLists.api.ts`
- Modify: `apps/mobile/src/services/api.ts` (import + spread)

**Interfaces:**
- Produces: `shoppingListsApi` with `getLists()`, `createList(dto)`, `updateList(id, dto)`, `deleteList(id)`, `addItem(listId, dto)`, `updateItem(itemId, dto)`, `deleteItem(itemId)`, `clearChecked(listId)`, `compareBasket(items)`, `getTrackedProducts()`.
- Consumes: `httpClient` from `./http-client`; DTO/response types from `@budget/shared-types`.

- [ ] **Step 1: Implement the api file** (mirror `alerts.api.ts` shape)

```ts
// apps/mobile/src/services/shoppingLists.api.ts
import { httpClient } from './http-client';
import type {
  ShoppingList, ShoppingListItem,
  CreateShoppingListDto, UpdateShoppingListDto,
  CreateShoppingListItemDto, UpdateShoppingListItemDto,
  BasketCompareResponse, BasketCompareItem, ProductListItem,
} from '@budget/shared-types';

export const shoppingListsApi = {
  getLists() { return httpClient.request<ShoppingList[]>('/shopping-list'); },
  createList(dto: CreateShoppingListDto) { return httpClient.request<ShoppingList>('/shopping-list', { method: 'POST', body: JSON.stringify(dto) }); },
  updateList(id: string, dto: UpdateShoppingListDto) { return httpClient.request<ShoppingList>(`/shopping-list/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }); },
  deleteList(id: string) { return httpClient.request<void>(`/shopping-list/${id}`, { method: 'DELETE' }); },
  addItem(listId: string, dto: CreateShoppingListItemDto) { return httpClient.request<ShoppingListItem>(`/shopping-list/${listId}/items`, { method: 'POST', body: JSON.stringify(dto) }); },
  updateItem(itemId: string, dto: UpdateShoppingListItemDto) { return httpClient.request<ShoppingListItem>(`/shopping-list/items/${itemId}`, { method: 'PATCH', body: JSON.stringify(dto) }); },
  deleteItem(itemId: string) { return httpClient.request<void>(`/shopping-list/items/${itemId}`, { method: 'DELETE' }); },
  clearChecked(listId: string) { return httpClient.request<{ cleared: number }>(`/shopping-list/${listId}/clear-checked`, { method: 'POST' }); },
  compareBasket(items: BasketCompareItem[]) { return httpClient.request<BasketCompareResponse>('/price-history/basket', { method: 'POST', body: JSON.stringify({ items }) }); },
  getTrackedProducts() { return httpClient.request<ProductListItem[]>('/price-history/products'); },
};
```
Note: if `priceHistory.api.ts` already exposes a products-list method, reuse it and drop `getTrackedProducts` here — check before adding.

- [ ] **Step 2: Register in the barrel**

In `apps/mobile/src/services/api.ts`: add `import { shoppingListsApi } from './shoppingLists.api';` (with the other imports) and `...shoppingListsApi,` (in the `api` object).

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/services/shoppingLists.api.ts apps/mobile/src/services/api.ts
git commit -m "feat(mobile): shopping-list API client + basket compare"
```

---

### Task 4: Store + offline-first sync — shoppingListStore + shoppingListSync

**Files:**
- Create: `apps/mobile/src/stores/shoppingListStore.ts`
- Create: `apps/mobile/src/stores/shoppingListSync.ts`
- Test: `apps/mobile/src/stores/__tests__/shoppingListMerge.test.ts`

**Interfaces:**
- Produces: `useShoppingListStore` (state `lists`, `activeListId`, `items` (derived from active list), `basketResult`, `isComparing`; actions `hydrate()`, `addItem(rawLabel, canonicalName?, quantity?)`, `toggleChecked(itemId)`, `updateQuantity(itemId, qty)`, `removeItem(itemId)`, `clearChecked()`, `createList(name)`, `deleteList(id)`, `setActiveList(id)`, `compareBasket()`); `activeListId` persisted in MMKV.
- Consumes: repositories (Task 2), `shoppingListsApi` (Task 3), `api`, `mmkv`, `useAccountStore` for `currentAccountId`/`userId`.

Mirror `expenseStore` + `expenseSync.ts`. Item mutations: optimistic in-memory `set` → SQLite write (`sync_status='pending'`) → fire-and-forget REST → on failure revert row to `'pending'` + `console.warn`. `hydrate()` calls the pull-and-merge.

- [ ] **Step 1: Write the failing merge test**

Extract the pull-merge reconciliation into a pure exported helper `mergeServerLists(local, server)` in `shoppingListSync.ts` and test it:

```ts
// apps/mobile/src/stores/__tests__/shoppingListMerge.test.ts
import { mergeServerLists } from '../shoppingListSync';

describe('mergeServerLists', () => {
  const local = [
    { clientId: 'c1', syncStatus: 'synced', name: 'Old' },   // server still has it (update)
    { clientId: 'c2', syncStatus: 'synced', name: 'Gone' },   // server dropped it (tombstone)
    { clientId: 'c3', syncStatus: 'pending', name: 'Local' }, // unpushed local (keep)
  ] as any[];
  const server = [
    { clientId: 'c1', name: 'New' },
  ] as any[];

  it('updates present, tombstones absent-synced, keeps pending', () => {
    const { toUpsert, toTombstone } = mergeServerLists(local, server);
    expect(toUpsert.map((l) => l.clientId)).toEqual(['c1']);
    expect(toTombstone).toEqual(['c2']);                     // synced + server-absent → delete
    // c3 is pending → neither upserted from server nor tombstoned
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/mobile && npx jest src/stores/__tests__/shoppingListMerge.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `shoppingListSync.ts`**

Export `mergeServerLists(local, server)` returning `{ toUpsert, toTombstone }`: `toUpsert` = server rows (keyed by `clientId`); `toTombstone` = local rows whose `syncStatus === 'synced'` AND `clientId` not in the server set (tombstone-by-absence — same as `expenseSync.ts:472-477`); pending local rows are left untouched. Then implement `pullAndMergeShoppingLists(accountId, set)`: (1) load local via repositories, `set` immediately; (2) push pending lists+items via the REST CRUD (`api.createList`/`addItem`/`updateItem`/…), then `markXSynced`; (3) `const server = await api.getLists();`; (4) inside `withTransaction`, `upsertShoppingList`/`upsertShoppingListItem` each server row and soft-delete the tombstones; (5) reload from SQLite and `set`. Wrap network in try/catch → `console.warn` (offline tolerant).

- [ ] **Step 4: Implement `shoppingListStore.ts`**

Zustand store. `activeListId` read/written to MMKV (key `shopping-active-list`). `items` getter = active list's items. Item mutations follow the offline-first shape above. `compareBasket()`: build `BasketCompareItem[]` from the active list's **unchecked** items with a `canonicalName` (skip free-text/checked), set `isComparing`, call `api.compareBasket(items)`, store `basketResult`; on a 403 `TIER_REQUIRED` (or when the user is free tier) call `useUpgradeStore.getState().show(t('shoppingList.comparePaywall'), 'pro')` and do not set a result. `hydrate()` = `pullAndMergeShoppingLists`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/mobile && npx jest src/stores/__tests__/shoppingListMerge.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

Run: `cd apps/mobile && npx tsc --noEmit` → PASS.
```bash
git add apps/mobile/src/stores/shoppingListStore.ts apps/mobile/src/stores/shoppingListSync.ts apps/mobile/src/stores/__tests__/shoppingListMerge.test.ts
git commit -m "feat(mobile): offline-first shopping-list store + sync with merge test"
```

---

### Task 5: List screen + add-item sheet

**Files:**
- Create: `apps/mobile/app/shopping-list/index.tsx`
- Modify: `apps/mobile/app/_layout.tsx` (register the header)

**Interfaces:**
- Consumes: `useShoppingListStore` (Task 4), `useAccountStore().canEdit()`, `shoppingListsApi.getTrackedProducts()`.

Mirror `app/projects/index.tsx` (SafeAreaView + `Stack.Screen` inline title + list of rows + in-page `<Modal>` bottom-sheet for add + `KeyboardAvoidingScreen`).

- [ ] **Step 1: Build the screen**

- Header: `<Stack.Screen options={{ title: t('shoppingList.title') }} />`.
- On mount: `useEffect(() => { store.hydrate(); }, [currentAccountId])`.
- Rows: each item = a checkbox (`toggleChecked`), `rawLabel`, a quantity stepper (`updateQuantity`), and a delete (`removeItem`). Checked items render struck-through/dimmed. Item add/check/remove are available to ALL members (NOT `canEdit`-gated).
- A `+ Add` button opens the add bottom-sheet: a search `TextInput` filtering `getTrackedProducts()` (sorted by `purchaseCount`), a "Frequently bought" quick-add row of the top N, and a free-text "Add \"<typed>\"" affordance (→ `addItem(text, null, 1)`); a tracked product → `addItem(product.canonicalName, product.canonicalName, 1)`.
- A prominent **"Compare prices"** CTA (bottom bar) → if `store.items` has ≥1 comparable item, navigate to `/shopping-list/compare` (which triggers the compare); the Pro-gate is enforced in the store's `compareBasket`.
- A "Clear checked" action (menu or header button) → `clearChecked()`.
- Empty state: "Add your first item".

- [ ] **Step 2: Register the header in `_layout.tsx`**

```tsx
<Stack.Screen name="shopping-list/index" options={{ headerShown: true, title: t('shoppingList.title') }} />
<Stack.Screen name="shopping-list/compare" options={{ headerShown: true, title: t('shoppingList.compareTitle') }} />
```

- [ ] **Step 3: Typecheck + lint**

Run: `cd apps/mobile && npx tsc --noEmit` → PASS. `npm run lint` (from root, mobile scope) → no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/shopping-list/index.tsx apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): shopping-list screen with add-item sheet"
```

---

### Task 6: Compare screen (Pro-gated)

**Files:**
- Create: `apps/mobile/app/shopping-list/compare.tsx`

**Interfaces:**
- Consumes: `useShoppingListStore` (`compareBasket`, `basketResult`, `isComparing`).

- [ ] **Step 1: Build the screen**

- On mount: call `store.compareBasket()`. If it triggers the paywall (free tier), the `<UpgradeGate>` modal (already mounted at root) shows; render a lightweight "Unlock with Pro" placeholder behind it.
- On result: render the ranked `stores` list — each store card shows `merchantName`, `estimatedTotal` (with `currency`), a coverage badge `coveredItems/totalItems`, a "cheapest" highlight when `isCheapest`, a stale-price note when `hasStale`, and the `missingItems` count. Below: a "Cheapest per item" section from `perItemCheapest` (item → cheapest store + price, or "not tracked" for `missingEverywhere`).
- `isComparing` → spinner. Empty/no-data → "No price history yet — scan a few receipts first" linking to the receipt scanner.

- [ ] **Step 2: Typecheck + lint**

Run: `cd apps/mobile && npx tsc --noEmit` → PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/shopping-list/compare.tsx
git commit -m "feat(mobile): basket compare screen (Pro-gated)"
```

---

### Task 7: Entry points — quick action, Settings hub, Analytics link

**Files:**
- Modify: `apps/mobile/src/stores/quickActionStore.ts`
- Modify: `apps/mobile/src/components/home/HomeQuickActionStrip.tsx`
- Modify: `apps/mobile/src/components/QuickActionIcon.tsx`
- Modify: `apps/mobile/app/settings/index.tsx` (hub row)
- Modify: the Inflation Index section in the Analytics tab (`InflationIndexSection.tsx`) — a "Plan a shop" link

- [ ] **Step 1: Quick action registration**

- `quickActionStore.ts`: add `'shopping'` to `QUICK_ACTION_KEYS` and `shopping: true` to `DEFAULT_VISIBILITY`.
- `HomeQuickActionStrip.tsx`: add `shopping: '/shopping-list'` to `quickActionRoutes` and `shopping: 'dashboard.shoppingList'` to `quickActionLabelKey`.
- `QuickActionIcon.tsx`: add a `shopping: { xml: CART, w: 44, h: 40 }` icon entry (reuse the existing `CART` xml used by `purchase_request`, or a `LIST`/`BASKET` glyph if one exists).

- [ ] **Step 2: Settings hub row**

In `app/settings/index.tsx` add a row (near the reference-data/subscriptions rows) → `router.push('/shopping-list')`, `title: t('shoppingList.title')`, `subtitle: t('shoppingList.settingsSubtitle')`.

- [ ] **Step 3: Analytics "Plan a shop" link**

In `InflationIndexSection.tsx` add a small link/button → `router.push('/shopping-list')`, label `t('shoppingList.planAShop')`.

- [ ] **Step 4: Typecheck + commit**

Run: `cd apps/mobile && npx tsc --noEmit` → PASS.
```bash
git add apps/mobile/src/stores/quickActionStore.ts apps/mobile/src/components/home/HomeQuickActionStrip.tsx apps/mobile/src/components/QuickActionIcon.tsx apps/mobile/app/settings/index.tsx apps/mobile/src/components/analytics/InflationIndexSection.tsx
git commit -m "feat(mobile): shopping-list entry points (quick action, settings, analytics)"
```

---

### Task 8: i18n — shoppingList.* in all 9 locales

**Files:**
- Modify: all 9 `apps/mobile/src/i18n/locales/*.ts` + add `dashboard.shoppingList`

**Interfaces:**
- Produces the `shoppingList` key group + `dashboard.shoppingList` label.

- [ ] **Step 1: Add the key group to `en.ts` (source of truth)**

Keys (English values): `title` ("Shopping list"), `settingsSubtitle` ("Plan your shop, find the cheapest store"), `planAShop` ("Plan a shop"), `addItem`, `addFreeText` ("Add \"{{text}}\""), `frequentlyBought`, `searchProducts`, `emptyList` ("Add your first item"), `clearChecked`, `compareCta` ("Compare prices"), `compareTitle` ("Where's cheapest"), `comparePaywall` ("Compare prices across your stores with Pro"), `cheapest`, `coverage` ("{{covered}}/{{total}} items"), `stalePrices` ("Some prices are old"), `missingCount` ("{{count}} not priced here"), `cheapestPerItem` ("Cheapest per item"), `notTracked` ("Not tracked yet"), `noPriceData` ("No price history yet — scan a few receipts first"), `comparing`, `newList`, `deleteList`, `deleteListConfirm`, `quantity`.
- Add `dashboard.shoppingList` ("Shopping").

- [ ] **Step 2: Propagate to the other 8 locales**

Use the `i18n-add-strings` skill to add the same keys (translated) to `ru/ua/pl/es/fr/de/be/nl`. Verify each file has the full `shoppingList` group + `dashboard.shoppingList`.

- [ ] **Step 3: Typecheck + commit**

Run: `cd apps/mobile && npx tsc --noEmit` → PASS.
```bash
git add apps/mobile/src/i18n/locales
git commit -m "feat(mobile): shoppingList i18n across 9 locales"
```

---

### Task 9: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: PASS (0 errors).

- [ ] **Step 2: Mobile test suite (against known baseline)**

Run: `cd apps/mobile && npx jest`
Expected: the new `shoppingListMappers` + `shoppingListMerge` suites pass; the only failures are the KNOWN pre-existing baseline (per prior ledgers: ~4 `notificationParser` CHF/CZK tests). Confirm the failure set is exactly that baseline + nothing new.

- [ ] **Step 3: Lint**

Run (root): `npm run lint`
Expected: no new lint errors in the shopping-list files (pre-existing shared-types lint warnings, if any, are baseline).

- [ ] **Step 4: i18n parity check**

Confirm all 9 locale files contain the full `shoppingList` group (same key count) and `dashboard.shoppingList`.

---

## Self-Review

**Spec coverage (M1 + M2 mobile):**
- Offline-first SQLite mirror (tables + repositories + per-row sync_status) → Tasks 1, 2. ✓
- Store + pull-and-merge sync (mirrors expenseSync, REST CRUD, tombstone-by-absence) → Task 4. ✓
- API client (CRUD + basket compare + products) → Task 3. ✓
- List screen + add-item picker (tracked products + frequently-bought + free text) → Task 5. ✓
- Compare screen, Pro-gated via upgradeStore → Tasks 4, 6. ✓
- Entry points (quick action, Settings, Analytics link) → Task 7. ✓
- i18n 9 locales → Task 8. ✓
- Collaborative gating (viewers add/check items; delete-list editor+) → Global Constraints + Task 5. ✓
- New-screen headers registered → Task 5. ✓

**Architecture note:** the mobile client uses the per-entity REST-sync pattern (not the generic `/sync/push`|`/sync/pull` machinery, which is dead in the app). The Plan-1 `sync.service` handlers remain correct server plumbing but are off the mobile path — consistent with every other entity in this codebase.

**Placeholder scan:** logic-bearing code (repositories via `projectRepository` pattern, api file, sync merge, store shape) is fully specified; the two RN screens are specified structurally against the concrete `projects/index.tsx` mirror with the non-obvious behavior (Pro-gate, collaborative gating, compare rendering) given explicitly — appropriate for large UI files.

**Type consistency:** `shoppingListsApi` method names/signatures (Task 3) match the store's calls (Task 4); `rowToShoppingList`/`rowToShoppingListItem` (Task 2) feed the store and sync; `mergeServerLists` returns `{toUpsert, toTombstone}` used identically in Task 4.

## Roadmap — remaining milestone plans

- **Plan 3 — M3 Restock** · **Plan 4 — M4 Geo** · **Plan 5 — M5 Multi-list UI** · **Plan 6 — M6 Deals** (authored one at a time as reached; see the design spec).
