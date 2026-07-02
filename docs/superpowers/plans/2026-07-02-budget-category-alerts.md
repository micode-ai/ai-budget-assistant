# Budget Category Threshold Alerts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fire push notifications when a per-category budget allocation crosses the 50/80/100% thresholds, naming the category in the notification text.

**Architecture:** Extend `BudgetAlert` with a nullable `categoryId` column (NULL = overall budget alert, non-NULL = category alert); replace the existing single unique constraint with two partial indexes. Add a `checkCategoryThresholds` private method to `BudgetAlertService` that runs a single `groupBy` query per budget and fires alerts per allocation. Reuse the existing `budget_alert` notification type, gated by the existing `notifyBudgetAlerts` user preference.

**Tech Stack:** NestJS, Prisma 5, PostgreSQL (partial unique indexes), Jest

## Global Constraints

- Thresholds: `[50, 80, 100]` — same as existing overall budget alerts
- Notification type: `'budget_alert'` — no new type, no new preference toggle
- Partial indexes must be raw SQL in the migration (Prisma does not emit `WHERE` clauses on indexes natively)
- All 9 locales must be updated: `en`, `ru`, `ua`, `pl`, `es`, `fr`, `de`, `be`, `nl`
- Commands run from `apps/api/` unless otherwise noted

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modify | Add `categoryId String?` to `BudgetAlert`; remove `@@unique` |
| `apps/api/prisma/migrations/<ts>_add_budget_category_alert/migration.sql` | Create (via prisma) + append | Auto-generated ALTER TABLE + hand-written partial indexes |
| `apps/api/src/modules/notifications/notification-i18n.ts` | Modify | Add `BudgetCategoryThresholdParams` interface, 4 keys × 9 locales, 4 export functions |
| `apps/api/src/modules/budgets/budget-alert.service.ts` | Modify | Fix existing dedup queries to scope `categoryId: null`; add `checkCategoryThresholds`; include `category` in allocation fetch |
| `apps/api/src/modules/budgets/budget-alert.service.spec.ts` | Create | Tests for category threshold logic + dedup |

---

## Task 1: Prisma schema + DB migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (BudgetAlert model, lines ~556–573)
- Create (auto+append): `apps/api/prisma/migrations/<timestamp>_add_budget_category_alert/migration.sql`

**Interfaces:**
- Produces: `categoryId` column on `budget_alerts` table; two partial unique indexes replacing the single unique constraint

- [ ] **Step 1: Edit the BudgetAlert model in schema.prisma**

  Find the `BudgetAlert` model (currently has `@@unique([budgetId, thresholdPercentage, periodStart])`).
  Replace the entire model with:

  ```prisma
  model BudgetAlert {
    id                  String   @id @default(uuid())
    budgetId            String   @map("budget_id")
    categoryId          String?  @map("category_id")
    userId              String   @map("user_id")
    thresholdPercentage Int      @map("threshold_percentage")
    triggeredAt         DateTime @map("triggered_at")
    periodStart         DateTime @map("period_start") @db.Date
    currentSpent        Decimal  @map("current_spent") @db.Decimal(12, 2)
    isRead              Boolean  @default(false) @map("is_read")
    notificationSent    Boolean  @default(false) @map("notification_sent")

    budget Budget @relation(fields: [budgetId], references: [id], onDelete: Cascade)
    user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

    @@index([budgetId])
    @@map("budget_alerts")
  }
  ```

  Note: `@@unique` is intentionally removed — it will be replaced by two partial indexes in raw SQL.

- [ ] **Step 2: Generate the migration**

  Run from `apps/api/`:
  ```bash
  npx prisma migrate dev --name add_budget_category_alert
  ```

  Expected output: `Your database is now in sync with your schema.` and a new directory appears under `apps/api/prisma/migrations/` named `<TIMESTAMP>_add_budget_category_alert/`.

