# Inflation Shield — Realized-Savings Tracking (Plan 2 of N) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `InflationShieldResponse.savedSoFar` real — persist each surfaced stock-up recommendation, detect when the user acts on it (buys the product), and credit the projected saving as realized, so the Shield can show "saved you X zł."

**Architecture:** A Prisma-only leaf service `InflationShieldTrackingService` in its own tiny module owns the new `inflation_shield_recommendations` table. `InflationShieldService.getShield` records surfaced recommendations (fire-and-forget) and sums realized savings into `savedSoFar`. `ExpensesService.create`'s existing post-create fire-and-forget block gains a `reconcilePurchase` call that marks a recommendation acted when a matching product is bought. All tracked amounts are stored in the base currency that was displayed at recommendation time; reconciliation matches on product + quantity + date (no cross-currency price comparison — the spec's chosen v1 proxy: "credit the projected saving as realized on the act").

**Tech Stack:** NestJS 10, Prisma 5 + PostgreSQL, Jest, TypeScript.

**Design spec:** `docs/superpowers/specs/2026-07-15-inflation-shield-design.md` (§3 "Realized-savings tracking"). Builds on Plan 1 (`docs/superpowers/plans/2026-07-15-inflation-shield-engine.md`, already implemented).

## Global Constraints

- **This is Plan 2 of N.** Scope = realized-savings tracking ONLY. OUT of scope (later plans): community-price boost, the daily cron + push notifications + `notifyInflationShield` preference, and mobile UI. Do NOT add a notification type, a cron, a `user.notify*` column, or touch community-price code.
- **The tracking service is Prisma-only** — inject only `PrismaService`. It must NOT import `InflationShieldService`, `PriceHistoryService`, or anything heavy (that is what keeps `ExpensesModule` able to import its module without a cycle).
- **All stored amounts are in BASE currency** (the display currency at recommendation time), stored with `currencyCode = that base`. Reconciliation matches a purchase to a recommendation on `canonicalName` (exact) + quantity + `date >= recommendedAt` — never by comparing prices across currencies.
- **Fire-and-forget, never throws into a caller.** `recordRecommendations` and `reconcilePurchase` are called with `void …catch(() => {})` from `getShield` / `ExpensesService.create`; a failure must never break shield reads or expense creation.
- **Idempotent recommendation snapshot:** at most one recommendation row per `(accountId, canonicalName, periodMonth)` where `periodMonth = "YYYY-MM"`; the FIRST recommendation of the month wins (stable snapshot). Enforced by a unique constraint + create-then-catch-P2002 (the ABA-313/316 pattern: catch P2002 OUTSIDE any `$transaction`).
- **`ShieldStatus` enum:** `active | acted | expired`. Plan 2 only ever sets `active` (create) and `acted` (reconcile). `expired` is defined for a later expiry cron but never written here.
- Commit messages ENGLISH. Tests: Jest, `npx jest <pattern>` from `apps/api/`. Migration: `npx prisma migrate dev --name <name>` then `npx prisma generate` from `apps/api/`.
- **Known pre-existing test state:** `price-history.service` has 2 date-flaky `computeInflationIndex` failures unrelated to this work — expect them, do not fix them.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `apps/api/prisma/schema.prisma` (modify) | `InflationShieldRecommendation` model + `ShieldStatus` enum + `Account` back-relation | 1 |
| `apps/api/prisma/migrations/…/migration.sql` (generated) | The DDL | 1 |
| `apps/api/src/modules/insights/inflation-shield-tracking.service.ts` (create) | Prisma-only: record / reconcile / read acted recs | 2–3 |
| `apps/api/src/modules/insights/inflation-shield-tracking.service.spec.ts` (create) | Unit tests (mocked Prisma) | 2–3 |
| `apps/api/src/modules/insights/inflation-shield-tracking.module.ts` (create) | Leaf module providing/exporting the tracking service | 2 |
| `apps/api/src/modules/insights/inflation-shield.service.ts` (modify) | Record recs + real `savedSoFar` | 4 |
| `apps/api/src/modules/insights/inflation-shield.service.spec.ts` (modify) | savedSoFar test | 4 |
| `apps/api/src/modules/insights/insights.module.ts` (modify) | Import the tracking module | 4 |
| `apps/api/src/modules/expenses/expenses.service.ts` (modify) | Reconcile hook in the post-create block | 5 |
| `apps/api/src/modules/expenses/expenses.module.ts` (modify) | Import the tracking module | 5 |
| `apps/api/src/modules/expenses/expenses.service.spec.ts` (modify) | Hook-fires test | 5 |

