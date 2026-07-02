# Personal Inflation Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track receipt line-item prices over time and display a weighted personal inflation index in the Analytics tab.

**Architecture:** `canonical_name` added to `expense_items` (populated by OCR at scan time) + `product_aliases` table (user renames/merges) → `GET /price-history` computes Laspeyres-weighted index server-side, caches 300 s in Redis → `InflationIndexSection` in Analytics tab shows headline % + product list + store comparison.

**Tech Stack:** NestJS/Prisma (API), Expo/React Native/Zustand (mobile), Jest (API tests), 9-locale i18n.

## Global Constraints

- All 9 locales must be updated: `en`, `de`, `es`, `fr`, `pl`, `ru`, `ua`, `be`, `nl`
- No `@RequireTier` — feature is free for all users
- `ViewerBlockGuard` on all write endpoints: `@UseGuards(new ViewerBlockGuard())`
- Controller route ordering: static paths before dynamic (`:rawName`) paths
- `(this.prisma as any).modelName` pattern until Prisma regenerates (see merchant-rules pattern)
- Redis cache key `ph:{accountId}:{period}` TTL 300 s; expire naturally, no explicit invalidation
- Mobile ALTER TABLE wrapped in `try { expoDb.execSync(...) } catch {}` to survive re-runs
- `console.warn` (never `console.error`) for non-fatal mobile store failures

---

## File Map

**Create:**
- `packages/shared-types/src/dto/price-history.ts` — DTOs: `StoreLatestPrice`, `PriceHistoryProduct`, `PriceHistoryResponse`, `ProductListItem`, `UpsertAliasDto`, `MergeProductsDto`
- `apps/api/src/modules/price-history/price-history.module.ts`
- `apps/api/src/modules/price-history/price-history.service.ts`
- `apps/api/src/modules/price-history/price-history.controller.ts`
- `apps/api/src/modules/price-history/dto/index.ts`
- `apps/api/src/modules/price-history/price-history.service.spec.ts`
- `apps/mobile/src/services/priceHistory.api.ts`
- `apps/mobile/src/stores/priceHistoryStore.ts`
- `apps/mobile/src/components/analytics/InflationIndexSection.tsx`

**Modify:**
- `packages/shared-types/src/dto/index.ts` — add `export * from './price-history'`
- `apps/api/prisma/schema.prisma` — add `canonicalName` to `ExpenseItem`, add `ProductAlias` model
- `apps/api/src/modules/ai/services/ocr.service.ts` — extend `ReceiptItem`, update prompt, add fallback helper
- `apps/api/src/app.module.ts` — import `PriceHistoryModule`
- `apps/mobile/src/db/client.native.ts` — ALTER TABLE for `canonical_name`
- `apps/mobile/src/components/analytics/` — wire `InflationIndexSection` in `(tabs)/analytics.tsx`
- `apps/mobile/app/settings/reference.tsx` — add Products row
- `apps/mobile/app/_layout.tsx` — register `settings/products` route
- `apps/mobile/src/i18n/locales/*.ts` — all 9 locale files

---

### Task 1: Shared Types

**Files:**
- Create: `packages/shared-types/src/dto/price-history.ts`
- Modify: `packages/shared-types/src/dto/index.ts`

**Interfaces:**
- Produces: `StoreLatestPrice`, `PriceHistoryProduct`, `PriceHistoryResponse`, `ProductListItem`, `UpsertAliasDto`, `MergeProductsDto`

- [ ] **Step 1: Create `packages/shared-types/src/dto/price-history.ts`**

```ts
export interface StoreLatestPrice {
  merchantName: string;
  latestPrice: number;
  latestDate: string; // ISO date YYYY-MM-DD
}

export interface PriceHistoryProduct {
  canonicalName: string;
  priceChangePct: number;       // positive = more expensive, e.g. 23.0
  currentAvgPrice: number;
  baseAvgPrice: number;
  currency: string;
  purchaseCount: number;
  stores: StoreLatestPrice[];
  pricePoints: { date: string; price: number; merchant: string }[];
}

export interface PriceHistoryResponse {
  inflationIndex: number | null; // null when < 3 qualifying products
  period: '3m' | '6m' | '12m';
  productCount: number;
  currency: string;
  products: PriceHistoryProduct[];
}

export interface ProductListItem {
  rawName: string;
  canonicalName: string; // alias.canonicalName ?? rawName
  purchaseCount: number;
  lastSeen: string;      // ISO date
}

export interface UpsertAliasDto {
  rawName: string;
  canonicalName: string;
}

export interface MergeProductsDto {
  rawNames: string[];
  canonicalName: string;
}
```

- [ ] **Step 2: Add barrel export in `packages/shared-types/src/dto/index.ts`**

Append at end of file:
```ts
export * from './price-history';
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared-types/src/dto/price-history.ts packages/shared-types/src/dto/index.ts
git commit -m "feat(shared-types): add PriceHistory DTOs"
```

---

### Task 2: Prisma Schema + Migrations

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Produces: `canonical_name TEXT` on `expense_items`, `product_aliases` table

- [ ] **Step 1: Add `canonicalName` to `ExpenseItem` in `schema.prisma`**

Find the `ExpenseItem` model (around line 441). Add `canonicalName` after `description`:

```prisma
model ExpenseItem {
  id                   String   @id @default(uuid())
  expenseId            String   @map("expense_id")
  description          String
  canonicalName        String?  @map("canonical_name")
  quantity             Decimal  @default(1) @db.Decimal(10, 3)
  unitPrice            Decimal  @default(0) @map("unit_price") @db.Decimal(12, 2)
  totalPrice           Decimal  @map("total_price") @db.Decimal(12, 2)
  sortOrder            Int      @default(0) @map("sort_order")
  isDeleted            Boolean  @default(false) @map("is_deleted")
  syncVersion          Int      @default(0) @map("sync_version")
  encryptedPayload     String?  @map("encrypted_payload")
  encryptionKeyVersion Int?     @map("encryption_key_version")
  createdAt            DateTime @default(now()) @map("created_at")
  updatedAt            DateTime @updatedAt @map("updated_at")

  expense Expense @relation(fields: [expenseId], references: [id], onDelete: Cascade)

  @@index([expenseId])
  @@map("expense_items")
}
```

- [ ] **Step 2: Add `ProductAlias` model in `schema.prisma`**

Add after the `ExpenseItem` model:

```prisma
model ProductAlias {
  id            String   @id @default(uuid())
  accountId     String   @map("account_id")
  rawName       String   @map("raw_name")
  canonicalName String   @map("canonical_name")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@unique([accountId, rawName])
  @@index([accountId])
  @@map("product_aliases")
}
```

Also add `productAliases ProductAlias[]` to the `Account` model's relations list.

- [ ] **Step 3: Run first migration**

```bash
cd apps/api
npx prisma migrate dev --name add_expense_item_canonical_name
```

Expected: creates `20260702000000_add_expense_item_canonical_name` in `prisma/migrations/`, adds `canonical_name` column.

- [ ] **Step 4: Run second migration**

```bash
npx prisma migrate dev --name add_product_aliases
```

Expected: creates `20260702000001_add_product_aliases`, creates `product_aliases` table.

- [ ] **Step 5: Regenerate Prisma client**

```bash
npx prisma generate
```

- [ ] **Step 6: Commit**

```bash
cd ../..
git add apps/api/prisma/
git commit -m "feat(db): add canonical_name to expense_items, add product_aliases table"
```

---

### Task 3: OCR Pipeline Extension

**Files:**
- Modify: `apps/api/src/modules/ai/services/ocr.service.ts`

**Interfaces:**
- Consumes: existing `ReceiptItem`, `buildReceiptPrompt()` internal function
- Produces: `ReceiptItem.canonicalName?: string`, `buildCanonicalNameFallback(description: string): string | null`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/ai/services/ocr.service.spec.ts` (or add to existing if it exists). Add:

```ts
import { buildCanonicalNameFallback } from './ocr.service';