- [ ] **Step 3: Append partial indexes to the generated migration SQL**

  Open `apps/api/prisma/migrations/<TIMESTAMP>_add_budget_category_alert/migration.sql`.
  It will contain Prisma-generated lines (ALTER TABLE add column, DROP INDEX / DROP CONSTRAINT).
  Append these lines at the end:

  ```sql
  -- Partial unique index: overall budget alerts (category_id IS NULL)
  CREATE UNIQUE INDEX "budget_alert_overall_unique"
    ON "budget_alerts"("budget_id", "threshold_percentage", "period_start")
    WHERE "category_id" IS NULL;

  -- Partial unique index: per-category alerts (category_id IS NOT NULL)
  CREATE UNIQUE INDEX "budget_alert_category_unique"
    ON "budget_alerts"("budget_id", "category_id", "threshold_percentage", "period_start")
    WHERE "category_id" IS NOT NULL;
  ```

- [ ] **Step 4: Apply the amended migration**

  Run from `apps/api/`:
  ```bash
  npx prisma migrate deploy
  ```

  Expected: `1 migration applied.`

- [ ] **Step 5: Regenerate the Prisma client**

  ```bash
  npx prisma generate
  ```

  Expected: `Generated Prisma Client ...`

- [ ] **Step 6: Commit**

  ```bash
  git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
  git commit -m "feat: add categoryId to BudgetAlert with partial unique indexes"
  ```

---

## Task 2: i18n strings for category alerts

**Files:**
- Modify: `apps/api/src/modules/notifications/notification-i18n.ts`

**Interfaces:**
- Produces:
  - `budgetCategoryThresholdTitle(lang: string, params: BudgetCategoryThresholdParams): string`
  - `budgetCategoryThresholdBody(lang: string, params: BudgetCategoryThresholdParams): string`
  - `budgetCategoryExceededTitle(lang: string, params: BudgetCategoryThresholdParams): string`
  - `budgetCategoryExceededBody(lang: string, params: BudgetCategoryThresholdParams): string`
  - where `BudgetCategoryThresholdParams = { budgetName: string; categoryName: string; threshold: number }`

- [ ] **Step 1: Add the params interface**

  After the existing `BudgetThresholdParams` interface (around line 11–17), add:

  ```ts
  interface BudgetCategoryThresholdParams {
    budgetName: string;
    categoryName: string;
    threshold: number;
  }
  ```

- [ ] **Step 2: Add the 4 keys to the translations Record type**

  In the `Record<string, { ... }>` type declaration (around line 112–165), after the `budgetExceededBody` line, add:

  ```ts
  budgetCategoryThresholdTitle: (p: BudgetCategoryThresholdParams) => string;
  budgetCategoryThresholdBody: (p: BudgetCategoryThresholdParams) => string;
  budgetCategoryExceededTitle: (p: BudgetCategoryThresholdParams) => string;
  budgetCategoryExceededBody: (p: BudgetCategoryThresholdParams) => string;
  ```