---

### Task 1: Migration — `inflation_shield_recommendations`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Generated: a new folder under `apps/api/prisma/migrations/`

**Interfaces:**
- Produces: Prisma model `InflationShieldRecommendation`, enum `ShieldStatus` (consumed by the tracking service in Task 2).

- [ ] **Step 1: Add the enum + model to schema.prisma**

Add the enum near the other enums (search for `enum ` to find the enum block), and the model near the other account-scoped models:

```prisma
enum ShieldStatus {
  active
  acted
  expired
}

model InflationShieldRecommendation {
  id              String       @id @default(uuid())
  accountId       String       @map("account_id")
  canonicalName   String       @map("canonical_name")
  periodMonth     String       @map("period_month") // "YYYY-MM"
  recommendedAt   DateTime     @default(now()) @map("recommended_at")
  priceAtRec      Decimal      @map("price_at_rec") @db.Decimal(12, 2)      // base currency
  projectedPrice  Decimal      @map("projected_price") @db.Decimal(12, 2)   // base currency
  qty             Int
  projectedSaving Decimal      @map("projected_saving") @db.Decimal(12, 2)  // base currency
  currencyCode    String       @map("currency_code")                        // base at rec time
  status          ShieldStatus @default(active)
  actedAt         DateTime?    @map("acted_at")
  realizedSaving  Decimal?     @map("realized_saving") @db.Decimal(12, 2)    // base currency
  account         Account      @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@unique([accountId, canonicalName, periodMonth])
  @@index([accountId, status])
  @@map("inflation_shield_recommendations")
}
```

- [ ] **Step 2: Add the back-relation on the `Account` model**

Prisma requires the reverse side. In the `model Account { … }` block, add a field alongside its other `[]` relations (e.g. next to `expenses` / `shoppingLists`):

```prisma
  inflationShieldRecommendations InflationShieldRecommendation[]
```

- [ ] **Step 3: Create the migration + regenerate the client**

Run from `apps/api/`:
```bash
npx prisma migrate dev --name add_inflation_shield_recommendations
npx prisma generate
```
Expected: a new migration folder is created and applied; `prisma generate` succeeds. The generated `migration.sql` should `CREATE TYPE "ShieldStatus"` and `CREATE TABLE "inflation_shield_recommendations"` with the unique index on `(account_id, canonical_name, period_month)` and the `(account_id, status)` index.

- [ ] **Step 4: Verify the client compiles against the new model**

Run: `cd apps/api && npx tsc --noEmit`
Expected: exit 0 (the generated types include `prisma.inflationShieldRecommendation`).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): inflation_shield_recommendations table for realized-savings tracking"
```

---

### Task 2: `InflationShieldTrackingService.recordRecommendations` + module

**Files:**
- Create: `apps/api/src/modules/insights/inflation-shield-tracking.service.ts`
- Create: `apps/api/src/modules/insights/inflation-shield-tracking.service.spec.ts`
- Create: `apps/api/src/modules/insights/inflation-shield-tracking.module.ts`

**Interfaces:**
- Consumes: Prisma model from Task 1.
- Produces: `InflationShieldTrackingService.recordRecommendations(accountId, items, now?)`, and `RecordableRecommendation` (the minimal item shape it needs). `InflationShieldTrackingModule` (exports the service).

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/insights/inflation-shield-tracking.service.spec.ts`:

```ts
import { Prisma } from '@prisma/client';
import { InflationShieldTrackingService } from './inflation-shield-tracking.service';

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' } as any);
}

describe('InflationShieldTrackingService.recordRecommendations', () => {
  const item = {
    canonicalName: 'Masło',
    currentPrice: 5.9,
    projectedPrice: 6.5,
    quantity: 2,
    projectedSaving: 0.6,
  };

  function make() {
    const prisma = {
      inflationShieldRecommendation: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    return { svc: new InflationShieldTrackingService(prisma as any), prisma };
  }

  it('creates one active recommendation per item with the base-currency snapshot', async () => {
    const { svc, prisma } = make();
    await svc.recordRecommendations('a1', [item], 'PLN', new Date('2026-07-16T00:00:00Z'));
    expect(prisma.inflationShieldRecommendation.create).toHaveBeenCalledTimes(1);
    const arg = prisma.inflationShieldRecommendation.create.mock.calls[0][0];
    expect(arg.data).toEqual(
      expect.objectContaining({
        accountId: 'a1',
        canonicalName: 'Masło',
        periodMonth: '2026-07',
        priceAtRec: 5.9,
        projectedPrice: 6.5,
        qty: 2,
        projectedSaving: 0.6,
        currencyCode: 'PLN',
      }),
    );
  });

  it('swallows a P2002 duplicate (already recorded this product this month)', async () => {
    const { svc, prisma } = make();
    (prisma.inflationShieldRecommendation.create as jest.Mock).mockRejectedValueOnce(p2002());
    await expect(svc.recordRecommendations('a1', [item], 'PLN', new Date('2026-07-16'))).resolves.toBeUndefined();
  });

  it('rethrows a non-P2002 error', async () => {
    const { svc, prisma } = make();
    (prisma.inflationShieldRecommendation.create as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    await expect(svc.recordRecommendations('a1', [item], 'PLN', new Date('2026-07-16'))).rejects.toThrow('db down');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest inflation-shield-tracking`
Expected: FAIL — "Cannot find module './inflation-shield-tracking.service'".

- [ ] **Step 3: Write the service**

Create `apps/api/src/modules/insights/inflation-shield-tracking.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

function isP2002(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/** Minimal shape recorded per surfaced shield item (amounts already in base currency). */
export interface RecordableRecommendation {
  canonicalName: string;
  currentPrice: number;    // base
  projectedPrice: number;  // base
  quantity: number;
  projectedSaving: number; // base
}

@Injectable()
export class InflationShieldTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  private periodMonth(now: Date): string {
    return now.toISOString().slice(0, 7); // "YYYY-MM"
  }

  /**
   * Persist an `active` recommendation snapshot per surfaced item. Idempotent per
   * (account, product, month): the FIRST recommendation of the month wins (stable
   * "we told you at price X" basis) — a duplicate throws P2002 which we swallow.
   */
  async recordRecommendations(
    accountId: string,
    items: RecordableRecommendation[],
    baseCurrency: string,
    now: Date = new Date(),
  ): Promise<void> {
    const periodMonth = this.periodMonth(now);
    for (const it of items) {
      try {
        await this.prisma.inflationShieldRecommendation.create({
          data: {
            accountId,
            canonicalName: it.canonicalName,
            periodMonth,
            priceAtRec: it.currentPrice,
            projectedPrice: it.projectedPrice,
            qty: it.quantity,
            projectedSaving: it.projectedSaving,
            currencyCode: baseCurrency,
          },
        });
      } catch (e) {
        if (!isP2002(e)) throw e;
        // Already recorded this product this month — keep the original snapshot.
      }
    }
  }
}
```

- [ ] **Step 4: Create the leaf module**

Create `apps/api/src/modules/insights/inflation-shield-tracking.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { InflationShieldTrackingService } from './inflation-shield-tracking.service';

// Deliberately a Prisma-only leaf (no heavy imports) so BOTH InsightsModule and
// ExpensesModule can import it without forming a module cycle. PrismaService is
// provided by the @Global() database module, so no import is needed here.
@Module({
  providers: [InflationShieldTrackingService],
  exports: [InflationShieldTrackingService],
})
export class InflationShieldTrackingModule {}
```

- [ ] **Step 5: Run tests**

