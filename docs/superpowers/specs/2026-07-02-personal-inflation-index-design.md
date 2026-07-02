# Personal Inflation Index — Design Spec

**Date:** 2026-07-02  
**Feature:** Personal price tracker built from receipt line items  
**Tier:** Free (all users)

---

## Overview

The app parses receipt line items (OCR already extracts `items[]`) and builds a price history per product per store. Users see:

- A **personal inflation index**: "your inflation over 6 months: +11.4% vs official ~4%"
- **Per-product history**: "Mleko Łaciate: 3.49 → 4.29 zł (+23%)"
- **Store comparison**: "Biedronka 3.49 · Lidl 3.19 · Kaufland 3.89"

The feature is viral (shareable screenshots) and unique to apps that collect itemised receipts. It lives as a new section in the Analytics tab.

---

## Data Model

### 1. New column: `expense_items.canonical_name`

```prisma
model ExpenseItem {
  // ... existing fields ...
  canonicalName String? @map("canonical_name")  // populated by OCR, null for manual items
}
```

Migration: `20260702000000_add_expense_item_canonical_name`

Mobile SQLite: `ALTER TABLE expense_items ADD COLUMN canonical_name TEXT` in `client.native.ts` init block (same pattern as other additive columns).

### 2. New table: `product_aliases`

```prisma
model ProductAlias {
  id            String   @id @default(uuid())
  accountId     String   @map("account_id")
  rawName       String   @map("raw_name")       // LLM-returned canonical_name (normalised key)
  canonicalName String   @map("canonical_name") // user's preferred display name
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@unique([accountId, rawName])
  @@index([accountId])
  @@map("product_aliases")
}
```

Migration: `20260702000001_add_product_aliases`

### Name resolution at query time

```sql
COALESCE(pa.canonical_name, ei.canonical_name) AS resolved_name
```

If the user created an alias for a `rawName` → use `alias.canonical_name`; otherwise fall back to `expense_items.canonical_name`. Merging two products = both `rawName`s get the same `canonicalName`.

---

## OCR Pipeline Changes

**File:** `apps/api/src/modules/ai/services/ocr.service.ts`

Extend `ReceiptItem` with a new field:

```ts
interface ReceiptItem {
  description: string
  canonicalName: string   // NEW: short normalised name without weight/volume/%
  quantity: number
  unitPrice: number
  totalPrice: number
}
```

**Prompt addition** (appended to the existing items extraction instruction):

> For each item, also return `canonicalName`: a short, clean product name in title case, without quantity, weight, volume, percentage, packaging type, or store-specific codes. Examples: "MLEKO 3,2% ŁACIATE 1L 6SZT" → "Mleko Łaciate", "CHLEB RAZOWY WIEJSKI 500G" → "Chleb Razowy", "PIWO TYSKIE 0,5L 4,7%" → "Tyskie Piwo".

**Fallback:** if LLM returns empty/null `canonicalName`, take the first word of `description` that is ≥ 3 chars and not purely numeric.

**Cost impact:** ~100 extra output tokens per receipt scan. No additional API call.

**Write path:** `ExpensesService.create()` and `SyncService` already persist `ExpenseItem[]` rows. Add `canonicalName` to the `ExpenseItem` create/upsert payload — no logic change, just a new field.

---

## API Module: `price-history`

New module `apps/api/src/modules/price-history/` following the standard `module.ts / controller.ts / service.ts / dto/index.ts` structure.

All endpoints: `JwtAuthGuard + AccountContextGuard` (class-level).

### Endpoints

```
GET  /price-history?period=3m|6m|12m   (default: 6m)
     Returns PriceHistoryResponse

GET  /price-history/products
     Returns ProductListItem[]  (for management screen)

PATCH /price-history/products/alias          ← declared BEFORE /:rawName routes
      body: { rawName: string; canonicalName: string }
      ViewerBlockGuard
      → upsert product_aliases

DELETE /price-history/products/alias/:rawName
       ViewerBlockGuard
       → delete alias (resets to LLM name)

POST /price-history/products/merge
     body: { rawNames: string[]; canonicalName: string }
     ViewerBlockGuard
     → bulk upsert aliases (merge multiple variants into one name)
```

### Shared types (`packages/shared-types/src/dto/insights.ts`)

```ts
export interface StoreLatestPrice {
  merchantName: string
  latestPrice: number
  latestDate: string   // ISO date
}

export interface PriceHistoryProduct {
  canonicalName: string
  priceChangePct: number       // positive = more expensive, e.g. 23.0
  currentAvgPrice: number
  baseAvgPrice: number
  currency: string
  purchaseCount: number
  stores: StoreLatestPrice[]
  pricePoints: { date: string; price: number; merchant: string }[]
}

export interface PriceHistoryResponse {
  inflationIndex: number | null  // null when < 3 qualifying products
  period: '3m' | '6m' | '12m'
  productCount: number
  currency: string               // most-used currency in the dataset
  products: PriceHistoryProduct[]
}

export interface ProductListItem {
  rawName: string
  canonicalName: string          // alias or rawName if no alias
  purchaseCount: number
  lastSeen: string               // ISO date
}
```

### Inflation formula (`PriceHistoryService.computeInflationIndex`)