- [ ] **Step 3: Add translations for all 9 locales**

  In every locale object inside `const translations = { ... }`, after the `budgetExceededBody` entry, add the 4 new entries. Here are the values for each locale:

  **`en`:**
  ```ts
  budgetCategoryThresholdTitle: ({ categoryName, threshold }) => `${categoryName}: ${threshold}% used`,
  budgetCategoryThresholdBody: ({ budgetName, categoryName, threshold }) =>
    `Budget «${budgetName}» — ${categoryName} reached ${threshold}% of its limit`,
  budgetCategoryExceededTitle: ({ categoryName }) => `${categoryName} over limit`,
  budgetCategoryExceededBody: ({ budgetName, categoryName }) =>
    `Budget «${budgetName}» — ${categoryName} exceeded its allocation`,
  ```

  **`ru`:**
  ```ts
  budgetCategoryThresholdTitle: ({ categoryName, threshold }) => `${categoryName}: использовано ${threshold}%`,
  budgetCategoryThresholdBody: ({ budgetName, categoryName, threshold }) =>
    `Бюджет «${budgetName}» — ${categoryName} достиг ${threshold}% лимита`,
  budgetCategoryExceededTitle: ({ categoryName }) => `${categoryName} превышена`,
  budgetCategoryExceededBody: ({ budgetName, categoryName }) =>
    `Бюджет «${budgetName}» — ${categoryName} превысила лимит категории`,
  ```

  **`ua`:**
  ```ts
  budgetCategoryThresholdTitle: ({ categoryName, threshold }) => `${categoryName}: використано ${threshold}%`,
  budgetCategoryThresholdBody: ({ budgetName, categoryName, threshold }) =>
    `Бюджет «${budgetName}» — ${categoryName} досяг ${threshold}% ліміту`,
  budgetCategoryExceededTitle: ({ categoryName }) => `${categoryName} перевищена`,
  budgetCategoryExceededBody: ({ budgetName, categoryName }) =>
    `Бюджет «${budgetName}» — ${categoryName} перевищила ліміт категорії`,
  ```

  **`pl`:**
  ```ts
  budgetCategoryThresholdTitle: ({ categoryName, threshold }) => `${categoryName}: ${threshold}% wykorzystane`,
  budgetCategoryThresholdBody: ({ budgetName, categoryName, threshold }) =>
    `Budżet «${budgetName}» — ${categoryName} osiągnął ${threshold}% limitu`,
  budgetCategoryExceededTitle: ({ categoryName }) => `${categoryName} przekroczona`,
  budgetCategoryExceededBody: ({ budgetName, categoryName }) =>
    `Budżet «${budgetName}» — ${categoryName} przekroczyła limit kategorii`,
  ```

  **`es`:**
  ```ts
  budgetCategoryThresholdTitle: ({ categoryName, threshold }) => `${categoryName}: ${threshold}% usado`,
  budgetCategoryThresholdBody: ({ budgetName, categoryName, threshold }) =>
    `Presupuesto «${budgetName}» — ${categoryName} alcanzó el ${threshold}% de su límite`,
  budgetCategoryExceededTitle: ({ categoryName }) => `${categoryName} superada`,
  budgetCategoryExceededBody: ({ budgetName, categoryName }) =>
    `Presupuesto «${budgetName}» — ${categoryName} superó el límite de su categoría`,
  ```

  **`fr`:**
  ```ts
  budgetCategoryThresholdTitle: ({ categoryName, threshold }) => `${categoryName} : ${threshold}% utilisé`,
  budgetCategoryThresholdBody: ({ budgetName, categoryName, threshold }) =>
    `Budget «${budgetName}» — ${categoryName} a atteint ${threshold}% de sa limite`,
  budgetCategoryExceededTitle: ({ categoryName }) => `${categoryName} dépassée`,
  budgetCategoryExceededBody: ({ budgetName, categoryName }) =>
    `Budget «${budgetName}» — ${categoryName} a dépassé la limite de sa catégorie`,
  ```

  **`de`:**
  ```ts
  budgetCategoryThresholdTitle: ({ categoryName, threshold }) => `${categoryName}: ${threshold}% genutzt`,
  budgetCategoryThresholdBody: ({ budgetName, categoryName, threshold }) =>
    `Budget «${budgetName}» — ${categoryName} hat ${threshold}% des Limits erreicht`,
  budgetCategoryExceededTitle: ({ categoryName }) => `${categoryName} überschritten`,
  budgetCategoryExceededBody: ({ budgetName, categoryName }) =>
    `Budget «${budgetName}» — ${categoryName} hat das Kategorienlimit überschritten`,
  ```

  **`be`:**
  ```ts
  budgetCategoryThresholdTitle: ({ categoryName, threshold }) => `${categoryName}: выкарыстана ${threshold}%`,
  budgetCategoryThresholdBody: ({ budgetName, categoryName, threshold }) =>
    `Бюджэт «${budgetName}» — ${categoryName} дасягнуў ${threshold}% ліміту`,
  budgetCategoryExceededTitle: ({ categoryName }) => `${categoryName} перавышана`,
  budgetCategoryExceededBody: ({ budgetName, categoryName }) =>
    `Бюджэт «${budgetName}» — ${categoryName} перавысіла ліміт катэгорыі`,
  ```

  **`nl`:**
  ```ts
  budgetCategoryThresholdTitle: ({ categoryName, threshold }) => `${categoryName}: ${threshold}% gebruikt`,
  budgetCategoryThresholdBody: ({ budgetName, categoryName, threshold }) =>
    `Budget «${budgetName}» — ${categoryName} heeft ${threshold}% van zijn limiet bereikt`,
  budgetCategoryExceededTitle: ({ categoryName }) => `${categoryName} overschreden`,
  budgetCategoryExceededBody: ({ budgetName, categoryName }) =>
    `Budget «${budgetName}» — ${categoryName} heeft de categorielimiet overschreden`,
  ```