Run: `cd apps/api && npx jest inflation-shield-tracking`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/insights/inflation-shield-tracking.service.ts apps/api/src/modules/insights/inflation-shield-tracking.service.spec.ts apps/api/src/modules/insights/inflation-shield-tracking.module.ts
git commit -m "feat(insights): InflationShieldTrackingService.recordRecommendations"
```

---

### Task 3: `reconcilePurchase` + `getActedRecommendations`

**Files:**
- Modify: `apps/api/src/modules/insights/inflation-shield-tracking.service.ts`
- Modify: `apps/api/src/modules/insights/inflation-shield-tracking.service.spec.ts`

**Interfaces:**
- Produces: `reconcilePurchase(accountId, expenseId)`, `getActedRecommendations(accountId)` (returns `{ realizedSaving: number; currencyCode: string }[]`).

- [ ] **Step 1: Write the failing tests**

Append to `inflation-shield-tracking.service.spec.ts`:

```ts
describe('InflationShieldTrackingService.reconcilePurchase', () => {
  const activeRec = {
    id: 'r1', accountId: 'a1', canonicalName: 'Masło', qty: 4,
    projectedSaving: new Prisma.Decimal(2.0), recommendedAt: new Date('2026-07-01'),
  };

  function make(items: any[], recs = [activeRec]) {
    const prisma = {
      expense: { findFirst: jest.fn().mockResolvedValue({ id: 'e1', accountId: 'a1', date: new Date('2026-07-10'), items }) },
      inflationShieldRecommendation: {
        findMany: jest.fn().mockResolvedValue(recs),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    return { svc: new InflationShieldTrackingService(prisma as any), prisma };
  }

  it('marks a rec acted and credits proportional realized saving when a matching product is bought', async () => {
    // bought 2 of a recommended 4 → half the saving.
    const { svc, prisma } = make([{ canonicalName: 'Masło', quantity: new Prisma.Decimal(2) }]);
    await svc.reconcilePurchase('a1', 'e1');
    expect(prisma.inflationShieldRecommendation.update).toHaveBeenCalledTimes(1);
    const arg = prisma.inflationShieldRecommendation.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'r1' });
    expect(arg.data.status).toBe('acted');
    expect(arg.data.realizedSaving).toBeCloseTo(1.0, 5); // 2.0 * (2/4)
    expect(arg.data.actedAt).toBeInstanceOf(Date);
  });

  it('does nothing when no bought item matches an active rec', async () => {
    const { svc, prisma } = make([{ canonicalName: 'Chleb', quantity: new Prisma.Decimal(1) }]);
    await svc.reconcilePurchase('a1', 'e1');
    expect(prisma.inflationShieldRecommendation.update).not.toHaveBeenCalled();
  });

  it('does nothing when the expense is not found', async () => {
    const prisma = {
      expense: { findFirst: jest.fn().mockResolvedValue(null) },
      inflationShieldRecommendation: { findMany: jest.fn(), update: jest.fn() },
    };
    const svc = new InflationShieldTrackingService(prisma as any);
    await svc.reconcilePurchase('a1', 'missing');
    expect(prisma.inflationShieldRecommendation.findMany).not.toHaveBeenCalled();
  });
});