```
Qualifying products: canonical_name NOT NULL, ≥ 2 purchases on different dates,
                     at least 1 purchase in base period AND 1 in current period.

base period   = [now - period*2 .. now - period]
current period = [now - period .. now]

For each qualifying product i:
  baseAvgPrice_i    = AVG(unit_price) in base period
  currentAvgPrice_i = AVG(unit_price) in current period
  priceChangePct_i  = (currentAvgPrice_i - baseAvgPrice_i) / baseAvgPrice_i * 100
  weight_i          = baseAvgPrice_i × purchaseCount in base period   (expenditure weight)

inflationIndex = Σ(weight_i × priceChangePct_i) / Σ(weight_i)

If productCount < 3 → inflationIndex = null (not enough data)
```

Multi-currency: filter to the currency with the most `canonical_name`-bearing `expense_item` rows in the account. Tie-break: alphabetical. If a product has prices in multiple currencies, only rows in that majority currency are used for that product.

Redis cache: `ph:{accountId}:{period}` TTL 300s (same pattern as safe-to-spend). Three keys per account (one per period); expire naturally — no explicit invalidation needed at this scale.

---

## Mobile UI

### Analytics tab section

**New component:** `src/components/analytics/InflationIndexSection.tsx`

Inserted in `(tabs)/analytics.tsx` between `AiInsightsSection` and `SpendingTrendChart`.

**Layout (sufficient data):**

```
┌─────────────────────────────────────────┐
│  Твоя инфляция           [3M] [6M] [12M] │
│                                          │
│           +11.4%                         │
│    12 товаров · 6 месяцев                │
│                                          │
│  Mleko Łaciate       +23.0%   4.29 zł    │
│  Chleb Razowy         +8.5%   3.20 zł    │
│  Masło Ekstra        +31.2%   8.99 zł    │
│  ▾ Ещё 9 товаров                         │
└─────────────────────────────────────────┘
```

Tapping a product row → bottom sheet:
- `InteractiveLineChart` — price over time (`pricePoints[]`)
- Store comparison table: merchant name + latest price, sorted cheapest-first
- "Переименовать" button → inline rename (calls `PATCH /price-history/products/alias`)

**Empty state (< 3 qualifying products):**
```
"Отсканируйте несколько чеков, чтобы увидеть свою инфляцию"
[Сканировать чек]   ← routes to expense/receipt.tsx
```

**Store:** `priceHistoryStore.ts` — in-memory (server-only, same pattern as `familyFeedStore` and `tripStore`). Actions: `loadPriceHistory(period)`, `loadProducts()`, `upsertAlias(rawName, canonicalName)`, `mergeProducts(rawNames, canonicalName)`, `deleteAlias(rawName)`. Shared accounts: all members fetch from the same server data — no local divergence.

**API client:** `priceHistory.api.ts` — methods `getPriceHistory(period)`, `getProducts()`, `upsertAlias(body)`, `deleteAlias(rawName)`, `mergeProducts(body)`.

### Product management screen

**New screen:** `app/settings/products.tsx`

Registered in `app/_layout.tsx` under settings Stack. Linked from `app/settings/reference.tsx` (Reference Data hub, between Merchants and Tags).

Follows the same pattern as `settings/merchants.tsx`:
- List of products with `canonicalName` + purchase count
- Multi-select mode (long-press): checkboxes + bottom Merge bar
- Merge modal: editable canonical target name + move count
- Tap single row → rename bottom sheet
- `canEdit` guard on all write affordances

---

## i18n

9 locales (`en`, `de`, `es`, `fr`, `pl`, `ru`, `ua`, `be`, `nl`).  
New key namespace: `priceHistory.*`

| Key | EN value |
|---|---|
| `title` | "Your Inflation" |
| `headline` | "+{{pct}}%" |
| `trackedProducts` | "{{count}} products · {{period}}" |
| `period3m` | "3M" |
| `period6m` | "6M" |
| `period12m` | "12M" |
| `notEnoughData` | "Scan a few receipts to see your inflation" |
| `scanReceiptCta` | "Scan Receipt" |
| `storeComparison` | "Store comparison" |
| `priceHistoryChart` | "Price history" |
| `cheapestStore` | "Cheapest" |
| `manageProducts` | "Manage products" |
| `renameProduct` | "Rename product" |
| `mergeProducts` | "Merge products" |
| `mergeInto` | "Merge into" |
| `merged` | "Merged" |
| `deleteAlias` | "Reset to original name" |
| `noProducts` | "No tracked products yet" |

---

## Implementation Order

Following the standard dependency order:

1. `packages/shared-types` — add `PriceHistoryResponse`, `PriceHistoryProduct`, `ProductListItem` DTOs
2. Prisma migration — `canonical_name` on `expense_items` + `product_aliases` table
3. `apps/api` — OCR prompt extension + `ExpenseItem` write path + `price-history` module (5 endpoints)
4. Mobile SQLite — `ALTER TABLE expense_items ADD COLUMN canonical_name TEXT`
5. Mobile stores — `priceHistoryStore.ts` + `priceHistory.api.ts`
6. Mobile UI — `InflationIndexSection.tsx` + product bottom sheet + `app/settings/products.tsx`
7. i18n — all 9 locales

---

## Out of Scope (Phase 2)

- Inflation widget on the home screen
- Push notification: "Молоко подорожало на 15%"
- Export / share as image
- Cross-account product catalog (global canonical names across accounts)
- PDF receipt items parsing (currently image-only)