- [ ] **Step 4: Export the 4 new functions**

  At the end of `notification-i18n.ts`, after `tripSettleUpBody`, add:

  ```ts
  export function budgetCategoryThresholdTitle(lang: Lang, params: BudgetCategoryThresholdParams): string {
    return t(lang).budgetCategoryThresholdTitle(params);
  }

  export function budgetCategoryThresholdBody(lang: Lang, params: BudgetCategoryThresholdParams): string {
    return t(lang).budgetCategoryThresholdBody(params);
  }

  export function budgetCategoryExceededTitle(lang: Lang, params: BudgetCategoryThresholdParams): string {
    return t(lang).budgetCategoryExceededTitle(params);
  }

  export function budgetCategoryExceededBody(lang: Lang, params: BudgetCategoryThresholdParams): string {
    return t(lang).budgetCategoryExceededBody(params);
  }
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api/src/modules/notifications/notification-i18n.ts
  git commit -m "feat: add budget category threshold i18n strings (9 locales)"
  ```

---

## Task 3: Service logic + tests

**Files:**
- Create: `apps/api/src/modules/budgets/budget-alert.service.spec.ts`
- Modify: `apps/api/src/modules/budgets/budget-alert.service.ts`

**Interfaces:**
- Consumes from Task 1: `prisma.budgetAlert` now accepts `categoryId?: string | null`
- Consumes from Task 2: `ni18n.budgetCategoryThresholdTitle/Body`, `ni18n.budgetCategoryExceededTitle/Body`
- Produces: `checkCategoryThresholds` private method