describe('InflationShieldTrackingService.getActedRecommendations', () => {
  it('returns realized savings with their currency for acted recs', async () => {
    const prisma = {
      inflationShieldRecommendation: {
        findMany: jest.fn().mockResolvedValue([{ realizedSaving: new Prisma.Decimal(1.5), currencyCode: 'PLN' }]),
      },
    };
    const svc = new InflationShieldTrackingService(prisma as any);
    const out = await svc.getActedRecommendations('a1');
    expect(out).toEqual([{ realizedSaving: 1.5, currencyCode: 'PLN' }]);
    expect(prisma.inflationShieldRecommendation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: 'a1', status: 'acted' } }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest inflation-shield-tracking -t "reconcilePurchase|getActedRecommendations"`
Expected: FAIL — methods not defined.

- [ ] **Step 3: Add the methods**

Append to the class in `inflation-shield-tracking.service.ts`:

```ts
  /**
   * When a receipt is created, credit any active recommendation whose product
   * the user actually bought (>= half the recommended quantity, purchased on/after
   * the recommendation date). Credits the projected saving as realized, scaled by
   * how much of the recommended quantity was bought (capped at 1). Fire-and-forget;
   * fail-silent by the caller. Matches canonicalName EXACTLY (v1 — aliased-product
   * matching is a follow-up).
   */
  async reconcilePurchase(accountId: string, expenseId: string): Promise<void> {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, accountId, isDeleted: false },
      select: {
        date: true,
        items: { where: { isDeleted: false, canonicalName: { not: null } }, select: { canonicalName: true, quantity: true } },
      },
    });
    if (!expense || expense.items.length === 0) return;

    const active = await this.prisma.inflationShieldRecommendation.findMany({
      where: { accountId, status: 'active' },
    });
    if (active.length === 0) return;

    // Sum bought quantity per canonicalName in this receipt.
    const boughtByName = new Map<string, number>();
    for (const it of expense.items) {
      const name = it.canonicalName as string;
      boughtByName.set(name, (boughtByName.get(name) ?? 0) + Number(it.quantity));
    }

    for (const rec of active) {
      const bought = boughtByName.get(rec.canonicalName);
      if (bought == null) continue;
      if (expense.date < rec.recommendedAt) continue;       // bought before we recommended
      if (bought < rec.qty * 0.5) continue;                 // bought too little to count
      const ratio = Math.min(bought / rec.qty, 1);
      const realized = Math.round(Number(rec.projectedSaving) * ratio * 100) / 100;
      await this.prisma.inflationShieldRecommendation.update({
        where: { id: rec.id },
        data: { status: 'acted', actedAt: new Date(), realizedSaving: realized },
      });
    }
  }

  /** Acted recommendations' realized savings + the currency each was recorded in. */
  async getActedRecommendations(accountId: string): Promise<Array<{ realizedSaving: number; currencyCode: string }>> {
    const rows = await this.prisma.inflationShieldRecommendation.findMany({
      where: { accountId, status: 'acted' },
      select: { realizedSaving: true, currencyCode: true },
    });
    return rows.map((r) => ({ realizedSaving: Number(r.realizedSaving ?? 0), currencyCode: r.currencyCode }));
  }
