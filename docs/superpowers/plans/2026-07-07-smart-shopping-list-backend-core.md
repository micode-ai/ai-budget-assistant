# Smart Shopping List — Backend Core (M1 + M2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the offline-first shared shopping-list data model + CRUD API and the stateless Pro "basket price comparison" endpoint, plus sync-service push/pull handlers so the list replicates across members/devices.

**Architecture:** A new `shopping-list` NestJS module owns lists + items (CRUD, default-list auto-create, clear-checked). The stateless `POST /price-history/basket` endpoint lives in the existing `price-history` module (it needs that module's `fetchRows` price access) and is Pro-gated. Offline-first replication reuses the existing `SyncChange` discriminated-union + `sync.service` push/pull machinery, adding two new entity types.

**Tech Stack:** NestJS 10, Prisma 5 (PostgreSQL), Jest. Shared types in `packages/shared-types` (type-only for the API).

## Global Constraints

- Module structure: `modules/shopping-list/` = `shopping-list.module.ts`, `.controller.ts`, `.service.ts`, `dto/index.ts`. Class-level `@UseGuards(JwtAuthGuard, AccountContextGuard)`.
- Service signature is `(accountId, userId, dto)`; **every** Prisma query filters by `accountId`. `accountId`/`userId` come from `req` (`AuthenticatedRequest`) — never a client-supplied field.
- Shopping-list item writes are **NOT** behind `ViewerBlockGuard` (collaborative — viewers participate). The basket endpoint is gated by tier (`@RequireTier('pro')`), not role.
- Controller request DTOs are **local `class-validator` classes** in `dto/index.ts`; the `@budget/shared-types` interfaces are for response typing + the mobile client only. Import shared-types with `import type` (the API has no build step for workspace packages — a runtime import crash-loops prod).
- Idempotent create: pre-check `findUnique({ accountId_clientId })`, return the existing row; catch a concurrent `P2002` **outside** any `$transaction` and re-fetch (ABA-316 / ABA-313).
- Route order: declare `clear-checked` and `items/*` static-ish paths so no dynamic `:id` shadows them (ABA-166).
- Currency amounts are `Decimal`; convert to `number` in every response mapper.
- SQLite mirror + mobile store are **out of scope for this plan** — they are Plan 2 (Mobile Core). This plan makes the API offline-first-ready (sync handlers) but does not touch `apps/mobile`.

---

### Task 1: Shared types — shopping-list entities + DTOs

**Files:**
- Create: `packages/shared-types/src/dto/shopping-list.ts`
- Modify: `packages/shared-types/src/index.ts` (add `export * from './dto/shopping-list';`)

**Interfaces:**
- Produces: `ShoppingList`, `ShoppingListItem`, `CreateShoppingListDto`, `UpdateShoppingListDto`, `CreateShoppingListItemDto`, `UpdateShoppingListItemDto`.

- [ ] **Step 1: Create the type file**

```ts
// packages/shared-types/src/dto/shopping-list.ts
export interface ShoppingListItem {
  id: string;
  shoppingListId: string;
  clientId: string;
  canonicalName: string | null;
  rawLabel: string;
  quantity: number;
  note: string | null;
  isChecked: boolean;
  addedByUserId: string;
  sortOrder: number;
}

export interface ShoppingList {
  id: string;
  accountId: string;
  clientId: string;
  name: string;
  isDefault: boolean;
  isArchived: boolean;
  sortOrder: number;
  createdByUserId: string;
  items: ShoppingListItem[];
}

export interface CreateShoppingListDto {
  clientId: string;
  name: string;
}
export interface UpdateShoppingListDto {
  name?: string;
  isArchived?: boolean;
  sortOrder?: number;
}
export interface CreateShoppingListItemDto {
  clientId: string;
  canonicalName?: string | null;
  rawLabel: string;
  quantity?: number;
  note?: string;
}
export interface UpdateShoppingListItemDto {
  isChecked?: boolean;
  quantity?: number;
  rawLabel?: string;
  note?: string | null;
  sortOrder?: number;
}
```

- [ ] **Step 2: Re-export from the barrel**

Add to `packages/shared-types/src/index.ts` (alongside the other `./dto/*` exports):

```ts
export * from './dto/shopping-list';
```

- [ ] **Step 3: Typecheck**

Run: `cd packages/shared-types && npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types/src/dto/shopping-list.ts packages/shared-types/src/index.ts
git commit -m "feat(shared-types): add shopping-list entities and DTOs"
```

---

### Task 2: Shared types — basket-compare DTOs

**Files:**
- Modify: `packages/shared-types/src/dto/price-history.ts` (append)

**Interfaces:**
- Produces: `BasketCompareItem`, `BasketStoreResult`, `BasketPerItemCheapest`, `BasketCompareResponse`.
- Consumes: nothing.

- [ ] **Step 1: Append the basket types**

Append to `packages/shared-types/src/dto/price-history.ts`:

```ts
export interface BasketCompareItem {
  canonicalName: string;
  quantity: number;
}

export interface BasketStoreResult {
  merchantName: string;
  estimatedTotal: number;
  coveredItems: number;
  totalItems: number;
  missingItems: string[];  // canonicalNames this store cannot price
  hasStale: boolean;       // any contributing price > 90 days old
  isCheapest: boolean;     // best store among full (or >=80%) coverage
  distanceKm?: number;     // populated in M4 (geo); undefined in this plan
  nearby?: boolean;        // populated in M4
}

export interface BasketPerItemCheapest {
  canonicalName: string;
  cheapestStore: string | null;
  price: number | null;
}

export interface BasketCompareResponse {
  currency: string;
  stores: BasketStoreResult[];         // sorted cheapest -> most expensive
  perItemCheapest: BasketPerItemCheapest[];
  missingEverywhere: string[];         // items no visited store can price
}
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/shared-types && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/shared-types/src/dto/price-history.ts
git commit -m "feat(shared-types): add basket-compare DTOs"
```

---

### Task 3: Shared types — sync union additions

**Files:**
- Modify: `packages/shared-types/src/dto/sync.ts`

**Interfaces:**
- Produces: `SyncShoppingListPayload`, `SyncShoppingListItemPayload`; extends `SyncEntityType` and `SyncChange`.
- Consumes: `SyncChangeBase` (existing, in the same file).

- [ ] **Step 1: Extend `SyncEntityType`**

In `packages/shared-types/src/dto/sync.ts`, add the two members to the `SyncEntityType` union (after `'tripExpenseShare'`):

```ts
  | 'tripExpenseShare'
  | 'shopping_list'
  | 'shopping_list_item';
```

- [ ] **Step 2: Add the payload interfaces**

Add near the other payload interfaces:

```ts
export interface SyncShoppingListPayload {
  localId?: string;
  name: string;
  isDefault?: boolean;
  isArchived?: boolean;
  sortOrder?: number;
}

export interface SyncShoppingListItemPayload {
  localId?: string;
  shoppingListId: string; // the parent list's clientId (device-local id) OR server id
  canonicalName?: string | null;
  rawLabel: string;
  quantity?: number;
  note?: string | null;
  isChecked?: boolean;
  sortOrder?: number;
}
```

- [ ] **Step 3: Add the union members**

Add to the `SyncChange` union (after the `tripExpenseShare` member):

```ts
  | (SyncChangeBase & { entityType: 'shopping_list'; payload: SyncShoppingListPayload })
  | (SyncChangeBase & { entityType: 'shopping_list_item'; payload: SyncShoppingListItemPayload })
```

- [ ] **Step 4: Typecheck**

Run: `cd packages/shared-types && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/dto/sync.ts
git commit -m "feat(shared-types): add shopping_list + shopping_list_item to SyncChange union"
```

---

### Task 4: Prisma schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (two new models + two `Account` relations)

**Interfaces:**
- Produces: Prisma models `ShoppingList`, `ShoppingListItem` (tables `shopping_lists`, `shopping_list_items`).

- [ ] **Step 1: Add the two models**

Add to `apps/api/prisma/schema.prisma` (near `ProductAlias`):

```prisma
model ShoppingList {
  id              String   @id @default(uuid())
  accountId       String   @map("account_id")
  clientId        String   @map("client_id")
  name            String
  isDefault       Boolean  @default(false) @map("is_default")
  isArchived      Boolean  @default(false) @map("is_archived")
  sortOrder       Int      @default(0) @map("sort_order")
  createdByUserId String   @map("created_by_user_id")
  isDeleted       Boolean  @default(false) @map("is_deleted")
  syncVersion     Int      @default(0) @map("sync_version")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

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
  canonicalName  String?  @map("canonical_name")
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

- [ ] **Step 2: Add relations to `Account`**

In the `Account` model, add:

```prisma
  shoppingLists     ShoppingList[]
  shoppingListItems ShoppingListItem[]
```

- [ ] **Step 3: Create the migration + regenerate client**

Run: `cd apps/api && npx prisma migrate dev --name add_shopping_lists && npx prisma generate`
Expected: migration `*_add_shopping_lists` created and applied; client regenerated with no error.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): add shopping_lists + shopping_list_items tables"
```

---

### Task 5: Basket calculator (pure function) + tests

**Files:**
- Create: `apps/api/src/modules/price-history/basket-calculator.ts`
- Test: `apps/api/src/modules/price-history/basket-calculator.spec.ts`

**Interfaces:**
- Produces: `computeBasket(rows: BasketRow[], basket: BasketCompareItem[], now?: Date): BasketCompareResponse`; `interface BasketRow { resolvedName; date: Date; unitPrice: number; merchant: string; currency: string; }`.
- Consumes: `BasketCompareItem`, `BasketCompareResponse` etc. from Task 2.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/modules/price-history/basket-calculator.spec.ts
import { computeBasket, BasketRow } from './basket-calculator';

const d = (s: string) => new Date(s);
const NOW = d('2026-07-07');

function row(name: string, merchant: string, price: number, date = '2026-07-01', currency = 'PLN'): BasketRow {
  return { resolvedName: name, merchant, unitPrice: price, date: d(date), currency };
}

describe('computeBasket', () => {
  it('picks the cheapest full-coverage store', () => {
    const rows = [
      row('Milk', 'Biedronka', 3.0), row('Bread', 'Biedronka', 4.0),
      row('Milk', 'Lidl', 2.5), row('Bread', 'Lidl', 3.5),
    ];
    const res = computeBasket(rows, [{ canonicalName: 'Milk', quantity: 1 }, { canonicalName: 'Bread', quantity: 1 }], NOW);
    const cheapest = res.stores.find((s) => s.isCheapest);
    expect(cheapest?.merchantName).toBe('Lidl');
    expect(cheapest?.estimatedTotal).toBe(6.0);
    expect(cheapest?.coveredItems).toBe(2);
    expect(res.stores[0].merchantName).toBe('Lidl'); // sorted cheapest first
  });

  it('scales by quantity and uses the latest price per store', () => {
    const rows = [row('Milk', 'Lidl', 2.0, '2026-06-01'), row('Milk', 'Lidl', 3.0, '2026-07-01')];
    const res = computeBasket(rows, [{ canonicalName: 'Milk', quantity: 2 }], NOW);
    expect(res.stores[0].estimatedTotal).toBe(6.0); // latest 3.0 * qty 2
  });

  it('awards the badge to best >=80% partial when no store has full coverage', () => {
    const rows = [row('Milk', 'Lidl', 2.5), row('Eggs', 'Lidl', 8.0), row('Milk', 'Biedronka', 3.0)];
    const basket = [
      { canonicalName: 'Milk', quantity: 1 }, { canonicalName: 'Eggs', quantity: 1 },
      { canonicalName: 'Bread', quantity: 1 }, { canonicalName: 'Butter', quantity: 1 }, { canonicalName: 'Ham', quantity: 1 },
    ];
    const res = computeBasket(rows, basket, NOW);
    // no store covers all 5; Lidl covers 2/5 = 40%, Biedronka 1/5 — none >=80%, so no badge
    expect(res.stores.every((s) => !s.isCheapest)).toBe(true);
  });

  it('flags stale prices older than 90 days', () => {
    const rows = [row('Milk', 'Lidl', 2.5, '2026-01-01')]; // > 90 days before NOW
    const res = computeBasket(rows, [{ canonicalName: 'Milk', quantity: 1 }], NOW);
    expect(res.stores[0].hasStale).toBe(true);
  });

  it('filters to the majority currency', () => {
    const rows = [row('Milk', 'Lidl', 2.5, '2026-07-01', 'PLN'), row('Milk', 'Lidl', 3.0, '2026-07-02', 'PLN'), row('Milk', 'Revolut', 1.0, '2026-07-03', 'EUR')];
    const res = computeBasket(rows, [{ canonicalName: 'Milk', quantity: 1 }], NOW);
    expect(res.currency).toBe('PLN');
    expect(res.stores.find((s) => s.merchantName === 'Revolut')).toBeUndefined();
  });

  it('lists items no store can price under missingEverywhere', () => {
    const rows = [row('Milk', 'Lidl', 2.5)];
    const res = computeBasket(rows, [{ canonicalName: 'Milk', quantity: 1 }, { canonicalName: 'Caviar', quantity: 1 }], NOW);
    expect(res.missingEverywhere).toEqual(['Caviar']);
    expect(res.perItemCheapest.find((p) => p.canonicalName === 'Caviar')?.cheapestStore).toBeNull();
  });

  it('returns empty stores for an empty basket', () => {
    const res = computeBasket([row('Milk', 'Lidl', 2.5)], [], NOW);
    expect(res.stores).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest src/modules/price-history/basket-calculator.spec.ts`
Expected: FAIL ("Cannot find module './basket-calculator'").

- [ ] **Step 3: Implement the calculator**

```ts
// apps/api/src/modules/price-history/basket-calculator.ts
import type { BasketCompareItem, BasketCompareResponse, BasketStoreResult, BasketPerItemCheapest } from '@budget/shared-types';

export interface BasketRow {
  resolvedName: string;
  date: Date;
  unitPrice: number;
  merchant: string;
  currency: string;
}

const STALE_DAYS = 90;
const PARTIAL_COVERAGE = 0.8;
const DAY_MS = 86_400_000;

export function computeBasket(rows: BasketRow[], basket: BasketCompareItem[], now: Date = new Date()): BasketCompareResponse {
  const names = new Set(basket.map((b) => b.canonicalName));
  const relevant = rows.filter((r) => names.has(r.resolvedName));

  if (basket.length === 0 || relevant.length === 0) {
    return {
      currency: majorityCurrency(relevant),
      stores: [],
      perItemCheapest: basket.map((b) => ({ canonicalName: b.canonicalName, cheapestStore: null, price: null })),
      missingEverywhere: basket.map((b) => b.canonicalName),
    };
  }

  const currency = majorityCurrency(relevant);
  const filtered = relevant.filter((r) => r.currency === currency);

  // latest price per (merchant -> product)
  const byStore = new Map<string, Map<string, { price: number; date: Date }>>();
  for (const r of filtered) {
    const store = byStore.get(r.merchant) ?? new Map<string, { price: number; date: Date }>();
    const cur = store.get(r.resolvedName);
    if (!cur || r.date > cur.date) store.set(r.resolvedName, { price: r.unitPrice, date: r.date });
    byStore.set(r.merchant, store);
  }

  const qtyByName = new Map(basket.map((b) => [b.canonicalName, b.quantity]));
  const totalItems = basket.length;
  const staleThreshold = new Date(now.getTime() - STALE_DAYS * DAY_MS);

  const stores: BasketStoreResult[] = [];
  for (const [merchant, products] of byStore.entries()) {
    let estimatedTotal = 0;
    let covered = 0;
    let hasStale = false;
    const missingItems: string[] = [];
    for (const b of basket) {
      const p = products.get(b.canonicalName);
      if (!p) { missingItems.push(b.canonicalName); continue; }
      covered += 1;
      estimatedTotal += p.price * (qtyByName.get(b.canonicalName) ?? 1);
      if (p.date < staleThreshold) hasStale = true;
    }
    if (covered === 0) continue;
    stores.push({
      merchantName: merchant,
      estimatedTotal: Math.round(estimatedTotal * 100) / 100,
      coveredItems: covered,
      totalItems,
      missingItems,
      hasStale,
      isCheapest: false,
    });
  }

  stores.sort((a, b) => a.estimatedTotal - b.estimatedTotal || b.coveredItems - a.coveredItems);

  const full = stores.filter((s) => s.coveredItems === totalItems);
  const pool = full.length > 0 ? full : stores.filter((s) => s.coveredItems / totalItems >= PARTIAL_COVERAGE);
  if (pool.length > 0) {
    const best = pool.reduce((m, s) => (s.estimatedTotal < m.estimatedTotal ? s : m));
    best.isCheapest = true;
  }

  const perItemCheapest: BasketPerItemCheapest[] = basket.map((b) => {
    let cheapestStore: string | null = null;
    let price: number | null = null;
    for (const [merchant, products] of byStore.entries()) {
      const p = products.get(b.canonicalName);
      if (p && (price === null || p.price < price)) { price = p.price; cheapestStore = merchant; }
    }
    return { canonicalName: b.canonicalName, cheapestStore, price: price === null ? null : Math.round(price * 100) / 100 };
  });

  const missingEverywhere = perItemCheapest.filter((p) => p.cheapestStore === null).map((p) => p.canonicalName);

  return { currency, stores, perItemCheapest, missingEverywhere };
}

function majorityCurrency(rows: BasketRow[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.currency, (counts.get(r.currency) ?? 0) + 1);
  if (counts.size === 0) return 'PLN';
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest src/modules/price-history/basket-calculator.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/price-history/basket-calculator.ts apps/api/src/modules/price-history/basket-calculator.spec.ts
git commit -m "feat(price-history): add pure computeBasket calculator with tests"
```

---

### Task 6: Basket endpoint (Pro-gated) + service method

**Files:**
- Modify: `apps/api/src/modules/price-history/price-history.service.ts` (add `getBasketComparison`)
- Modify: `apps/api/src/modules/price-history/dto/index.ts` (add `BasketCompareRequestDto`)
- Modify: `apps/api/src/modules/price-history/price-history.controller.ts` (add `POST basket`)
- Modify: `apps/api/src/modules/price-history/price-history.module.ts` (import the module that provides the tier guard's deps)
- Test: `apps/api/src/modules/price-history/price-history.service.spec.ts` (add a case)

**Interfaces:**
- Consumes: `computeBasket`, `BasketRow` (Task 5); the existing private `fetchRows`.
- Produces: `PriceHistoryService.getBasketComparison(accountId, items): Promise<BasketCompareResponse>`; `POST /price-history/basket`.

- [ ] **Step 1: Write the failing service test**

Add to `apps/api/src/modules/price-history/price-history.service.spec.ts` (inside the existing `describe`, reusing its `service`/prisma mock setup — mock `expenseItem.findMany` to return two stores):

```ts
it('getBasketComparison ranks stores by basket total', async () => {
  (prisma.productAlias.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.expenseItem.findMany as jest.Mock).mockResolvedValue([
    { id: '1', canonicalName: 'Milk', unitPrice: 3, quantity: 1, totalPrice: 3, expense: { date: new Date('2026-07-01'), merchant: 'Biedronka', currencyCode: 'PLN' } },
    { id: '2', canonicalName: 'Milk', unitPrice: 2.5, quantity: 1, totalPrice: 2.5, expense: { date: new Date('2026-07-01'), merchant: 'Lidl', currencyCode: 'PLN' } },
  ]);
  const res = await service.getBasketComparison('acc-1', [{ canonicalName: 'Milk', quantity: 1 }]);
  expect(res.stores[0].merchantName).toBe('Lidl');
  expect(res.stores.find((s) => s.isCheapest)?.merchantName).toBe('Lidl');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/modules/price-history/price-history.service.spec.ts -t getBasketComparison`
Expected: FAIL ("getBasketComparison is not a function").

- [ ] **Step 3: Add the service method**

In `price-history.service.ts`, add the import and method:

```ts
import { computeBasket, BasketRow } from './basket-calculator';
import type { BasketCompareItem, BasketCompareResponse } from '@budget/shared-types';
```

```ts
  async getBasketComparison(accountId: string, items: BasketCompareItem[]): Promise<BasketCompareResponse> {
    const rows = await this.fetchRows(accountId); // RawItemRow[] is assignable to BasketRow
    return computeBasket(rows as unknown as BasketRow[], items);
  }
```

- [ ] **Step 4: Add the request DTO**

Add to `apps/api/src/modules/price-history/dto/index.ts`:

```ts
import { IsArray, IsNumber, IsString, Min, ArrayMinSize, ArrayMaxSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class BasketItemDto {
  @IsString() canonicalName: string;
  @IsNumber() @Min(0.001) quantity: number;
}

export class BasketCompareRequestDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => BasketItemDto)
  items: BasketItemDto[];
}
```

- [ ] **Step 5: Add the endpoint**

In `price-history.controller.ts`, add the imports and route (place `basket` among the routes — its literal prefix does not collide with `products/*` or `price-points/*`):

```ts
import { SubscriptionTierGuard } from '../subscriptions/guards/subscription-tier.guard';
import { RequireTier } from '../subscriptions/decorators/require-tier.decorator';
import { BasketCompareRequestDto } from './dto';
```

```ts
  // POST /price-history/basket — Pro-gated basket price comparison
  @Post('basket')
  @UseGuards(SubscriptionTierGuard)
  @RequireTier('pro')
  compareBasket(@Req() req: AuthenticatedRequest, @Body() dto: BasketCompareRequestDto) {
    return this.priceHistoryService.getBasketComparison(req.accountId, dto.items);
  }
```

- [ ] **Step 6: Wire the tier guard's dependency into the module**

Open `apps/api/src/modules/insights/insights.module.ts`, note which module it imports to satisfy `SubscriptionTierGuard` (the module that provides `SubscriptionsService`), and add the same entry to `PriceHistoryModule`'s `imports` array in `price-history.module.ts`.

- [ ] **Step 7: Run the service test + typecheck**

Run: `cd apps/api && npx jest src/modules/price-history/price-history.service.spec.ts -t getBasketComparison`
Expected: PASS.
Run: `cd apps/api && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/price-history
git commit -m "feat(price-history): add Pro-gated POST /basket comparison endpoint"
```

---

### Task 7: shopping-list service + tests

**Files:**
- Create: `apps/api/src/modules/shopping-list/shopping-list.service.ts`
- Test: `apps/api/src/modules/shopping-list/shopping-list.service.spec.ts`

**Interfaces:**
- Produces (all `(accountId, userId?, ...)`, all filter by `accountId`):
  - `getLists(accountId, userId): Promise<ShoppingList[]>` — lazily creates a default list when none exist.
  - `createList(accountId, userId, dto: CreateShoppingListDto): Promise<ShoppingList>`
  - `updateList(accountId, id, dto: UpdateShoppingListDto): Promise<ShoppingList>`
  - `deleteList(accountId, id): Promise<void>` — soft-deletes list + its items.
  - `addItem(accountId, userId, listId, dto: CreateShoppingListItemDto): Promise<ShoppingListItem>` — idempotent on clientId.
  - `updateItem(accountId, itemId, dto: UpdateShoppingListItemDto): Promise<ShoppingListItem>`
  - `deleteItem(accountId, itemId): Promise<void>`
  - `clearChecked(accountId, listId): Promise<{ cleared: number }>`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/modules/shopping-list/shopping-list.service.spec.ts
import { Test } from '@nestjs/testing';
import { ShoppingListService } from './shopping-list.service';
import { PrismaService } from '../../database/prisma.service';

describe('ShoppingListService', () => {
  let service: ShoppingListService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      shoppingList: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      shoppingListItem: { findUnique: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    };
    const mod = await Test.createTestingModule({
      providers: [ShoppingListService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(ShoppingListService);
  });

  it('auto-creates a default list when the account has none', async () => {
    prisma.shoppingList.findMany.mockResolvedValue([]);
    prisma.shoppingList.create.mockResolvedValue({
      id: 'l1', accountId: 'a1', clientId: 'default-a1', name: 'My List',
      isDefault: true, isArchived: false, sortOrder: 0, createdByUserId: 'u1', items: [],
    });
    const lists = await service.getLists('a1', 'u1');
    expect(prisma.shoppingList.create).toHaveBeenCalled();
    expect(lists[0].isDefault).toBe(true);
  });

  it('addItem is idempotent on clientId', async () => {
    prisma.shoppingList.findFirst.mockResolvedValue({ id: 'l1', accountId: 'a1' });
    prisma.shoppingListItem.findUnique.mockResolvedValue({
      id: 'i1', shoppingListId: 'l1', clientId: 'c1', canonicalName: null, rawLabel: 'Milk',
      quantity: 1, note: null, isChecked: false, addedByUserId: 'u1', sortOrder: 0,
    });
    const item = await service.addItem('a1', 'u1', 'l1', { clientId: 'c1', rawLabel: 'Milk' });
    expect(prisma.shoppingListItem.create).not.toHaveBeenCalled();
    expect(item.id).toBe('i1');
  });

  it('clearChecked soft-deletes checked items scoped to account+list', async () => {
    prisma.shoppingListItem.updateMany.mockResolvedValue({ count: 3 });
    const res = await service.clearChecked('a1', 'l1');
    expect(prisma.shoppingListItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ accountId: 'a1', shoppingListId: 'l1', isChecked: true, isDeleted: false }) }),
    );
    expect(res.cleared).toBe(3);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/modules/shopping-list/shopping-list.service.spec.ts`
Expected: FAIL ("Cannot find module './shopping-list.service'").

- [ ] **Step 3: Implement the service**

```ts
// apps/api/src/modules/shopping-list/shopping-list.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type {
  ShoppingList, ShoppingListItem,
  CreateShoppingListDto, UpdateShoppingListDto,
  CreateShoppingListItemDto, UpdateShoppingListItemDto,
} from '@budget/shared-types';

function isP2002(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

function toItem(row: any): ShoppingListItem {
  return {
    id: row.id, shoppingListId: row.shoppingListId, clientId: row.clientId,
    canonicalName: row.canonicalName ?? null, rawLabel: row.rawLabel,
    quantity: Number(row.quantity), note: row.note ?? null,
    isChecked: row.isChecked, addedByUserId: row.addedByUserId, sortOrder: row.sortOrder,
  };
}

function toList(row: any): ShoppingList {
  return {
    id: row.id, accountId: row.accountId, clientId: row.clientId, name: row.name,
    isDefault: row.isDefault, isArchived: row.isArchived, sortOrder: row.sortOrder,
    createdByUserId: row.createdByUserId,
    items: (row.items ?? []).map(toItem),
  };
}

@Injectable()
export class ShoppingListService {
  constructor(private readonly prisma: PrismaService) {}

  async getLists(accountId: string, userId: string): Promise<ShoppingList[]> {
    const itemsInclude = { where: { isDeleted: false }, orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] };
    let lists = await this.prisma.shoppingList.findMany({
      where: { accountId, isArchived: false, isDeleted: false },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { items: itemsInclude },
    });
    if (lists.length === 0) {
      const created = await this.prisma.shoppingList.create({
        data: { accountId, clientId: `default-${accountId}`, name: 'My List', isDefault: true, createdByUserId: userId },
        include: { items: itemsInclude },
      });
      lists = [created];
    }
    return lists.map(toList);
  }

  async createList(accountId: string, userId: string, dto: CreateShoppingListDto): Promise<ShoppingList> {
    const existing = await this.prisma.shoppingList.findUnique({ where: { accountId_clientId: { accountId, clientId: dto.clientId } } });
    if (existing) return toList({ ...existing, items: [] });
    try {
      const created = await this.prisma.shoppingList.create({
        data: { accountId, clientId: dto.clientId, name: dto.name, createdByUserId: userId },
        include: { items: true },
      });
      return toList(created);
    } catch (e) {
      if (isP2002(e)) {
        const row = await this.prisma.shoppingList.findUnique({ where: { accountId_clientId: { accountId, clientId: dto.clientId } }, include: { items: true } });
        if (row) return toList(row);
      }
      throw e;
    }
  }

  async updateList(accountId: string, id: string, dto: UpdateShoppingListDto): Promise<ShoppingList> {
    const list = await this.prisma.shoppingList.findFirst({ where: { id, accountId, isDeleted: false } });
    if (!list) throw new NotFoundException('List not found');
    const updated = await this.prisma.shoppingList.update({
      where: { id },
      data: { name: dto.name, isArchived: dto.isArchived, sortOrder: dto.sortOrder, syncVersion: { increment: 1 } },
      include: { items: { where: { isDeleted: false } } },
    });
    return toList(updated);
  }

  async deleteList(accountId: string, id: string): Promise<void> {
    const list = await this.prisma.shoppingList.findFirst({ where: { id, accountId, isDeleted: false } });
    if (!list) throw new NotFoundException('List not found');
    await this.prisma.$transaction([
      this.prisma.shoppingList.update({ where: { id }, data: { isDeleted: true, syncVersion: { increment: 1 } } }),
      this.prisma.shoppingListItem.updateMany({ where: { accountId, shoppingListId: id, isDeleted: false }, data: { isDeleted: true, syncVersion: { increment: 1 } } }),
    ]);
  }

  async addItem(accountId: string, userId: string, listId: string, dto: CreateShoppingListItemDto): Promise<ShoppingListItem> {
    const list = await this.prisma.shoppingList.findFirst({ where: { id: listId, accountId, isDeleted: false } });
    if (!list) throw new NotFoundException('List not found');
    const existing = await this.prisma.shoppingListItem.findUnique({ where: { accountId_clientId: { accountId, clientId: dto.clientId } } });
    if (existing) return toItem(existing);
    try {
      const created = await this.prisma.shoppingListItem.create({
        data: {
          accountId, shoppingListId: listId, clientId: dto.clientId,
          canonicalName: dto.canonicalName ?? null, rawLabel: dto.rawLabel,
          quantity: dto.quantity ?? 1, note: dto.note ?? null, addedByUserId: userId,
        },
      });
      return toItem(created);
    } catch (e) {
      if (isP2002(e)) {
        const row = await this.prisma.shoppingListItem.findUnique({ where: { accountId_clientId: { accountId, clientId: dto.clientId } } });
        if (row) return toItem(row);
      }
      throw e;
    }
  }

  async updateItem(accountId: string, itemId: string, dto: UpdateShoppingListItemDto): Promise<ShoppingListItem> {
    const item = await this.prisma.shoppingListItem.findFirst({ where: { id: itemId, accountId, isDeleted: false } });
    if (!item) throw new NotFoundException('Item not found');
    const updated = await this.prisma.shoppingListItem.update({
      where: { id: itemId },
      data: {
        isChecked: dto.isChecked, quantity: dto.quantity, rawLabel: dto.rawLabel,
        note: dto.note, sortOrder: dto.sortOrder, syncVersion: { increment: 1 },
      },
    });
    return toItem(updated);
  }

  async deleteItem(accountId: string, itemId: string): Promise<void> {
    const item = await this.prisma.shoppingListItem.findFirst({ where: { id: itemId, accountId, isDeleted: false } });
    if (!item) throw new NotFoundException('Item not found');
    await this.prisma.shoppingListItem.update({ where: { id: itemId }, data: { isDeleted: true, syncVersion: { increment: 1 } } });
  }

  async clearChecked(accountId: string, listId: string): Promise<{ cleared: number }> {
    const res = await this.prisma.shoppingListItem.updateMany({
      where: { accountId, shoppingListId: listId, isChecked: true, isDeleted: false },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });
    return { cleared: res.count };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest src/modules/shopping-list/shopping-list.service.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/shopping-list/shopping-list.service.ts apps/api/src/modules/shopping-list/shopping-list.service.spec.ts
git commit -m "feat(shopping-list): add service with CRUD, default-list, idempotent add"
```

---

### Task 8: shopping-list controller + DTOs + module + routing test

**Files:**
- Create: `apps/api/src/modules/shopping-list/dto/index.ts`
- Create: `apps/api/src/modules/shopping-list/shopping-list.controller.ts`
- Create: `apps/api/src/modules/shopping-list/shopping-list.module.ts`
- Test: `apps/api/src/modules/shopping-list/shopping-list.controller.spec.ts`

**Interfaces:**
- Consumes: `ShoppingListService` (Task 7).
- Produces: routes `GET /shopping-list`, `POST /shopping-list`, `PATCH /shopping-list/:id`, `DELETE /shopping-list/:id`, `POST /shopping-list/:id/items`, `PATCH /shopping-list/items/:itemId`, `DELETE /shopping-list/items/:itemId`, `POST /shopping-list/:id/clear-checked`; `ShoppingListModule`.

- [ ] **Step 1: Create the DTOs**

```ts
// apps/api/src/modules/shopping-list/dto/index.ts
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateListDto {
  @IsString() clientId: string;
  @IsString() name: string;
}
export class UpdateListDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() isArchived?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}
export class CreateItemDto {
  @IsString() clientId: string;
  @IsOptional() @IsString() canonicalName?: string | null;
  @IsString() rawLabel: string;
  @IsOptional() @IsNumber() @Min(0.001) quantity?: number;
  @IsOptional() @IsString() note?: string;
}
export class UpdateItemDto {
  @IsOptional() @IsBoolean() isChecked?: boolean;
  @IsOptional() @IsNumber() @Min(0.001) quantity?: number;
  @IsOptional() @IsString() rawLabel?: string;
  @IsOptional() @IsString() note?: string | null;
  @IsOptional() @IsInt() sortOrder?: number;
}
```

- [ ] **Step 2: Write the failing routing test**

```ts
// apps/api/src/modules/shopping-list/shopping-list.controller.spec.ts
import { Test } from '@nestjs/testing';
import { ShoppingListController } from './shopping-list.controller';
import { ShoppingListService } from './shopping-list.service';

describe('ShoppingListController routing', () => {
  let controller: ShoppingListController;
  const svc = {
    getLists: jest.fn(), createList: jest.fn(), updateList: jest.fn(), deleteList: jest.fn(),
    addItem: jest.fn(), updateItem: jest.fn(), deleteItem: jest.fn(), clearChecked: jest.fn(),
  };
  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      controllers: [ShoppingListController],
      providers: [{ provide: ShoppingListService, useValue: svc }],
    }).compile();
    controller = mod.get(ShoppingListController);
  });

  it('addItem passes accountId+userId from req, not the body', async () => {
    const req: any = { accountId: 'a1', user: { id: 'u1' } };
    await controller.addItem(req, 'list-1', { clientId: 'c1', rawLabel: 'Milk' });
    expect(svc.addItem).toHaveBeenCalledWith('a1', 'u1', 'list-1', { clientId: 'c1', rawLabel: 'Milk' });
  });

  it('clearChecked resolves to the list id, not an item route', async () => {
    const req: any = { accountId: 'a1', user: { id: 'u1' } };
    await controller.clearChecked(req, 'list-1');
    expect(svc.clearChecked).toHaveBeenCalledWith('a1', 'list-1');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd apps/api && npx jest src/modules/shopping-list/shopping-list.controller.spec.ts`
Expected: FAIL ("Cannot find module './shopping-list.controller'").

- [ ] **Step 4: Implement the controller**

```ts
// apps/api/src/modules/shopping-list/shopping-list.controller.ts
import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { AuthenticatedRequest } from '../../common/types';
import { ShoppingListService } from './shopping-list.service';
import { CreateListDto, UpdateListDto, CreateItemDto, UpdateItemDto } from './dto';

@Controller('shopping-list')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class ShoppingListController {
  constructor(private readonly service: ShoppingListService) {}

  // GET /shopping-list
  @Get()
  getLists(@Req() req: AuthenticatedRequest) {
    return this.service.getLists(req.accountId, req.user.id);
  }

  // POST /shopping-list
  @Post()
  createList(@Req() req: AuthenticatedRequest, @Body() dto: CreateListDto) {
    return this.service.createList(req.accountId, req.user.id, dto);
  }

  // --- item routes declared before dynamic :id so /items/:itemId never resolves as :id ---

  // PATCH /shopping-list/items/:itemId
  @Patch('items/:itemId')
  updateItem(@Req() req: AuthenticatedRequest, @Param('itemId') itemId: string, @Body() dto: UpdateItemDto) {
    return this.service.updateItem(req.accountId, itemId, dto);
  }

  // DELETE /shopping-list/items/:itemId
  @Delete('items/:itemId')
  deleteItem(@Req() req: AuthenticatedRequest, @Param('itemId') itemId: string) {
    return this.service.deleteItem(req.accountId, itemId);
  }

  // POST /shopping-list/:id/items
  @Post(':id/items')
  addItem(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: CreateItemDto) {
    return this.service.addItem(req.accountId, req.user.id, id, dto);
  }

  // POST /shopping-list/:id/clear-checked
  @Post(':id/clear-checked')
  clearChecked(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.clearChecked(req.accountId, id);
  }

  // PATCH /shopping-list/:id
  @Patch(':id')
  updateList(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateListDto) {
    return this.service.updateList(req.accountId, id, dto);
  }

  // DELETE /shopping-list/:id
  @Delete(':id')
  deleteList(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.deleteList(req.accountId, id);
  }
}
```

- [ ] **Step 5: Implement the module**

```ts
// apps/api/src/modules/shopping-list/shopping-list.module.ts
import { Module } from '@nestjs/common';
import { ShoppingListController } from './shopping-list.controller';
import { ShoppingListService } from './shopping-list.service';

@Module({
  controllers: [ShoppingListController],
  providers: [ShoppingListService],
  exports: [ShoppingListService],
})
export class ShoppingListModule {}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/api && npx jest src/modules/shopping-list/shopping-list.controller.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/shopping-list
git commit -m "feat(shopping-list): add controller, DTOs, module with routing tests"
```

---

### Task 9: Sync handlers (push + pull) for the two entities

**Files:**
- Modify: `apps/api/src/modules/sync/sync.service.ts`
- Test: `apps/api/src/modules/sync/sync.service.spec.ts` (add cases; if the file does not exist, create it with a minimal harness mirroring an existing service spec)

**Interfaces:**
- Consumes: `SyncChange` union (Task 3), Prisma `shoppingList`/`shoppingListItem`.
- Produces: `processShoppingListChange`, `processShoppingListItemChange`; dispatch + pull entries.

- [ ] **Step 1: Write the failing push test**

Add to `sync.service.spec.ts` (reusing its existing prisma mock; add `shoppingList` + `shoppingListItem` mocks to it):

```ts
it('processChange upserts a shopping_list on create', async () => {
  prisma.shoppingList.upsert.mockResolvedValue({ id: 'srv-1', syncVersion: 0 });
  const res = await (service as any).processChange('a1', 'u1', {
    entityType: 'shopping_list', operation: 'create', entityId: 'cli-1', clientVersion: 0, accountId: 'a1',
    payload: { name: 'Weekly', localId: 'cli-1' },
  });
  expect(res.status).toBe('success');
  expect(res.serverId).toBe('srv-1');
});

it('processChange resolves the item parent list by clientId', async () => {
  prisma.shoppingList.findFirst.mockResolvedValue({ id: 'srv-list', accountId: 'a1' });
  prisma.shoppingListItem.upsert.mockResolvedValue({ id: 'srv-item', syncVersion: 0 });
  const res = await (service as any).processChange('a1', 'u1', {
    entityType: 'shopping_list_item', operation: 'create', entityId: 'ci-1', clientVersion: 0, accountId: 'a1',
    payload: { shoppingListId: 'cli-list', rawLabel: 'Milk', localId: 'ci-1' },
  });
  expect(prisma.shoppingList.findFirst).toHaveBeenCalled();
  expect(prisma.shoppingListItem.upsert).toHaveBeenCalledWith(
    expect.objectContaining({ create: expect.objectContaining({ shoppingListId: 'srv-list' }) }),
  );
  expect(res.status).toBe('success');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/modules/sync/sync.service.spec.ts -t shopping_list`
Expected: FAIL (dispatch returns `Unknown entity type` / handler missing).

- [ ] **Step 3: Add the dispatch cases**

In `processChange`'s `switch`, before `default:`:

```ts
      case 'shopping_list':
        return this.processShoppingListChange(accountId, userId, change);
      case 'shopping_list_item':
        return this.processShoppingListItemChange(accountId, userId, change);
```

- [ ] **Step 4: Add the two handlers**

Add these methods to `SyncService` (modeled on `processProjectChange`):

```ts
  private async processShoppingListChange(
    accountId: string,
    userId: string,
    change: Extract<SyncChange, { entityType: 'shopping_list' }>,
  ): Promise<SyncResult> {
    const { payload } = change;
    const cid = payload.localId || change.entityId;
    if (change.operation === 'create') {
      const list = await this.prisma.shoppingList.upsert({
        where: { accountId_clientId: { accountId, clientId: cid } },
        create: {
          accountId, clientId: cid, name: payload.name,
          isDefault: payload.isDefault ?? false, isArchived: payload.isArchived ?? false,
          sortOrder: payload.sortOrder ?? 0, createdByUserId: userId,
        },
        update: {
          name: payload.name, isArchived: payload.isArchived ?? false,
          sortOrder: payload.sortOrder ?? 0, isDeleted: false,
        },
      });
      return { entityId: change.entityId, status: 'success', serverId: list.id, serverVersion: list.syncVersion };
    }
    if (change.operation === 'update') {
      const list = await this.prisma.shoppingList.findFirst({ where: { accountId, OR: [{ id: change.entityId }, { clientId: cid }] } });
      if (!list) return { entityId: change.entityId, status: 'error', error: 'List not found' };
      const updated = await this.prisma.shoppingList.update({
        where: { id: list.id },
        data: { name: payload.name, isArchived: payload.isArchived ?? false, sortOrder: payload.sortOrder ?? 0, syncVersion: { increment: 1 } },
      });
      return { entityId: change.entityId, status: 'success', serverVersion: updated.syncVersion };
    }
    if (change.operation === 'delete') {
      await this.prisma.shoppingList.updateMany({ where: { accountId, OR: [{ id: change.entityId }, { clientId: cid }] }, data: { isDeleted: true, syncVersion: { increment: 1 } } });
      return { entityId: change.entityId, status: 'success' };
    }
    return { entityId: change.entityId, status: 'error', error: 'Unknown operation' };
  }

  private async processShoppingListItemChange(
    accountId: string,
    userId: string,
    change: Extract<SyncChange, { entityType: 'shopping_list_item' }>,
  ): Promise<SyncResult> {
    const { payload } = change;
    const cid = payload.localId || change.entityId;
    if (change.operation === 'create') {
      // Resolve the parent list by device clientId OR server id
      const list = await this.prisma.shoppingList.findFirst({
        where: { accountId, OR: [{ id: payload.shoppingListId }, { clientId: payload.shoppingListId }] },
      });
      if (!list) return { entityId: change.entityId, status: 'error', error: 'Parent list not found' };
      const item = await this.prisma.shoppingListItem.upsert({
        where: { accountId_clientId: { accountId, clientId: cid } },
        create: {
          accountId, shoppingListId: list.id, clientId: cid,
          canonicalName: payload.canonicalName ?? null, rawLabel: payload.rawLabel,
          quantity: payload.quantity ?? 1, note: payload.note ?? null,
          isChecked: payload.isChecked ?? false, sortOrder: payload.sortOrder ?? 0, addedByUserId: userId,
        },
        update: {
          canonicalName: payload.canonicalName ?? null, rawLabel: payload.rawLabel,
          quantity: payload.quantity ?? 1, note: payload.note ?? null,
          isChecked: payload.isChecked ?? false, sortOrder: payload.sortOrder ?? 0, isDeleted: false,
        },
      });
      return { entityId: change.entityId, status: 'success', serverId: item.id, serverVersion: item.syncVersion };
    }
    if (change.operation === 'update') {
      const item = await this.prisma.shoppingListItem.findFirst({ where: { accountId, OR: [{ id: change.entityId }, { clientId: cid }] } });
      if (!item) return { entityId: change.entityId, status: 'error', error: 'Item not found' };
      const updated = await this.prisma.shoppingListItem.update({
        where: { id: item.id },
        data: {
          canonicalName: payload.canonicalName ?? null, rawLabel: payload.rawLabel,
          quantity: payload.quantity ?? 1, note: payload.note ?? null,
          isChecked: payload.isChecked ?? false, sortOrder: payload.sortOrder ?? 0, syncVersion: { increment: 1 },
        },
      });
      return { entityId: change.entityId, status: 'success', serverVersion: updated.syncVersion };
    }
    if (change.operation === 'delete') {
      await this.prisma.shoppingListItem.updateMany({ where: { accountId, OR: [{ id: change.entityId }, { clientId: cid }] }, data: { isDeleted: true, syncVersion: { increment: 1 } } });
      return { entityId: change.entityId, status: 'success' };
    }
    return { entityId: change.entityId, status: 'error', error: 'Unknown operation' };
  }
```

- [ ] **Step 5: Add pull queries + change mappers**

In the pull method's `Promise.all([...])`, add (after the `investmentTransaction.findMany` entry):

```ts
      this.prisma.shoppingList.findMany({ where: { accountId, updatedAt: { gt: since } } }),
      this.prisma.shoppingListItem.findMany({ where: { accountId, updatedAt: { gt: since } }, include: { shoppingList: { select: { clientId: true } } } }),
```

Add matching names to the destructured result array (append `, shoppingLists, shoppingListItems` in the same order).

Then append to the `changes` array (after the `investmentTransactions.map` block). Note the item maps its FK to the **parent list's clientId** so the device stays clientId-consistent:

```ts
      ...shoppingLists.map((l: { clientId: string; isDeleted: boolean; syncVersion: number; updatedAt: Date }) => ({
        entityType: 'shopping_list' as const,
        entityId: l.clientId,
        operation: l.isDeleted ? 'delete' as const : 'update' as const,
        data: l,
        version: l.syncVersion,
        timestamp: l.updatedAt.toISOString(),
      })),
      ...shoppingListItems.map((it: { clientId: string; isDeleted: boolean; syncVersion: number; updatedAt: Date; shoppingList: { clientId: string } }) => ({
        entityType: 'shopping_list_item' as const,
        entityId: it.clientId,
        operation: it.isDeleted ? 'delete' as const : 'update' as const,
        data: { ...it, shoppingListId: it.shoppingList.clientId },
        version: it.syncVersion,
        timestamp: it.updatedAt.toISOString(),
      })),
```

- [ ] **Step 6: Run tests + typecheck**

Run: `cd apps/api && npx jest src/modules/sync/sync.service.spec.ts -t shopping`
Expected: PASS.
Run: `cd apps/api && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/sync/sync.service.ts apps/api/src/modules/sync/sync.service.spec.ts
git commit -m "feat(sync): push+pull handlers for shopping_list and shopping_list_item"
```

---

### Task 10: Register the module + full API check

**Files:**
- Modify: `apps/api/src/app.module.ts` (add `ShoppingListModule` to `imports`)

- [ ] **Step 1: Register the module**

Add the import and array entry in `app.module.ts`:

```ts
import { ShoppingListModule } from './modules/shopping-list/shopping-list.module';
```
…and add `ShoppingListModule` to the `imports` array.

- [ ] **Step 2: Full typecheck + test suite**

Run: `cd apps/api && npx tsc --noEmit && npx jest src/modules/shopping-list src/modules/price-history src/modules/sync`
Expected: PASS (all shopping-list, price-history, sync specs green).

- [ ] **Step 3: Boot check**

Run: `cd apps/api && npm run build`
Expected: build succeeds with no unresolved-provider / DI errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/app.module.ts
git commit -m "feat(api): register ShoppingListModule"
```

---

## Self-Review

**Spec coverage (M1 + M2 backend):**
- Data model (both tables + relations) → Task 4. ✓
- Basket engine (pure `computeBasket`, coverage/stale/currency/quantity) → Task 5. ✓
- `POST /price-history/basket` Pro-gated → Task 6. ✓
- Shopping-list CRUD, default-list auto-create, idempotent add, clear-checked → Tasks 7–8. ✓
- No `ViewerBlockGuard` on item writes; accountId/userId from req → Tasks 7–8. ✓
- Route ordering (`items/*` + `clear-checked` before `:id`) → Task 8. ✓
- Offline-first push+pull for both entities, clientId FK resolution → Tasks 3, 9. ✓
- Shared types (entities, basket, sync union) → Tasks 1–3. ✓
- Module registration → Task 10. ✓
- **Deferred to later plans (correctly out of this plan's scope):** SQLite mirror + mobile store/screens/i18n (Plan 2); restock/geo/multi-list-UI/deals (Plans 3–6).

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every test step shows assertions. Task 6 Step 6 asks the engineer to read `insights.module.ts` for the exact tier-guard dependency import — this is a concrete lookup of an existing pattern, not a placeholder.

**Type consistency:** `computeBasket(rows, basket, now?)`, `BasketRow`, `getBasketComparison(accountId, items)`, `BasketCompareResponse` used identically across Tasks 2/5/6. Sync payload field `shoppingListId` (list clientId) resolved to `list.id` consistently in Task 9 push and mapped back to `shoppingList.clientId` in pull. Service method names (`getLists/createList/updateList/deleteList/addItem/updateItem/deleteItem/clearChecked`) match between Tasks 7 and 8.

---

## Roadmap — remaining milestone plans (authored one at a time as reached)

- **Plan 2 — Mobile Core (M1+M2 client):** SQLite schema + migrations (`client.native.ts`), `shoppingListRepository` + `shoppingListItemRepository`, offline-first `shoppingListStore`, `shoppingList.api.ts` (+ `compareBasket`), screens (`shopping-list/index`, add-item sheet, `compare` with Paywall gate), entry points (quick action, Settings row, Analytics link), `shoppingList.*` i18n in 9 locales.
- **Plan 3 — M3 Restock:** `restock-predictor.ts` (median-gap) + tests, `GET /shopping-list/suggestions`, `shopping-reminder.cron.ts`, `shopping_reminder` NotificationType + preference + `notification-i18n`, mobile suggestions strip + toggle.
- **Plan 4 — M4 Geo:** store-coordinate derivation from `locationLat/Lng`, basket endpoint `lat/lng` → `distanceKm`/`nearby` (haversine), `app/shopping-list/map.tsx` on `ExpenseMapView`, cheapest/nearby toggle.
- **Plan 5 — M5 Multi-list UI:** list switcher, rename/archive/delete UI on top of the already-built list CRUD + `ShoppingList` table.
- **Plan 6 — M6 Deals:** `deal-detector.ts` (≥15% drop vs 90-day avg) + tests, folded into the reminder cron, `shopping_deal` NotificationType + preference + `notification-i18n`, mobile deal surfacing + toggle.