- [ ] **Step 1: Write the failing test file**

  Create `apps/api/src/modules/budgets/budget-alert.service.spec.ts`:

  ```ts
  import { Test, TestingModule } from '@nestjs/testing';
  import { BudgetAlertService } from './budget-alert.service';
  import { PrismaService } from '../../database/prisma.service';
  import { NotificationsService } from '../notifications/notifications.service';

  const mockPrisma = {
    budget: { findMany: jest.fn() },
    expense: { aggregate: jest.fn(), groupBy: jest.fn() },
    budgetAlert: {
      findFirst: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockNotifications = {
    sendToUser: jest.fn(),
  };

  // A budget with one category allocation of 100.00; overall amount 200.
  // At 0% overall spend the overall loop never calls findFirst.
  const makeBudget = (overrides: any = {}) => ({
    id: 'budget-1',
    name: 'Monthly',
    userId: 'user-1',
    amount: 200,
    currencyCode: 'PLN',
    period: 'monthly',
    startDate: new Date('2026-07-01'),
    isActive: true,
    isDeleted: false,
    categoryAllocations: [
      {
        categoryId: 'cat-1',
        amount: 100,
        isDeleted: false,
        category: { id: 'cat-1', name: 'Food' },
      },
    ],
    ...overrides,
  });

  describe('BudgetAlertService — category thresholds', () => {
    let service: BudgetAlertService;

    beforeEach(async () => {
      jest.clearAllMocks();

      // Overall budget spend = 0 → overall loop never reaches a threshold → no findFirst calls for overall
      mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      mockPrisma.expense.groupBy.mockResolvedValue([]);
      mockPrisma.budgetAlert.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.budgetAlert.update.mockResolvedValue({});
      mockNotifications.sendToUser.mockResolvedValue(true);

      // Key helper: findFirst is called twice per threshold that fires:
      //   1st call (dedup check): no orderBy → return null (no existing alert)
      //   2nd call (post-insert):  has orderBy  → return the inserted alert
      // This implementation avoids fragile call-order mocks.
      mockPrisma.budgetAlert.findFirst.mockImplementation(async (args: any) => {
        if (args?.orderBy) {
          return { id: 'alert-id', notificationSent: false };
        }
        return null; // dedup: no existing alert
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          BudgetAlertService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: NotificationsService, useValue: mockNotifications },
        ],
      }).compile();

      service = module.get<BudgetAlertService>(BudgetAlertService);
    });

    it('fires no category alert when category spend is 0%', async () => {
      mockPrisma.budget.findMany.mockResolvedValue([makeBudget()]);
      mockPrisma.expense.groupBy.mockResolvedValue([]); // 0 spent in all categories

      await service.checkBudgetsForAccount('acc-1', 'PLN');

      const categoryCalls = mockNotifications.sendToUser.mock.calls.filter(
        (c: any[]) => c[3]?.categoryId,
      );
      expect(categoryCalls).toHaveLength(0);
    });

    it('fires only the 50% alert when category is at 55%', async () => {
      mockPrisma.budget.findMany.mockResolvedValue([makeBudget()]);
      mockPrisma.expense.groupBy.mockResolvedValue([
        { categoryId: 'cat-1', _sum: { amount: 55 } },
      ]);

      await service.checkBudgetsForAccount('acc-1', 'PLN');

      const categoryCalls = mockNotifications.sendToUser.mock.calls.filter(
        (c: any[]) => c[3]?.categoryId === 'cat-1',
      );
      expect(categoryCalls).toHaveLength(1);
      expect(categoryCalls[0][3].thresholdPercentage).toBe(50);
    });

    it('fires 50% and 80% alerts when category is at 85%', async () => {
      mockPrisma.budget.findMany.mockResolvedValue([makeBudget()]);
      mockPrisma.expense.groupBy.mockResolvedValue([
        { categoryId: 'cat-1', _sum: { amount: 85 } },
      ]);

      await service.checkBudgetsForAccount('acc-1', 'PLN');

      const categoryCalls = mockNotifications.sendToUser.mock.calls.filter(
        (c: any[]) => c[3]?.categoryId === 'cat-1',
      );
      expect(categoryCalls).toHaveLength(2);
      const thresholds = categoryCalls.map((c: any[]) => c[3].thresholdPercentage).sort();
      expect(thresholds).toEqual([50, 80]);
    });

    it('fires all three alerts (50/80/100) when category is at 105%', async () => {
      mockPrisma.budget.findMany.mockResolvedValue([makeBudget()]);
      mockPrisma.expense.groupBy.mockResolvedValue([
        { categoryId: 'cat-1', _sum: { amount: 105 } },
      ]);

      await service.checkBudgetsForAccount('acc-1', 'PLN');

      const categoryCalls = mockNotifications.sendToUser.mock.calls.filter(
        (c: any[]) => c[3]?.categoryId === 'cat-1',
      );
      expect(categoryCalls).toHaveLength(3);
      const thresholds = categoryCalls.map((c: any[]) => c[3].thresholdPercentage).sort();
      expect(thresholds).toEqual([50, 80, 100]);
    });

    it('does not fire again on second run when alert already exists (dedup)', async () => {
      mockPrisma.budget.findMany.mockResolvedValue([makeBudget()]);
      mockPrisma.expense.groupBy.mockResolvedValue([
        { categoryId: 'cat-1', _sum: { amount: 60 } },
      ]);
      // Both dedup and post-insert findFirst return existing alert
      mockPrisma.budgetAlert.findFirst.mockResolvedValue({
        id: 'existing',
        notificationSent: true,
      });

      await service.checkBudgetsForAccount('acc-1', 'PLN');

      const categoryCalls = mockNotifications.sendToUser.mock.calls.filter(
        (c: any[]) => c[3]?.categoryId,
      );
      expect(categoryCalls).toHaveLength(0);
    });

    it('skips groupBy entirely when budget has no categoryAllocations', async () => {
      mockPrisma.budget.findMany.mockResolvedValue([
        makeBudget({ categoryAllocations: [] }),
      ]);

      await service.checkBudgetsForAccount('acc-1', 'PLN');

      expect(mockPrisma.expense.groupBy).not.toHaveBeenCalled();
    });

    it('includes categoryName and categoryId in the notification payload', async () => {
      mockPrisma.budget.findMany.mockResolvedValue([makeBudget()]);
      mockPrisma.expense.groupBy.mockResolvedValue([
        { categoryId: 'cat-1', _sum: { amount: 55 } },
      ]);

      await service.checkBudgetsForAccount('acc-1', 'PLN');

      const categoryCalls = mockNotifications.sendToUser.mock.calls.filter(
        (c: any[]) => c[3]?.categoryId === 'cat-1',
      );
      expect(categoryCalls[0][3].categoryName).toBe('Food');
      expect(categoryCalls[0][3].thresholdPercentage).toBe(50);
    });
  });
  ```