```

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npx jest inflation-shield-tracking`
Expected: PASS (all Task 2 + Task 3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/insights/inflation-shield-tracking.service.ts apps/api/src/modules/insights/inflation-shield-tracking.service.spec.ts
git commit -m "feat(insights): shield reconcilePurchase + getActedRecommendations"
```

---

### Task 4: Wire recording + real `savedSoFar` into `getShield`

**Files:**
- Modify: `apps/api/src/modules/insights/inflation-shield.service.ts`
- Modify: `apps/api/src/modules/insights/inflation-shield.service.spec.ts`
- Modify: `apps/api/src/modules/insights/insights.module.ts`

**Interfaces:**
- Consumes: `InflationShieldTrackingService` (record + getActedRecommendations), the existing private `getRatesSafe` + `convertToBase` logic in the service.
- Produces: `getShield` now returns a real `savedSoFar` and records surfaced recs.

- [ ] **Step 1: Write the failing test**

In `inflation-shield.service.spec.ts`, extend the `make()` helper to inject a mocked tracking service and add a savedSoFar test. Update `make()` so the constructor gets the tracking service as its LAST argument (see Step 3 for the real constructor order), and its `getActedRecommendations` returns one acted rec:

```ts
    const tracking = {
      recordRecommendations: jest.fn().mockResolvedValue(undefined),
      getActedRecommendations: jest.fn().mockResolvedValue([{ realizedSaving: 3, currencyCode: 'PLN' }]),
    };
    const svc = new InflationShieldService(
      priceHistory as any, exchange as any, safeToSpend as any, cache as any, tracking as any,
    );
    return { svc, priceHistory, cache, tracking };
```

Add:
```ts
  it('sums acted recommendations into savedSoFar and records surfaced recs', async () => {
    const { svc, tracking } = make();
    const res = await svc.getShield('a1', 'u1', 'PLN', new Date('2026-07-16T00:00:00Z'));
    expect(res.savedSoFar).toBe(3);
    expect(tracking.recordRecommendations).toHaveBeenCalled();
  });
```
(The existing "serves from cache" test must still pass: a cache hit returns BEFORE recording, so assert `tracking.recordRecommendations` is NOT called on a cache hit — add `expect(tracking.recordRecommendations).not.toHaveBeenCalled();` to that test.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest inflation-shield.service`
Expected: FAIL — constructor arity mismatch / `savedSoFar` is 0.

- [ ] **Step 3: Wire the service**

In `inflation-shield.service.ts`:
1. Import: `import { InflationShieldTrackingService } from './inflation-shield-tracking.service';`
2. Add `private readonly tracking: InflationShieldTrackingService` as the LAST constructor parameter.
3. Replace the hardcoded `savedSoFar: 0` and add recording. After `items` is built and BEFORE constructing `result`, compute savedSoFar from acted recs (convert each to the current base via the same rates), and after building `result` fire-and-forget the recording:

```ts
    // Realized savings to date, converted into the current display currency.
    let savedSoFar = 0;
    try {
      const acted = await this.tracking.getActedRecommendations(accountId);
      for (const a of acted) {
        const inBase = a.currencyCode === baseCurrency
          ? a.realizedSaving
          : rates && rates[a.currencyCode] > 0
            ? a.realizedSaving / rates[a.currencyCode]
            : null;
        if (inBase != null) savedSoFar += inBase;
      }
      savedSoFar = Math.round(savedSoFar * 100) / 100;
    } catch {
      savedSoFar = 0; // tracking unavailable → don't block the shield
    }
```
Set `savedSoFar` in the `result` object (replace `savedSoFar: 0,`). Then, right before `await this.cache.set(cacheKey, result, 3600);`, fire-and-forget the recording of the surfaced items:

```ts
    // Persist surfaced recommendations for later realized-savings reconciliation.
    void this.tracking
      .recordRecommendations(
        accountId,
        items.map((i) => ({
          canonicalName: i.canonicalName,
          currentPrice: i.currentPrice,
          projectedPrice: i.projectedPrice,
          quantity: i.quantity,
          projectedSaving: i.projectedSaving,
        })),
        baseCurrency,
        now,
      )
      .catch(() => {});
```
(`items` are `ShieldItem[]` in base currency — exactly the `RecordableRecommendation` shape.)

- [ ] **Step 4: Register the tracking module in InsightsModule**

In `insights.module.ts`: `import { InflationShieldTrackingModule } from './inflation-shield-tracking.module';` and add `InflationShieldTrackingModule` to the `imports` array. (Do NOT add the service to providers — it comes from the imported module.)

- [ ] **Step 5: Run tests + typecheck**

Run: `cd apps/api && npx jest inflation-shield && npx tsc --noEmit`
Expected: tests PASS (util + service + controller + tracking), tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/insights/inflation-shield.service.ts apps/api/src/modules/insights/inflation-shield.service.spec.ts apps/api/src/modules/insights/insights.module.ts
git commit -m "feat(insights): record recommendations + real savedSoFar in getShield"
```

---

### Task 5: Reconcile hook in `ExpensesService.create`

**Files:**
- Modify: `apps/api/src/modules/expenses/expenses.service.ts`
- Modify: `apps/api/src/modules/expenses/expenses.module.ts`
- Modify: `apps/api/src/modules/expenses/expenses.service.spec.ts`

**Interfaces:**
- Consumes: `InflationShieldTrackingService.reconcilePurchase` (via `@Optional()` injection, mirroring the existing `@Optional() communityPrices` / `familyFeed` pattern).

- [ ] **Step 1: Write the failing test**

The existing `expenses.service.spec.ts` already constructs `ExpensesService`. Add a focused test that a successful new-expense create fires `reconcilePurchase`. Mirror how the spec already mocks `anomalyService`/`familyFeed`; add a mocked tracking service passed as the LAST constructor arg, and assert it's called after a create. (Read the existing spec's `ExpensesService` construction to match its exact argument list, then append the tracking mock as the final argument — pad with the existing mocks as the spec already does.)

```ts
  it('fires inflation-shield reconcilePurchase after creating a new expense', async () => {
    // ...existing arrange for a successful create returning { expense: { id, source }, isNew: true }...
    // shieldTracking is the mocked InflationShieldTrackingService passed to the constructor.
    await service.create('a1', 'u1', validCreateDto);
    // fire-and-forget — allow the microtask to run:
    await new Promise((r) => setImmediate(r));
    expect(shieldTracking.reconcilePurchase).toHaveBeenCalledWith('a1', expect.any(String));
  });
```
> NOTE: read `expenses.service.spec.ts` first to reuse its existing successful-create setup and its constructor-construction helper; do not invent a new fixture. If the spec constructs `ExpensesService` via `new ExpensesService(...)`, append the tracking mock as the last arg; if it uses Nest `Test.createTestingModule`, add `{ provide: InflationShieldTrackingService, useValue: shieldTracking }`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest expenses.service -t "reconcilePurchase"`
Expected: FAIL — reconcile not called (hook absent).

- [ ] **Step 3: Add the injection + hook**

In `expenses.service.ts`:
1. Import: `import { InflationShieldTrackingService } from '../insights/inflation-shield-tracking.service';`
2. Add to the constructor as an OPTIONAL injection (mirror `@Optional() communityPrices`):
```ts
    @Optional() private readonly shieldTracking?: InflationShieldTrackingService,
```
3. In the post-create fire-and-forget block (the `if (result.isNew && result.expense) { … }` block, next to the `void this.communityPrices?.recordContribution(...)` call), add:
```ts
    // fire-and-forget: credit any active inflation-shield recommendation this
    // purchase acts on (realized-savings tracking). Never throws into create.
    void this.shieldTracking
      ?.reconcilePurchase(accountId, result.expense.id)
      .catch(() => {});
```

- [ ] **Step 4: Import the tracking module in ExpensesModule**

In `expenses.module.ts`: `import { InflationShieldTrackingModule } from '../insights/inflation-shield-tracking.module';` and add `InflationShieldTrackingModule` to the `imports` array. (The `@Optional()` injection means even if a wiring is missed it degrades to no-op rather than crashing DI — but import it so it actually runs.)

- [ ] **Step 5: Run tests + typecheck + regression**

Run: `cd apps/api && npx jest expenses.service inflation-shield && npx tsc --noEmit`
Expected: the new hook test PASSES, existing expenses tests still pass, tsc exit 0. Then run `npx jest src/modules/insights src/modules/expenses` and confirm no NEW failures (the only pre-existing failures anywhere are the 2 `computeInflationIndex` ones in price-history, not in these paths).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/expenses/expenses.service.ts apps/api/src/modules/expenses/expenses.module.ts apps/api/src/modules/expenses/expenses.service.spec.ts
git commit -m "feat(expenses): fire inflation-shield reconcile on new expense"
```

---

## Definition of Done (Plan 2)

- `inflation_shield_recommendations` table exists; `savedSoFar` in `GET /insights/inflation-shield` reflects realized savings (no longer hardcoded 0).
- Surfacing the shield records `active` recommendations (idempotent per product per month).
- Creating an expense whose items match an active recommendation marks it `acted` and credits the (proportional) projected saving.
- Tracking service is Prisma-only; no module cycle (leaf module imported by both Insights + Expenses).
- All new tests pass; only the 2 known pre-existing `computeInflationIndex` failures remain.

## Out of scope / Follow-ups (later plans)

- **Community-price boost** (region derivation → `CommunityPriceService.getCommunityPrices` → cheaper store overrides personal `store`/`currentBestPrice`).
- **Proactive push**: `notifyInflationShield` column + preference (5-place wiring) + `NotificationType 'inflation_shield'` + `notification-i18n` × 9 + `inflation-shield.cron.ts` daily.
- **Expiry cron** to set stale `active` recs → `expired`.
- **Aliased-product reconciliation** (resolve the bought item's `canonicalName` through `product_aliases` before matching).
- **True realized savings** (verify the price actually rose after the stock-up) — v1 credits projected saving on the act.
- **Mobile UI + AI chat tool + i18n**.