describe('buildCanonicalNameFallback', () => {
  it('returns first word >= 3 chars that is not purely numeric', () => {
    expect(buildCanonicalNameFallback('MLEKO 3,2% ŁACIATE 1L')).toBe('MLEKO');
  });

  it('skips purely numeric tokens', () => {
    expect(buildCanonicalNameFallback('123 CHLEB 500G')).toBe('CHLEB');
  });

  it('skips tokens shorter than 3 chars', () => {
    expect(buildCanonicalNameFallback('AB MLEKO')).toBe('MLEKO');
  });

  it('returns null when no suitable token exists', () => {
    expect(buildCanonicalNameFallback('12 AB')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(buildCanonicalNameFallback('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/api
npx jest ocr.service.spec.ts --no-coverage
```

Expected: FAIL — `buildCanonicalNameFallback` is not exported.

- [ ] **Step 3: Extend `ReceiptItem` interface and export the fallback helper**

In `apps/api/src/modules/ai/services/ocr.service.ts`:

1. Extend `ReceiptItem` (around line 13):
```ts
export interface ReceiptItem {
  description: string;
  canonicalName?: string;  // ADD: short name without weight/volume/%, populated by OCR
  quantity?: number;
  unitPrice?: number;
  totalPrice: number;
}
```

2. Export the fallback helper (add near top of file, after interfaces):
```ts
export function buildCanonicalNameFallback(description: string): string | null {
  const tokens = description.split(/\s+/);
  for (const token of tokens) {
    if (token.length >= 3 && !/^\d+([.,]\d+)?%?[GLKgmMlL]*$/.test(token)) {
      return token;
    }
  }
  return null;
}
```

3. In `buildReceiptPrompt()`, find the items array schema (around line 188) and add `canonicalName` field + instruction:

Locate the items section in the prompt string. It currently shows:
```
"items": [
  {
    "description": "clean, normalized product name ...",
    "quantity": 1,
    "unitPrice": 10.00,
    "totalPrice": 10.00
  }
],
```

Change to:
```
"items": [
  {
    "description": "clean, normalized product name (see normalization rules below)",
    "canonicalName": "short product name in title case, no quantity/weight/volume/percentage/codes",
    "quantity": 1,
    "unitPrice": 10.00,
    "totalPrice": 10.00
  }
],
```

And add to the normalization rules section: `canonicalName examples: "MLEKO 3,2% ŁACIATE 1L 6SZT" → "Mleko Łaciate", "CHLEB RAZOWY WIEJSKI 500G" → "Chleb Razowy", "PIWO TYSKIE 0,5L 4,7%" → "Tyskie Piwo".`

4. In `validateAndNormalizeReceipt()` (or wherever items are post-processed), apply fallback:
```ts
// After parsing items from LLM response, for each item:
item.canonicalName = item.canonicalName?.trim() || buildCanonicalNameFallback(item.description) || undefined;
```

- [ ] **Step 4: Run tests**

```bash
npx jest ocr.service.spec.ts --no-coverage
```

Expected: PASS (all 5 tests).

- [ ] **Step 5: Pass `canonicalName` through to ExpenseItem persistence**

Find where `ExpenseItem`s are written in `apps/api/src/modules/expenses/expenses.service.ts`. Locate the `expenseItems: { create: [...] }` Prisma nested write. Add `canonicalName` to the create object:

```ts
// In the expenseItems create/upsert spread, add:
canonicalName: item.canonicalName ?? null,
```

Do the same in `apps/api/src/modules/sync/sync.service.ts` wherever `ExpenseItem` upserts happen — add `canonicalName: change.canonicalName ?? null` to the upsert payload.

- [ ] **Step 6: Commit**

```bash
cd ../..
git add apps/api/src/modules/ai/services/ocr.service.ts \
        apps/api/src/modules/ai/services/ocr.service.spec.ts \
        apps/api/src/modules/expenses/expenses.service.ts \
        apps/api/src/modules/sync/sync.service.ts
git commit -m "feat(ocr): add canonicalName to ReceiptItem, extend OCR prompt, pass through to ExpenseItem"
```

---

### Task 4: price-history API Module

**Files:**
- Create: `apps/api/src/modules/price-history/dto/index.ts`
- Create: `apps/api/src/modules/price-history/price-history.service.ts`
- Create: `apps/api/src/modules/price-history/price-history.service.spec.ts`
- Create: `apps/api/src/modules/price-history/price-history.controller.ts`
- Create: `apps/api/src/modules/price-history/price-history.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService`, `CacheService`, shared types from Task 1
- Produces: 5 HTTP endpoints under `/price-history`

- [ ] **Step 1: Create `dto/index.ts`**

```ts
// apps/api/src/modules/price-history/dto/index.ts
import { IsString, IsArray, ArrayNotEmpty, ArrayMaxSize } from 'class-validator';

export class UpsertAliasDto {
  @IsString()
  rawName: string;

  @IsString()
  canonicalName: string;
}

export class MergeProductsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  rawNames: string[];

  @IsString()
  canonicalName: string;
}
```

- [ ] **Step 2: Write failing service tests**

Create `apps/api/src/modules/price-history/price-history.service.spec.ts`:

```ts
import { PriceHistoryService } from './price-history.service';

describe('PriceHistoryService', () => {
  describe('resolveMajorityCurrency', () => {
    it('returns the currency with most rows', () => {
      const svc = new PriceHistoryService(null as any, null as any);
      const result = (svc as any).resolveMajorityCurrency([
        { currency: 'PLN' }, { currency: 'PLN' }, { currency: 'EUR' },
      ]);
      expect(result).toBe('PLN');
    });

    it('breaks ties alphabetically', () => {
      const svc = new PriceHistoryService(null as any, null as any);
      const result = (svc as any).resolveMajorityCurrency([
        { currency: 'EUR' }, { currency: 'PLN' },
      ]);
      expect(result).toBe('EUR');
    });
  });

  describe('computeInflationIndex', () => {
    const makeSvc = () => new PriceHistoryService(null as any, null as any);

    it('returns null when fewer than 3 qualifying products', () => {
      const svc = makeSvc();
      const result = (svc as any).computeInflationIndex([], '6m');
      expect(result.inflationIndex).toBeNull();
    });

    it('computes weighted index correctly', () => {
      const svc = makeSvc();
      const now = new Date('2026-07-02');
      // 3 products, each doubling in price (+100%), weight proportional to base price
      const rows = [
        { resolvedName: 'Mleko', date: new Date('2026-01-05'), unitPrice: 3.0, merchant: 'Biedronka', currency: 'PLN' },
        { resolvedName: 'Mleko', date: new Date('2026-07-01'), unitPrice: 6.0, merchant: 'Biedronka', currency: 'PLN' },
        { resolvedName: 'Chleb', date: new Date('2026-01-10'), unitPrice: 4.0, merchant: 'Lidl', currency: 'PLN' },
        { resolvedName: 'Chleb', date: new Date('2026-07-01'), unitPrice: 8.0, merchant: 'Lidl', currency: 'PLN' },
        { resolvedName: 'Maslo', date: new Date('2026-01-15'), unitPrice: 7.0, merchant: 'Kaufland', currency: 'PLN' },
        { resolvedName: 'Maslo', date: new Date('2026-07-01'), unitPrice: 14.0, merchant: 'Kaufland', currency: 'PLN' },
      ];
      const result = (svc as any).computeInflationIndex(rows, '6m', now);
      expect(result.inflationIndex).toBeCloseTo(100, 0);
      expect(result.productCount).toBe(3);
    });

    it('excludes products without data in both periods', () => {
      const svc = makeSvc();
      const now = new Date('2026-07-02');
      // Only 2 qualifying products (Maslo has data only in current period)
      const rows = [
        { resolvedName: 'Mleko', date: new Date('2026-01-05'), unitPrice: 3.0, merchant: 'B', currency: 'PLN' },
        { resolvedName: 'Mleko', date: new Date('2026-07-01'), unitPrice: 6.0, merchant: 'B', currency: 'PLN' },
        { resolvedName: 'Chleb', date: new Date('2026-01-10'), unitPrice: 4.0, merchant: 'L', currency: 'PLN' },
        { resolvedName: 'Chleb', date: new Date('2026-07-01'), unitPrice: 8.0, merchant: 'L', currency: 'PLN' },
        { resolvedName: 'Maslo', date: new Date('2026-06-01'), unitPrice: 7.0, merchant: 'K', currency: 'PLN' },
      ];
      const result = (svc as any).computeInflationIndex(rows, '6m', now);
      expect(result.inflationIndex).toBeNull(); // < 3 qualifying
      expect(result.productCount).toBe(2);
    });
  });
});
```

- [ ] **Step 3: Run to verify tests fail**

```bash
cd apps/api
npx jest price-history.service.spec.ts --no-coverage
```

Expected: FAIL — `PriceHistoryService` not found.

- [ ] **Step 4: Implement `price-history.service.ts`**

```ts
// apps/api/src/modules/price-history/price-history.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import type {
  PriceHistoryResponse,
  PriceHistoryProduct,
  ProductListItem,
  StoreLatestPrice,
} from '@budget/shared-types';

type Period = '3m' | '6m' | '12m';

interface RawItemRow {
  resolvedName: string;
  date: Date;
  unitPrice: number;
  merchant: string;
  currency: string;
}

@Injectable()
export class PriceHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getPriceHistory(accountId: string, period: Period = '6m'): Promise<PriceHistoryResponse> {
    const cacheKey = `ph:${accountId}:${period}`;
    const cached = await this.cache.get<PriceHistoryResponse>(cacheKey);
    if (cached) return cached;

    const rows = await this.fetchRows(accountId);
    const currency = this.resolveMajorityCurrency(rows);
    const filtered = rows.filter((r) => r.currency === currency);
    const { inflationIndex, productCount, products } = this.computeInflationIndex(filtered, period);

    const result: PriceHistoryResponse = { inflationIndex, period, productCount, currency, products };
    await this.cache.set(cacheKey, result, 300);
    return result;
  }

  async listProducts(accountId: string): Promise<ProductListItem[]> {
    const aliases = await this.getAliasMap(accountId);
    const items: Array<{ canonicalName: string; date: Date }> = await (this.prisma as any).expenseItem.findMany({
      where: {
        expense: { accountId, isDeleted: false },
        canonicalName: { not: null },
        isDeleted: false,
      },
      select: { canonicalName: true, expense: { select: { date: true } } },
    });

    const productMap = new Map<string, { count: number; lastSeen: Date }>();
    for (const item of items) {
      const raw = item.canonicalName as string;
      const existing = productMap.get(raw) ?? { count: 0, lastSeen: new Date(0) };
      existing.count += 1;
      const expDate = (item as any).expense?.date ?? new Date(0);
      if (expDate > existing.lastSeen) existing.lastSeen = expDate;
      productMap.set(raw, existing);
    }

    return Array.from(productMap.entries())
      .map(([rawName, { count, lastSeen }]) => ({
        rawName,
        canonicalName: aliases.get(rawName) ?? rawName,
        purchaseCount: count,
        lastSeen: lastSeen.toISOString().slice(0, 10),
      }))
      .sort((a, b) => b.purchaseCount - a.purchaseCount);
  }

  async upsertAlias(accountId: string, rawName: string, canonicalName: string): Promise<void> {
    await (this.prisma as any).productAlias.upsert({
      where: { accountId_rawName: { accountId, rawName } },
      create: { accountId, rawName, canonicalName },
      update: { canonicalName },
    });
  }

  async deleteAlias(accountId: string, rawName: string): Promise<void> {
    await (this.prisma as any).productAlias.deleteMany({ where: { accountId, rawName } });
  }

  async mergeProducts(accountId: string, rawNames: string[], canonicalName: string): Promise<void> {
    await this.prisma.$transaction(
      rawNames.map((rawName) =>
        (this.prisma as any).productAlias.upsert({
          where: { accountId_rawName: { accountId, rawName } },
          create: { accountId, rawName, canonicalName },
          update: { canonicalName },
        }),
      ),
    );
  }

  // ── private helpers ──────────────────────────────────────────────────────

  private async fetchRows(accountId: string): Promise<RawItemRow[]> {
    const aliases = await this.getAliasMap(accountId);
    const items = await (this.prisma as any).expenseItem.findMany({
      where: {
        expense: { accountId, isDeleted: false },
        canonicalName: { not: null },
        isDeleted: false,
      },
      select: {
        canonicalName: true,
        unitPrice: true,
        expense: { select: { date: true, merchant: true, currencyCode: true } },
      },
    });

    return items.map((item: any) => ({
      resolvedName: aliases.get(item.canonicalName) ?? item.canonicalName,
      date: item.expense.date,
      unitPrice: Number(item.unitPrice),
      merchant: item.expense.merchant ?? 'Unknown',
      currency: item.expense.currencyCode ?? 'PLN',
    }));
  }

  private async getAliasMap(accountId: string): Promise<Map<string, string>> {
    const aliases: Array<{ rawName: string; canonicalName: string }> =
      await (this.prisma as any).productAlias.findMany({
        where: { accountId },
        select: { rawName: true, canonicalName: true },
      });
    return new Map(aliases.map((a) => [a.rawName, a.canonicalName]));
  }

  private resolveMajorityCurrency(rows: Pick<RawItemRow, 'currency'>[]): string {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.currency, (counts.get(r.currency) ?? 0) + 1);
    if (counts.size === 0) return 'PLN';
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  }

  private computeInflationIndex(
    rows: RawItemRow[],
    period: Period,
    now: Date = new Date(),
  ): { inflationIndex: number | null; productCount: number; products: PriceHistoryProduct[] } {
    const periodMs = { '3m': 90, '6m': 180, '12m': 365 }[period] * 24 * 60 * 60 * 1000;
    const periodStart = new Date(now.getTime() - periodMs);
    const baseStart = new Date(now.getTime() - periodMs * 2);

    // Group by resolved name
    const byProduct = new Map<string, RawItemRow[]>();
    for (const row of rows) {
      const existing = byProduct.get(row.resolvedName) ?? [];
      existing.push(row);
      byProduct.set(row.resolvedName, existing);
    }

    const products: PriceHistoryProduct[] = [];
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [name, items] of byProduct.entries()) {
      const baseItems = items.filter((i) => i.date >= baseStart && i.date < periodStart);
      const currentItems = items.filter((i) => i.date >= periodStart && i.date <= now);

      if (baseItems.length === 0 || currentItems.length === 0) continue;

      const baseAvg = baseItems.reduce((s, i) => s + i.unitPrice, 0) / baseItems.length;
      const currentAvg = currentItems.reduce((s, i) => s + i.unitPrice, 0) / currentItems.length;
      const priceChangePct = ((currentAvg - baseAvg) / baseAvg) * 100;
      const weight = baseAvg * baseItems.length;

      weightedSum += weight * priceChangePct;
      totalWeight += weight;

      // Store comparison: latest price per merchant
      const storeMap = new Map<string, StoreLatestPrice>();
      for (const item of [...baseItems, ...currentItems].sort((a, b) => a.date.getTime() - b.date.getTime())) {
        storeMap.set(item.merchant, {
          merchantName: item.merchant,
          latestPrice: item.unitPrice,
          latestDate: item.date.toISOString().slice(0, 10),
        });
      }

      products.push({
        canonicalName: name,
        priceChangePct: Math.round(priceChangePct * 10) / 10,
        currentAvgPrice: Math.round(currentAvg * 100) / 100,
        baseAvgPrice: Math.round(baseAvg * 100) / 100,
        currency: items[0].currency,
        purchaseCount: items.length,
        stores: [...storeMap.values()].sort((a, b) => a.latestPrice - b.latestPrice),
        pricePoints: items
          .sort((a, b) => a.date.getTime() - b.date.getTime())
          .map((i) => ({ date: i.date.toISOString().slice(0, 10), price: i.unitPrice, merchant: i.merchant })),
      });
    }

    products.sort((a, b) => Math.abs(b.priceChangePct) - Math.abs(a.priceChangePct));
    const productCount = products.length;
    const inflationIndex = productCount >= 3 && totalWeight > 0
      ? Math.round((weightedSum / totalWeight) * 10) / 10
      : null;

    return { inflationIndex, productCount, products };
  }
}
```

- [ ] **Step 5: Run tests**

```bash
npx jest price-history.service.spec.ts --no-coverage
```

Expected: PASS (all 5 tests).

- [ ] **Step 6: Create `price-history.controller.ts`**

```ts
// apps/api/src/modules/price-history/price-history.controller.ts
import { Controller, Get, Patch, Delete, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../expenses/guards/viewer-block.guard';
import { AuthenticatedRequest } from '../../common/types';
import { PriceHistoryService } from './price-history.service';
import { UpsertAliasDto, MergeProductsDto } from './dto';

@Controller('price-history')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class PriceHistoryController {
  constructor(private readonly priceHistoryService: PriceHistoryService) {}

  @Get()
  getPriceHistory(
    @Req() req: AuthenticatedRequest,
    @Query('period') period: '3m' | '6m' | '12m' = '6m',
  ) {
    const p = ['3m', '6m', '12m'].includes(period) ? period : '6m';
    return this.priceHistoryService.getPriceHistory(req.accountId, p);
  }

  @Get('products')
  listProducts(@Req() req: AuthenticatedRequest) {
    return this.priceHistoryService.listProducts(req.accountId);
  }

  // IMPORTANT: PATCH products/alias must be declared BEFORE DELETE products/alias/:rawName
  @Patch('products/alias')
  @UseGuards(new ViewerBlockGuard())
  upsertAlias(@Req() req: AuthenticatedRequest, @Body() dto: UpsertAliasDto) {
    return this.priceHistoryService.upsertAlias(req.accountId, dto.rawName, dto.canonicalName);
  }

  @Delete('products/alias/:rawName')
  @UseGuards(new ViewerBlockGuard())
  deleteAlias(@Req() req: AuthenticatedRequest, @Param('rawName') rawName: string) {
    return this.priceHistoryService.deleteAlias(req.accountId, rawName);
  }

  @Post('products/merge')
  @UseGuards(new ViewerBlockGuard())
  mergeProducts(@Req() req: AuthenticatedRequest, @Body() dto: MergeProductsDto) {
    return this.priceHistoryService.mergeProducts(req.accountId, dto.rawNames, dto.canonicalName);
  }
}
```

- [ ] **Step 7: Create `price-history.module.ts`**

```ts
// apps/api/src/modules/price-history/price-history.module.ts
import { Module } from '@nestjs/common';
import { PriceHistoryController } from './price-history.controller';
import { PriceHistoryService } from './price-history.service';

@Module({
  controllers: [PriceHistoryController],
  providers: [PriceHistoryService],
})
export class PriceHistoryModule {}
```

- [ ] **Step 8: Register in `app.module.ts`**

In `apps/api/src/app.module.ts`, add to imports array:
```ts
import { PriceHistoryModule } from './modules/price-history/price-history.module';
// ... in @Module({ imports: [..., PriceHistoryModule] })
```

- [ ] **Step 9: Run full test suite**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Expected: all existing tests pass + price-history tests pass.

- [ ] **Step 10: Commit**

```bash
cd ../..
git add apps/api/src/modules/price-history/ apps/api/src/app.module.ts
git commit -m "feat(api): add price-history module with inflation formula and product alias management"
```

---

### Task 5: Mobile SQLite Migration + API Client + Store

**Files:**
- Modify: `apps/mobile/src/db/client.native.ts`
- Create: `apps/mobile/src/services/priceHistory.api.ts`
- Create: `apps/mobile/src/stores/priceHistoryStore.ts`

**Interfaces:**
- Produces: `usePriceHistoryStore` with `loadPriceHistory(period)`, `loadProducts()`, `upsertAlias()`, `mergeProducts()`, `deleteAlias()`

- [ ] **Step 1: Add mobile SQLite migration**

In `apps/mobile/src/db/client.native.ts`, after the last `ALTER TABLE` block (around line 587), add:

```ts
try { expoDb.execSync(`ALTER TABLE expense_items ADD COLUMN canonical_name TEXT`); } catch {}
```

- [ ] **Step 2: Create `priceHistory.api.ts`**

```ts
// apps/mobile/src/services/priceHistory.api.ts
import { httpClient } from './http-client';
import type {
  PriceHistoryResponse,
  ProductListItem,
  UpsertAliasDto,
  MergeProductsDto,
} from '@budget/shared-types';

export const priceHistoryApi = {
  getPriceHistory: (period: '3m' | '6m' | '12m' = '6m') =>
    httpClient.get<PriceHistoryResponse>(`/price-history?period=${period}`),

  getProducts: () =>
    httpClient.get<ProductListItem[]>('/price-history/products'),

  upsertAlias: (body: UpsertAliasDto) =>
    httpClient.patch('/price-history/products/alias', body),

  deleteAlias: (rawName: string) =>
    httpClient.delete(`/price-history/products/alias/${encodeURIComponent(rawName)}`),

  mergeProducts: (body: MergeProductsDto) =>
    httpClient.post('/price-history/products/merge', body),
};
```

> Note: check how other api files import the http client — use the same pattern. If they use `api` singleton from `src/services/api.ts`, add methods there instead of a separate file. Match the existing pattern exactly.

- [ ] **Step 3: Create `priceHistoryStore.ts`**

```ts
// apps/mobile/src/stores/priceHistoryStore.ts
import { create } from 'zustand';
import { priceHistoryApi } from '@/services/priceHistory.api';
import type { PriceHistoryResponse, ProductListItem } from '@budget/shared-types';

interface PriceHistoryState {
  history: PriceHistoryResponse | null;
  products: ProductListItem[];
  isLoading: boolean;
  selectedPeriod: '3m' | '6m' | '12m';

  loadPriceHistory: (period?: '3m' | '6m' | '12m') => Promise<void>;
  loadProducts: () => Promise<void>;
  upsertAlias: (rawName: string, canonicalName: string) => Promise<void>;
  deleteAlias: (rawName: string) => Promise<void>;
  mergeProducts: (rawNames: string[], canonicalName: string) => Promise<void>;
  reset: () => void;
}

export const usePriceHistoryStore = create<PriceHistoryState>()((set, get) => ({
  history: null,
  products: [],
  isLoading: false,
  selectedPeriod: '6m',

  loadPriceHistory: async (period = get().selectedPeriod) => {
    set({ isLoading: true, selectedPeriod: period });
    try {
      const history = await priceHistoryApi.getPriceHistory(period);
      set({ history, isLoading: false });
    } catch (e) {
      console.warn('[priceHistoryStore] loadPriceHistory failed', e);
      set({ isLoading: false });
    }
  },

  loadProducts: async () => {
    try {
      const products = await priceHistoryApi.getProducts();
      set({ products });
    } catch (e) {
      console.warn('[priceHistoryStore] loadProducts failed', e);
    }
  },

  upsertAlias: async (rawName, canonicalName) => {
    await priceHistoryApi.upsertAlias({ rawName, canonicalName });
    await get().loadPriceHistory();
    await get().loadProducts();
  },

  deleteAlias: async (rawName) => {
    await priceHistoryApi.deleteAlias(rawName);
    await get().loadPriceHistory();
    await get().loadProducts();
  },

  mergeProducts: async (rawNames, canonicalName) => {
    await priceHistoryApi.mergeProducts({ rawNames, canonicalName });
    await get().loadPriceHistory();
    await get().loadProducts();
  },

  reset: () => set({ history: null, products: [], isLoading: false, selectedPeriod: '6m' }),
}));
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/db/client.native.ts \
        apps/mobile/src/services/priceHistory.api.ts \
        apps/mobile/src/stores/priceHistoryStore.ts
git commit -m "feat(mobile): add price-history API client and store"
```

---

### Task 6: i18n — All 9 Locales

**Files:**
- Modify: `apps/mobile/src/i18n/locales/en.ts` (and `de`, `es`, `fr`, `pl`, `ru`, `ua`, `be`, `nl`)

**Interfaces:**
- Produces: `priceHistory.*` namespace in all 9 locales

- [ ] **Step 1: Add to `en.ts`**

In `apps/mobile/src/i18n/locales/en.ts`, add before the closing `} as const;`:

```ts
priceHistory: {
  title: 'Your Inflation',
  headline: '+{{pct}}%',
  trackedProducts: '{{count}} products · {{period}}',
  period3m: '3M',
  period6m: '6M',
  period12m: '12M',
  notEnoughData: 'Scan a few receipts to see your inflation',
  scanReceiptCta: 'Scan Receipt',
  storeComparison: 'Store comparison',
  priceHistoryChart: 'Price history',
  cheapestStore: 'Cheapest',
  manageProducts: 'Manage products',
  renameProduct: 'Rename product',
  mergeProducts: 'Merge products',
  mergeInto: 'Merge into',
  merged: 'Merged',
  deleteAlias: 'Reset to original name',
  noProducts: 'No tracked products yet',
},
```

Also add to `settingsNav` object (for the reference hub row):
```ts
products: 'Products',
productsDesc: 'Manage product names and groups',
```

- [ ] **Step 2: Add to `pl.ts`**

```ts
priceHistory: {
  title: 'Twoja inflacja',
  headline: '+{{pct}}%',
  trackedProducts: '{{count}} produktów · {{period}}',
  period3m: '3M',
  period6m: '6M',
  period12m: '12M',
  notEnoughData: 'Zeskanuj kilka paragonów, aby zobaczyć swoją inflację',
  scanReceiptCta: 'Skanuj paragon',
  storeComparison: 'Porównanie sklepów',
  priceHistoryChart: 'Historia cen',
  cheapestStore: 'Najtaniej',
  manageProducts: 'Zarządzaj produktami',
  renameProduct: 'Zmień nazwę produktu',
  mergeProducts: 'Scal produkty',
  mergeInto: 'Scal w',
  merged: 'Scalono',
  deleteAlias: 'Przywróć oryginalną nazwę',
  noProducts: 'Brak śledzonych produktów',
},
```
`settingsNav.products: 'Produkty'`, `settingsNav.productsDesc: 'Zarządzaj nazwami i grupami produktów'`

- [ ] **Step 3: Add to `de.ts`**

```ts
priceHistory: {
  title: 'Deine Inflation',
  headline: '+{{pct}}%',
  trackedProducts: '{{count}} Produkte · {{period}}',
  period3m: '3M',
  period6m: '6M',
  period12m: '12M',
  notEnoughData: 'Scanne einige Belege, um deine Inflation zu sehen',
  scanReceiptCta: 'Beleg scannen',
  storeComparison: 'Filialvergleich',
  priceHistoryChart: 'Preisverlauf',
  cheapestStore: 'Günstigste',
  manageProducts: 'Produkte verwalten',
  renameProduct: 'Produkt umbenennen',
  mergeProducts: 'Produkte zusammenführen',
  mergeInto: 'Zusammenführen in',
  merged: 'Zusammengeführt',
  deleteAlias: 'Originalname wiederherstellen',
  noProducts: 'Noch keine verfolgten Produkte',
},
```
`settingsNav.products: 'Produkte'`, `settingsNav.productsDesc: 'Produktnamen und Gruppen verwalten'`

- [ ] **Step 4: Add to `es.ts`**

```ts
priceHistory: {
  title: 'Tu inflación',
  headline: '+{{pct}}%',
  trackedProducts: '{{count}} productos · {{period}}',
  period3m: '3M',
  period6m: '6M',
  period12m: '12M',
  notEnoughData: 'Escanea algunos recibos para ver tu inflación',
  scanReceiptCta: 'Escanear recibo',
  storeComparison: 'Comparación de tiendas',
  priceHistoryChart: 'Historial de precios',
  cheapestStore: 'Más barato',
  manageProducts: 'Gestionar productos',
  renameProduct: 'Renombrar producto',
  mergeProducts: 'Combinar productos',
  mergeInto: 'Combinar en',
  merged: 'Combinado',
  deleteAlias: 'Restablecer nombre original',
  noProducts: 'No hay productos rastreados',
},
```
`settingsNav.products: 'Productos'`, `settingsNav.productsDesc: 'Gestionar nombres y grupos de productos'`

- [ ] **Step 5: Add to `fr.ts`**

```ts
priceHistory: {
  title: 'Votre inflation',
  headline: '+{{pct}}%',
  trackedProducts: '{{count}} produits · {{period}}',
  period3m: '3M',
  period6m: '6M',
  period12m: '12M',
  notEnoughData: 'Scannez quelques reçus pour voir votre inflation',
  scanReceiptCta: 'Scanner un reçu',
  storeComparison: 'Comparaison des magasins',
  priceHistoryChart: 'Historique des prix',
  cheapestStore: 'Moins cher',
  manageProducts: 'Gérer les produits',
  renameProduct: 'Renommer le produit',
  mergeProducts: 'Fusionner les produits',
  mergeInto: 'Fusionner dans',
  merged: 'Fusionné',
  deleteAlias: 'Rétablir le nom original',
  noProducts: 'Aucun produit suivi',
},
```
`settingsNav.products: 'Produits'`, `settingsNav.productsDesc: 'Gérer les noms et groupes de produits'`

- [ ] **Step 6: Add to `ru.ts`**

```ts
priceHistory: {
  title: 'Ваша инфляция',
  headline: '+{{pct}}%',
  trackedProducts: '{{count}} товаров · {{period}}',
  period3m: '3М',
  period6m: '6М',
  period12m: '12М',
  notEnoughData: 'Отсканируйте несколько чеков, чтобы увидеть вашу инфляцию',
  scanReceiptCta: 'Сканировать чек',
  storeComparison: 'Сравнение магазинов',
  priceHistoryChart: 'История цен',
  cheapestStore: 'Дешевле всего',
  manageProducts: 'Управление товарами',
  renameProduct: 'Переименовать товар',
  mergeProducts: 'Объединить товары',
  mergeInto: 'Объединить в',
  merged: 'Объединено',
  deleteAlias: 'Вернуть исходное название',
  noProducts: 'Нет отслеживаемых товаров',
},
```
`settingsNav.products: 'Товары'`, `settingsNav.productsDesc: 'Управление названиями и группами товаров'`

- [ ] **Step 7: Add to `ua.ts`**

```ts
priceHistory: {
  title: 'Ваша інфляція',
  headline: '+{{pct}}%',
  trackedProducts: '{{count}} товарів · {{period}}',
  period3m: '3М',
  period6m: '6М',
  period12m: '12М',
  notEnoughData: 'Відскануйте кілька чеків, щоб побачити вашу інфляцію',
  scanReceiptCta: 'Сканувати чек',
  storeComparison: 'Порівняння магазинів',
  priceHistoryChart: 'Історія цін',
  cheapestStore: 'Найдешевше',
  manageProducts: 'Управління товарами',
  renameProduct: 'Перейменувати товар',
  mergeProducts: "Об'єднати товари",
  mergeInto: "Об'єднати в",
  merged: "Об'єднано",
  deleteAlias: 'Відновити оригінальну назву',
  noProducts: 'Немає відстежуваних товарів',
},
```
`settingsNav.products: 'Товари'`, `settingsNav.productsDesc: 'Управління назвами та групами товарів'`

- [ ] **Step 8: Add to `be.ts`**

```ts
priceHistory: {
  title: 'Ваша інфляцыя',
  headline: '+{{pct}}%',
  trackedProducts: '{{count}} тавараў · {{period}}',
  period3m: '3М',
  period6m: '6М',
  period12m: '12М',
  notEnoughData: 'Адсканіруйце некалькі чэкаў, каб убачыць сваю інфляцыю',
  scanReceiptCta: 'Сканаваць чэк',
  storeComparison: 'Параўнанне крам',
  priceHistoryChart: 'Гісторыя цэн',
  cheapestStore: 'Найдашэўшае',
  manageProducts: 'Кіраванне таварамі',
  renameProduct: 'Перайменаваць тавар',
  mergeProducts: "Аб'яднаць тавары",
  mergeInto: "Аб'яднаць у",
  merged: "Аб'яднана",
  deleteAlias: 'Аднавіць арыгінальную назву',
  noProducts: 'Няма адсочваемых тавараў',
},
```
`settingsNav.products: 'Тавары'`, `settingsNav.productsDesc: 'Кіраванне назвамі і групамі тавараў'`

- [ ] **Step 9: Add to `nl.ts`**

```ts
priceHistory: {
  title: 'Jouw inflatie',
  headline: '+{{pct}}%',
  trackedProducts: '{{count}} producten · {{period}}',
  period3m: '3M',
  period6m: '6M',
  period12m: '12M',
  notEnoughData: 'Scan een paar bonnetjes om jouw inflatie te zien',
  scanReceiptCta: 'Bon scannen',
  storeComparison: 'Winkelvergelijking',
  priceHistoryChart: 'Prijsgeschiedenis',
  cheapestStore: 'Goedkoopste',
  manageProducts: 'Producten beheren',
  renameProduct: 'Product hernoemen',
  mergeProducts: 'Producten samenvoegen',
  mergeInto: 'Samenvoegen in',
  merged: 'Samengevoegd',
  deleteAlias: 'Originele naam herstellen',
  noProducts: 'Nog geen gevolgde producten',
},
```
`settingsNav.products: 'Producten'`, `settingsNav.productsDesc: 'Productnamen en groepen beheren'`

- [ ] **Step 10: Commit**

```bash
git add apps/mobile/src/i18n/locales/
git commit -m "feat(i18n): add priceHistory namespace across all 9 locales"
```

---

### Task 7: InflationIndexSection Component + Analytics Tab

**Files:**
- Create: `apps/mobile/src/components/analytics/InflationIndexSection.tsx`
- Modify: `apps/mobile/app/(tabs)/analytics.tsx`

**Interfaces:**
- Consumes: `usePriceHistoryStore`, `InteractiveLineChart` from `@/components/interactive-charts`, `useTranslation`, `useTheme`, `useStyles`
- Produces: `InflationIndexSection` React component

- [ ] **Step 1: Create `InflationIndexSection.tsx`**

```tsx
// apps/mobile/src/components/analytics/InflationIndexSection.tsx
import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView, Pressable,
  TextInput, StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { usePriceHistoryStore } from '@/stores/priceHistoryStore';
import { InteractiveLineChart } from '@/components/interactive-charts';
import type { PriceHistoryProduct } from '@budget/shared-types';

type Period = '3m' | '6m' | '12m';

export function InflationIndexSection() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { history, isLoading, selectedPeriod, loadPriceHistory, upsertAlias } = usePriceHistoryStore();
  const [showAll, setShowAll] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<PriceHistoryProduct | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  const handlePeriodChange = useCallback(
    (p: Period) => { if (p !== selectedPeriod) loadPriceHistory(p); },
    [selectedPeriod, loadPriceHistory],
  );

  const handleRename = useCallback(async () => {
    if (!selectedProduct || !renameValue.trim()) return;
    setIsRenaming(true);
    try {
      await upsertAlias(selectedProduct.canonicalName, renameValue.trim());
    } finally {
      setIsRenaming(false);
      setSelectedProduct(null);
    }
  }, [selectedProduct, renameValue, upsertAlias]);

  if (!history && !isLoading) return null;

  const periods: Period[] = ['3m', '6m', '12m'];
  const displayProducts = showAll ? (history?.products ?? []) : (history?.products ?? []).slice(0, 3);
  const remaining = (history?.products.length ?? 0) - 3;

  // Empty state
  if (!isLoading && (history === null || history.productCount === 0)) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('priceHistory.title')}</Text>
        <View style={styles.card}>
          <Text style={styles.emptyText}>{t('priceHistory.notEnoughData')}</Text>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => router.push('/expense/receipt')}
          >
            <Text style={styles.ctaText}>{t('priceHistory.scanReceiptCta')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      {/* Header + period chips */}
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>{t('priceHistory.title')}</Text>
        <View style={styles.periodRow}>
          {periods.map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.periodChip, selectedPeriod === p && styles.periodChipActive]}
              onPress={() => handlePeriodChange(p)}
            >
              <Text style={[styles.periodChipText, selectedPeriod === p && styles.periodChipTextActive]}>
                {t(`priceHistory.period${p.toUpperCase().replace('M', 'm') as '3m' | '6m' | '12m'}` as any)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        {/* Headline */}
        {history && history.inflationIndex !== null && (
          <>
            <Text style={[styles.headline, { color: history.inflationIndex > 0 ? theme.colors.error : theme.colors.success }]}>
              {history.inflationIndex > 0 ? '+' : ''}{history.inflationIndex}%
            </Text>
            <Text style={styles.subline}>
              {t('priceHistory.trackedProducts', {
                count: history.productCount,
                period: t(`priceHistory.period${history.period.replace('m', 'M')}` as any),
              })}
            </Text>
          </>
        )}

        {/* Product list */}
        {displayProducts.map((product) => (
          <TouchableOpacity
            key={product.canonicalName}
            style={styles.productRow}
            onPress={() => { setSelectedProduct(product); setRenameValue(product.canonicalName); }}
          >
            <Text style={styles.productName} numberOfLines={1}>{product.canonicalName}</Text>
            <View style={styles.productRight}>
              <Text style={[
                styles.productPct,
                { color: product.priceChangePct > 0 ? theme.colors.error : theme.colors.success },
              ]}>
                {product.priceChangePct > 0 ? '+' : ''}{product.priceChangePct}%
              </Text>
              <Text style={styles.productPrice}>
                {product.currentAvgPrice.toFixed(2)} {product.currency}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        {!showAll && remaining > 0 && (
          <TouchableOpacity onPress={() => setShowAll(true)} style={styles.showMore}>
            <Ionicons name="chevron-down" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.showMoreText}>{remaining} more</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.manageLink}
          onPress={() => router.push('/settings/products' as any)}
        >
          <Text style={styles.manageLinkText}>{t('priceHistory.manageProducts')}</Text>
        </TouchableOpacity>
      </View>

      {/* Product detail bottom sheet */}
      <Modal
        visible={selectedProduct !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedProduct(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSelectedProduct(null)} />
        <View style={styles.sheet}>
          {selectedProduct && (
            <ScrollView>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>{selectedProduct.canonicalName}</Text>

              {/* Line chart */}
              <Text style={styles.sheetSubtitle}>{t('priceHistory.priceHistoryChart')}</Text>
              <InteractiveLineChart
                data={selectedProduct.pricePoints.map((p) => ({ label: p.date, value: p.price }))}
                height={180}
                color={theme.colors.primary}
              />

              {/* Store comparison */}
              <Text style={styles.sheetSubtitle}>{t('priceHistory.storeComparison')}</Text>
              {selectedProduct.stores.map((store, i) => (
                <View key={store.merchantName} style={styles.storeRow}>
                  {i === 0 && (
                    <View style={styles.cheapestBadge}>
                      <Text style={styles.cheapestText}>{t('priceHistory.cheapestStore')}</Text>
                    </View>
                  )}
                  <Text style={styles.storeName}>{store.merchantName}</Text>
                  <Text style={styles.storePrice}>
                    {store.latestPrice.toFixed(2)} {selectedProduct.currency}
                  </Text>
                </View>
              ))}

              {/* Rename */}
              <Text style={styles.sheetSubtitle}>{t('priceHistory.renameProduct')}</Text>
              <TextInput
                style={styles.renameInput}
                value={renameValue}
                onChangeText={setRenameValue}
                placeholder={selectedProduct.canonicalName}
              />
              <TouchableOpacity
                style={[styles.ctaButton, isRenaming && { opacity: 0.6 }]}
                onPress={handleRename}
                disabled={isRenaming}
              >
                <Text style={styles.ctaText}>{t('priceHistory.renameProduct')}</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  section: { marginBottom: theme.spacing[4] },
  header: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, marginBottom: theme.spacing[2] },
  sectionTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary },
  periodRow: { flexDirection: 'row' as const, gap: theme.spacing[1] },
  periodChip: { paddingHorizontal: theme.spacing[2], paddingVertical: theme.spacing[1], borderRadius: theme.borderRadius.full, backgroundColor: theme.colors.surface },
  periodChipActive: { backgroundColor: theme.colors.primary },
  periodChipText: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary },
  periodChipTextActive: { color: '#fff' },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, padding: theme.spacing[4] },
  headline: { ...theme.textStyles.displayLg, textAlign: 'center' as const, marginBottom: theme.spacing[1] },
  subline: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, textAlign: 'center' as const, marginBottom: theme.spacing[3] },
  emptyText: { ...theme.textStyles.body, color: theme.colors.textSecondary, textAlign: 'center' as const, marginBottom: theme.spacing[3] },
  productRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, paddingVertical: theme.spacing[2] },
  productName: { ...theme.textStyles.body, color: theme.colors.textPrimary, flex: 1, marginRight: theme.spacing[2] },
  productRight: { alignItems: 'flex-end' as const },
  productPct: { ...theme.textStyles.bodyMedium },
  productPrice: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary },
  showMore: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingTop: theme.spacing[2], gap: 4 },
  showMoreText: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary },
  manageLink: { marginTop: theme.spacing[3], alignItems: 'center' as const },
  manageLinkText: { ...theme.textStyles.bodySm, color: theme.colors.primary },
  ctaButton: { backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.md, padding: theme.spacing[3], alignItems: 'center' as const },
  ctaText: { ...theme.textStyles.bodyMedium, color: '#fff' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: theme.colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: theme.spacing[4], maxHeight: '80%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.divider, alignSelf: 'center' as const, marginBottom: theme.spacing[4] },
  sheetTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[3] },
  sheetSubtitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textSecondary, marginTop: theme.spacing[3], marginBottom: theme.spacing[2] },
  storeRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, paddingVertical: theme.spacing[2] },
  cheapestBadge: { backgroundColor: theme.colors.success + '20', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, marginRight: theme.spacing[2] },
  cheapestText: { ...theme.textStyles.caption, color: theme.colors.success },
  storeName: { ...theme.textStyles.body, color: theme.colors.textPrimary, flex: 1 },
  storePrice: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary },
  renameInput: { borderWidth: 1, borderColor: theme.colors.divider, borderRadius: theme.borderRadius.md, padding: theme.spacing[3], ...theme.textStyles.body, color: theme.colors.textPrimary, marginBottom: theme.spacing[3] },
});
```

> Note: If `InteractiveLineChart` requires a different prop shape, adapt to match the existing component's interface. Check `apps/mobile/src/components/interactive-charts/InteractiveLineChart.tsx` for exact props.

- [ ] **Step 2: Wire into `(tabs)/analytics.tsx`**

In `apps/mobile/app/(tabs)/analytics.tsx`, import and insert `InflationIndexSection`:

```tsx
import { InflationIndexSection } from '@/components/analytics/InflationIndexSection';
```

Add inside the return JSX, between `<AiInsightsSection ... />` and `<SpendingTrendChart ... />`:

```tsx
<InflationIndexSection />
```

Also add to the screen's `useFocusEffect` or load trigger (wherever other analytics sections load their data):

```tsx
usePriceHistoryStore.getState().loadPriceHistory();
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/analytics/InflationIndexSection.tsx \
        apps/mobile/app/\(tabs\)/analytics.tsx