- [ ] **Step 2: Run the test to confirm it fails**

  From `apps/api/`:
  ```bash
  npx jest budget-alert.service.spec.ts --no-coverage
  ```

  Expected: Tests fail because `checkCategoryThresholds` does not exist yet (or TypeScript compile error on `groupBy` call). This is the red state.

- [ ] **Step 3: Update `checkBudgetsForAccount` to include category names**

  In `apps/api/src/modules/budgets/budget-alert.service.ts`, change the `include` in `checkBudgetsForAccount`:

  ```ts
  // BEFORE
  include: {
    categoryAllocations: { where: { isDeleted: false } },
  },

  // AFTER
  include: {
    categoryAllocations: { where: { isDeleted: false }, include: { category: true } },
  },
  ```

- [ ] **Step 4: Fix the existing overall-budget dedup queries to scope `categoryId: null`**

  In `checkBudgetThresholds`, update two `findFirst` calls so they never accidentally match a category alert:

  ```ts
  // First findFirst (dedup check before insert) — change:
  // BEFORE
  where: { budgetId: budget.id, thresholdPercentage: threshold, periodStart },
  // AFTER
  where: { budgetId: budget.id, categoryId: null, thresholdPercentage: threshold, periodStart },

  // Second findFirst (after createMany, to get the inserted id) — change:
  // BEFORE
  where: { budgetId: budget.id, thresholdPercentage: threshold, periodStart },
  orderBy: { triggeredAt: 'desc' },
  // AFTER
  where: { budgetId: budget.id, categoryId: null, thresholdPercentage: threshold, periodStart },
  orderBy: { triggeredAt: 'desc' },
  ```

- [ ] **Step 5: Add `checkCategoryThresholds` private method**

  At the end of the class in `budget-alert.service.ts`, before the closing `}`, add:

  ```ts
  private async checkCategoryThresholds(
    accountId: string,
    budget: any,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    const allocations = (budget.categoryAllocations || []).filter((a: any) => !a.isDeleted);
    if (allocations.length === 0) return;

    const allocationCategoryIds = allocations.map((a: any) => a.categoryId);

    const grouped = await this.prisma.expense.groupBy({
      by: ['categoryId'],
      where: {
        accountId,
        categoryId: { in: allocationCategoryIds },
        date: { gte: periodStart, lte: periodEnd },
        isDeleted: false,
        currencyCode: budget.currencyCode,
      },
      _sum: { amount: true },
    });

    const spentMap = new Map<string, number>(
      grouped.map((r: any) => [r.categoryId, Number(r._sum?.amount ?? 0)]),
    );

    for (const allocation of allocations) {
      const categoryId: string = allocation.categoryId;
      const categoryName: string = allocation.category?.name ?? categoryId;
      const allocated = Number(allocation.amount);
      if (allocated <= 0) continue;

      const spent = spentMap.get(categoryId) ?? 0;
      const percentUsed = (spent / allocated) * 100;

      for (const threshold of THRESHOLDS) {
        if (percentUsed < threshold) continue;

        const existingAlert = await this.prisma.budgetAlert.findFirst({
          where: { budgetId: budget.id, categoryId, thresholdPercentage: threshold, periodStart },
        });

        if (existingAlert) continue;

        const insertResult = await this.prisma.budgetAlert.createMany({
          data: [{
            budgetId: budget.id,
            categoryId,
            userId: budget.userId,
            thresholdPercentage: threshold,
            currentSpent: spent,
            periodStart,
            triggeredAt: new Date(),
            notificationSent: false,
          }],
          skipDuplicates: true,
        });

        if (insertResult.count > 0) {
          const alert = await this.prisma.budgetAlert.findFirst({
            where: { budgetId: budget.id, categoryId, thresholdPercentage: threshold, periodStart },
            orderBy: { triggeredAt: 'desc' },
          });

          if (alert && !alert.notificationSent) {
            await this.prisma.budgetAlert.update({
              where: { id: alert.id },
              data: { notificationSent: true },
            });

            const categoryParams = {
              budgetName: budget.name,
              categoryName,
              threshold,
            };

            const sentOk = await this.notifications.sendToUser(
              budget.userId,
              threshold >= 100
                ? (lang: string) => ni18n.budgetCategoryExceededTitle(lang, categoryParams)
                : (lang: string) => ni18n.budgetCategoryThresholdTitle(lang, categoryParams),
              threshold >= 100
                ? (lang: string) => ni18n.budgetCategoryExceededBody(lang, categoryParams)
                : (lang: string) => ni18n.budgetCategoryThresholdBody(lang, categoryParams),
              {
                budgetId: budget.id,
                alertId: alert.id,
                thresholdPercentage: threshold,
                categoryId,
                categoryName,
              },
              'budget_alert',
            );

            if (!sentOk) {
              await this.prisma.budgetAlert.update({
                where: { id: alert.id },
                data: { notificationSent: false },
              });
            }
          }
        }
      }
    }
  }
  ```

- [ ] **Step 6: Call `checkCategoryThresholds` at the end of `checkBudgetThresholds`**

  At the very end of `checkBudgetThresholds`, after the closing `}` of the `for (const threshold of THRESHOLDS)` loop, add:

  ```ts
  await this.checkCategoryThresholds(accountId, budget, periodStart, periodEnd);
  ```

  The signature of `checkBudgetThresholds` must also receive `accountId` — verify it already does (it does: `private async checkBudgetThresholds(accountId: string, budget: any)`).

- [ ] **Step 7: Run the tests**

  From `apps/api/`:
  ```bash
  npx jest budget-alert.service.spec.ts --no-coverage
  ```

  Expected output: `Tests: 6 passed, 6 total`

- [ ] **Step 8: Run the full API test suite to check for regressions**

  From `apps/api/`:
  ```bash
  npx jest --no-coverage
  ```

  Expected: all tests pass.

- [ ] **Step 9: TypeScript check**

  From `apps/api/`:
  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 10: Commit**

  ```bash
  git add apps/api/src/modules/budgets/budget-alert.service.ts \
          apps/api/src/modules/budgets/budget-alert.service.spec.ts
  git commit -m "feat: fire push notifications when budget category reaches 50/80/100% threshold"
  ```