git commit -m "feat(mobile): add InflationIndexSection to Analytics tab"
```

---

### Task 8: Products Management Screen + Reference Hub Entry

**Files:**
- Create: `apps/mobile/app/settings/products.tsx`
- Modify: `apps/mobile/app/settings/reference.tsx`
- Modify: `apps/mobile/app/_layout.tsx`

**Interfaces:**
- Consumes: `usePriceHistoryStore.loadProducts()`, `upsertAlias()`, `mergeProducts()`, `deleteAlias()`
- Produces: `app/settings/products` route

- [ ] **Step 1: Create `app/settings/products.tsx`**

```tsx
// apps/mobile/app/settings/products.tsx
import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, FlatList,
  TextInput, Alert,
} from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { usePriceHistoryStore } from '@/stores/priceHistoryStore';
import { useAccountStore } from '@/stores/accountStore';
import type { ProductListItem } from '@budget/shared-types';

export default function ProductsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { products, loadProducts, upsertAlias, mergeProducts, deleteAlias } = usePriceHistoryStore();
  const canEdit = useAccountStore((s) => s.canEdit());

  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedRawNames, setSelectedRawNames] = useState<Set<string>>(new Set());
  const [showRename, setShowRename] = useState<ProductListItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showMerge, setShowMerge] = useState(false);
  const [mergeTarget, setMergeTarget] = useState('');

  useEffect(() => { loadProducts(); }, []);

  const toggleSelect = useCallback((rawName: string) => {
    setSelectedRawNames((prev) => {
      const next = new Set(prev);
      next.has(rawName) ? next.delete(rawName) : next.add(rawName);
      return next;
    });
  }, []);

  const handleRename = useCallback(async () => {
    if (!showRename || !renameValue.trim()) return;
    await upsertAlias(showRename.rawName, renameValue.trim());
    setShowRename(null);
  }, [showRename, renameValue, upsertAlias]);

  const handleMerge = useCallback(async () => {
    if (selectedRawNames.size < 2 || !mergeTarget.trim()) return;
    await mergeProducts([...selectedRawNames], mergeTarget.trim());
    setIsMultiSelect(false);
    setSelectedRawNames(new Set());
    setShowMerge(false);
  }, [selectedRawNames, mergeTarget, mergeProducts]);

  const handleDeleteAlias = useCallback(async (rawName: string) => {
    Alert.alert(t('priceHistory.deleteAlias'), rawName, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), onPress: () => deleteAlias(rawName) },
    ]);
  }, [deleteAlias, t]);

  return (
    <>
      <Stack.Screen options={{ title: t('priceHistory.manageProducts') }} />
      <SafeAreaView style={styles.container} edges={[]}>
        {/* Multi-select header */}
        {isMultiSelect && (
          <View style={styles.multiHeader}>
            <Text style={styles.multiCount}>{selectedRawNames.size} {t('common.selected')}</Text>
            <View style={styles.multiActions}>
              {selectedRawNames.size >= 2 && (
                <TouchableOpacity onPress={() => { setMergeTarget(''); setShowMerge(true); }}>
                  <Text style={styles.mergeBtn}>{t('priceHistory.mergeProducts')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => { setIsMultiSelect(false); setSelectedRawNames(new Set()); }}>
                <Text style={styles.cancelBtn}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <FlatList
          data={products}
          keyExtractor={(item) => item.rawName}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{t('priceHistory.noProducts')}</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => isMultiSelect ? toggleSelect(item.rawName) : (canEdit ? (setShowRename(item), setRenameValue(item.canonicalName)) : null)}
              onLongPress={() => canEdit && (setIsMultiSelect(true), toggleSelect(item.rawName))}
              activeOpacity={0.7}
            >
              {isMultiSelect && (
                <Ionicons
                  name={selectedRawNames.has(item.rawName) ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={theme.colors.primary}
                  style={{ marginRight: 8 }}
                />
              )}
              <View style={styles.rowContent}>
                <Text style={styles.canonicalName}>{item.canonicalName}</Text>
                {item.rawName !== item.canonicalName && (
                  <Text style={styles.rawName}>{item.rawName}</Text>
                )}
              </View>
              <Text style={styles.count}>{item.purchaseCount}×</Text>
              {canEdit && !isMultiSelect && item.rawName !== item.canonicalName && (
                <TouchableOpacity onPress={() => handleDeleteAlias(item.rawName)}>
                  <Ionicons name="refresh-outline" size={18} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
        />

        {/* Rename bottom sheet (simple modal) */}
        {showRename && (
          <View style={styles.inlineSheet}>
            <Text style={styles.sheetTitle}>{t('priceHistory.renameProduct')}</Text>
            <TextInput
              style={styles.input}
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
            />
            <View style={styles.sheetButtons}>
              <TouchableOpacity onPress={() => setShowRename(null)}>
                <Text style={styles.cancelBtn}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleRename}>
                <Text style={styles.saveBtn}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Merge modal */}
        {showMerge && (
          <View style={styles.inlineSheet}>
            <Text style={styles.sheetTitle}>
              {t('priceHistory.mergeInto')} ({selectedRawNames.size})
            </Text>
            <TextInput
              style={styles.input}
              value={mergeTarget}
              onChangeText={setMergeTarget}
              placeholder={t('priceHistory.mergeInto')}
              autoFocus
            />
            <View style={styles.sheetButtons}>
              <TouchableOpacity onPress={() => setShowMerge(false)}>
                <Text style={styles.cancelBtn}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleMerge}>
                <Text style={styles.saveBtn}>{t('priceHistory.merged')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>
    </>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  list: { padding: theme.spacing[4] },
  multiHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, padding: theme.spacing[3], backgroundColor: theme.colors.surface },
  multiCount: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary },
  multiActions: { flexDirection: 'row' as const, gap: theme.spacing[3] },
  mergeBtn: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
  cancelBtn: { ...theme.textStyles.body, color: theme.colors.textSecondary },
  saveBtn: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: theme.spacing[3], borderBottomWidth: 1, borderBottomColor: theme.colors.divider },
  rowContent: { flex: 1 },
  canonicalName: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  rawName: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary },
  count: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, marginRight: theme.spacing[2] },
  empty: { ...theme.textStyles.body, color: theme.colors.textSecondary, textAlign: 'center' as const, marginTop: theme.spacing[8] },
  inlineSheet: { position: 'absolute' as const, bottom: 0, left: 0, right: 0, backgroundColor: theme.colors.surface, padding: theme.spacing[4], borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  sheetTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[3] },
  input: { borderWidth: 1, borderColor: theme.colors.divider, borderRadius: theme.borderRadius.md, padding: theme.spacing[3], ...theme.textStyles.body, color: theme.colors.textPrimary, marginBottom: theme.spacing[3] },
  sheetButtons: { flexDirection: 'row' as const, justifyContent: 'flex-end' as const, gap: theme.spacing[4] },
});
```

- [ ] **Step 2: Add Products row in `settings/reference.tsx`**

In `apps/mobile/app/settings/reference.tsx`, add to the `rows` array (after the Merchants entry):

```ts
{
  icon: 'bar-chart-outline' as IconName,
  label: t('settingsNav.products'),
  description: t('settingsNav.productsDesc'),
  route: '/settings/products',
},
```

- [ ] **Step 3: Register route in `app/_layout.tsx`**

In `apps/mobile/app/_layout.tsx`, inside the settings Stack group (where other settings screens are registered), add:

```tsx
<Stack.Screen name="settings/products" options={{ title: '', headerShown: true }} />
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/settings/products.tsx \
        apps/mobile/app/settings/reference.tsx \
        apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): add Products management screen and reference hub entry"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| `canonical_name` on `expense_items` | Task 2 (Prisma) + Task 5 (SQLite ALTER) |
| `product_aliases` table | Task 2 |
| OCR prompt extended with `canonicalName` | Task 3 |
| Fallback when LLM returns empty canonicalName | Task 3 |
| `canonical_name` persisted via ExpensesService + SyncService | Task 3, Step 5 |
| `GET /price-history?period=` | Task 4 |
| `GET /price-history/products` | Task 4 |
| `PATCH /price-history/products/alias` | Task 4 |
| `DELETE /price-history/products/alias/:rawName` | Task 4 |
| `POST /price-history/products/merge` | Task 4 |
| Laspeyres weighted inflation formula | Task 4 (service) |
| `productCount < 3 → inflationIndex = null` | Task 4 (service + test) |
| Redis cache `ph:{accountId}:{period}` TTL 300s | Task 4 (service) |
| Majority currency resolution with alphabetic tie-break | Task 4 (service + test) |
| Route order: static before dynamic | Task 4 (controller) |
| ViewerBlockGuard on write endpoints | Task 4 (controller) |
| Free tier (no `@RequireTier`) | Task 4 (controller — no guard added) |
| `priceHistoryStore` in-memory Zustand | Task 5 |
| `priceHistory.api.ts` | Task 5 |
| Mobile SQLite migration for `canonical_name` | Task 5 |
| All 9 locale files | Task 6 |
| `InflationIndexSection` in Analytics tab | Task 7 |
| Period chips 3M/6M/12M | Task 7 |
| Product list (top 3 + show more) | Task 7 |
| Product detail bottom sheet with line chart | Task 7 |
| Store comparison sorted cheapest-first | Task 7 |
| Inline rename from bottom sheet | Task 7 |
| Empty state with scan CTA | Task 7 |
| `app/settings/products.tsx` management screen | Task 8 |
| Multi-select + merge | Task 8 |
| Rename single product | Task 8 |
| Delete alias (reset to LLM name) | Task 8 |
| `settings/reference.tsx` Products entry | Task 8 |
| `_layout.tsx` route registration | Task 8 |
| `settingsNav.products/productsDesc` i18n keys | Task 6 |

All spec requirements have a corresponding task. ✅

### Type consistency check

- `StoreLatestPrice` defined in Task 1, used in `PriceHistoryProduct.stores` in Task 1, consumed in Task 4 service and Task 7 component ✅
- `PriceHistoryResponse` defined Task 1, returned by Task 4, stored in Task 5 store ✅
- `ProductListItem` defined Task 1, returned by `listProducts()` in Task 4, consumed in Task 5 store and Task 8 screen ✅
- `UpsertAliasDto` / `MergeProductsDto` defined in Task 4 `dto/index.ts`, consumed in Task 4 controller and Task 5 api client ✅
- `usePriceHistoryStore` actions (`loadPriceHistory`, `loadProducts`, `upsertAlias`, `mergeProducts`, `deleteAlias`) defined Task 5, consumed in Task 7 and Task 8 ✅
- `resolvedName` (internal `RawItemRow` field) used consistently through Task 4 service ✅
