# Smart Shopping List — Restock Prediction (M3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Predict when a user is due to re-buy a grocery staple (from receipt purchase cadence) and surface it as a "Time to restock" strip on the list screen + an opt-in daily push.

**Architecture:** A pure `predictRestock(purchasesByProduct, now?)` (median-gap detector, mirrors `basket-calculator.ts`) feeds a free `GET /shopping-list/suggestions` endpoint and a daily `shopping-reminder.cron.ts` (mirrors the ABA-292 `tracking-gap-reminder.cron.ts`). The push is gated by a new `notifyShoppingReminders` user preference and a new `shopping_reminder` notification type.

**Tech Stack:** NestJS 10 + Prisma + `@nestjs/schedule` cron + Jest (API); Expo/RN + i18next (mobile).

## Global Constraints

- The `shopping-list` module + its tables/endpoints already exist (M1/M2). Add the cron + suggestions here; do NOT recreate the module.
- `restock-predictor.ts` is a PURE function (no Prisma), unit-tested, mirroring `basket-calculator.ts`. Query code lives in the service.
- The suggestions endpoint is **free** (no `@RequireTier`): class-level `JwtAuthGuard + AccountContextGuard`, `accountId` from `req`.
- Notification plumbing follows the tracking-gap pattern EXACTLY: new `NotificationType` member, new `User.notify*` column, a `sendToUser` select+gate line, `notification-i18n` entries in all 9 languages, and a preference field in `GET/PATCH /users/me/notification-preferences`.
- Push failures / offline are `console.warn`, never `console.error`. Cron `sendToUser(...)` calls are `.catch(() => {})` fire-and-forget (per tracking-gap).
- Mobile: the notification toggle must be added to BOTH the individual switch AND the master "all notifications" aggregate in `settings/notifications.tsx`. New i18n keys in all 9 locales.
- Import shared-types with `import type` in the API.

---

### Task 1: Shared types — notification type, RestockSuggestion, preference field

**Files:**
- Modify: `packages/shared-types/src/entities/primitives.ts` (`NotificationType`)
- Modify: `packages/shared-types/src/dto/notification.ts` (preference DTOs)
- Modify: `packages/shared-types/src/dto/shopping-list.ts` (`RestockSuggestion`)

- [ ] **Step 1: Extend `NotificationType`**

In `primitives.ts`, add `'shopping_reminder'` to the `NotificationType` union (after `'account_invitation'`).

- [ ] **Step 2: Add the preference field**

In `notification.ts`, add `shoppingReminders?: boolean;` to `UpdateNotificationPreferencesDto` and `shoppingReminders: boolean;` to `NotificationPreferencesResponse`.

- [ ] **Step 3: Add `RestockSuggestion`**

Append to `shopping-list.ts`:

```ts
export interface RestockSuggestion {
  canonicalName: string;
  lastPurchase: string;   // ISO date YYYY-MM-DD
  medianGapDays: number;
  dueInDays: number;      // <= 0 means due/overdue
  purchaseCount: number;
}
```

- [ ] **Step 4: Typecheck + commit**

Run: `cd packages/shared-types && npx tsc --noEmit` → PASS.
```bash
git add packages/shared-types/src
git commit -m "feat(shared-types): shopping_reminder type + RestockSuggestion + preference field"
```

---

### Task 2: Prisma — notifyShoppingReminders column

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`User` model)

- [ ] **Step 1: Add the column**

In the `User` model (next to `notifyTripSettleUp`, schema.prisma:~156) add:

```prisma
  notifyShoppingReminders Boolean   @default(true) @map("notify_shopping_reminders")
```

- [ ] **Step 2: Migration + generate**

Run: `cd apps/api && npx prisma migrate dev --name add_shopping_reminder_notification && npx prisma generate`
Expected: migration `*_add_shopping_reminder_notification` applied cleanly (a single `ALTER TABLE "users" ADD COLUMN "notify_shopping_reminders" BOOLEAN NOT NULL DEFAULT true;`), no drift on unrelated migrations (if drift on an unrelated migration appears, STOP and report BLOCKED).

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): add notify_shopping_reminders user preference column"
```

---

### Task 3: restock-predictor pure function + tests

**Files:**
- Create: `apps/api/src/modules/shopping-list/restock-predictor.ts`
- Test: `apps/api/src/modules/shopping-list/restock-predictor.spec.ts`

**Interfaces:**
- Produces: `predictRestock(purchasesByProduct: Map<string, Date[]>, now?: Date): RestockSuggestion[]`.
- Consumes: `RestockSuggestion` (Task 1).

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/modules/shopping-list/restock-predictor.spec.ts
import { predictRestock } from './restock-predictor';

const d = (s: string) => new Date(s);
const NOW = d('2026-07-08');

describe('predictRestock', () => {
  it('flags a product overdue past its median gap', () => {
    // bought every ~7 days, last purchase 10 days ago → overdue
    const map = new Map<string, Date[]>([
      ['Milk', [d('2026-06-07'), d('2026-06-14'), d('2026-06-21'), d('2026-06-28')]],
    ]);
    const res = predictRestock(map, NOW);
    expect(res).toHaveLength(1);
    expect(res[0].canonicalName).toBe('Milk');
    expect(res[0].medianGapDays).toBe(7);
    expect(res[0].dueInDays).toBeLessThan(0); // NOW is 10 days after 06-28, median 7 → -3
    expect(res[0].purchaseCount).toBe(4);
  });

  it('does not flag a product bought recently (within its gap)', () => {
    const map = new Map<string, Date[]>([
      ['Bread', [d('2026-06-20'), d('2026-06-27'), d('2026-07-04')]], // last 4 days ago, median 7
    ]);
    const res = predictRestock(map, NOW);
    expect(res[0].dueInDays).toBeGreaterThan(0);
  });

  it('ignores products with fewer than 3 purchases', () => {
    const map = new Map<string, Date[]>([['Rare', [d('2026-06-01'), d('2026-07-01')]]]);
    expect(predictRestock(map, NOW)).toEqual([]);
  });

  it('sorts most-overdue first', () => {
    const map = new Map<string, Date[]>([
      ['A', [d('2026-06-24'), d('2026-07-01'), d('2026-07-07')]], // median 6.5, last 1d ago → not overdue
      ['B', [d('2026-06-01'), d('2026-06-08'), d('2026-06-15')]], // median 7, last 23d ago → very overdue
    ]);
    const res = predictRestock(map, NOW);
    expect(res[0].canonicalName).toBe('B');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/modules/shopping-list/restock-predictor.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/shopping-list/restock-predictor.ts
import type { RestockSuggestion } from '@budget/shared-types';

const MIN_PURCHASES = 3;
const DAY_MS = 86_400_000;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function predictRestock(
  purchasesByProduct: Map<string, Date[]>,
  now: Date = new Date(),
): RestockSuggestion[] {
  const out: RestockSuggestion[] = [];
  for (const [canonicalName, datesRaw] of purchasesByProduct.entries()) {
    const dates = [...datesRaw].sort((a, b) => a.getTime() - b.getTime());
    if (dates.length < MIN_PURCHASES) continue;
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      gaps.push((dates[i].getTime() - dates[i - 1].getTime()) / DAY_MS);
    }
    const medianGapDays = median(gaps);
    if (medianGapDays <= 0) continue;
    const last = dates[dates.length - 1];
    const daysSinceLast = (now.getTime() - last.getTime()) / DAY_MS;
    out.push({
      canonicalName,
      lastPurchase: last.toISOString().slice(0, 10),
      medianGapDays: Math.round(medianGapDays * 10) / 10,
      dueInDays: Math.round(medianGapDays - daysSinceLast),
      purchaseCount: dates.length,
    });
  }
  return out.sort((a, b) => a.dueInDays - b.dueInDays);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/api && npx jest src/modules/shopping-list/restock-predictor.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/shopping-list/restock-predictor.ts apps/api/src/modules/shopping-list/restock-predictor.spec.ts
git commit -m "feat(shopping-list): pure restock predictor (median-gap) with tests"
```

---

### Task 4: Suggestions service + endpoint

**Files:**
- Modify: `apps/api/src/modules/shopping-list/shopping-list.service.ts` (add `getRestockSuggestions`)
- Modify: `apps/api/src/modules/shopping-list/shopping-list.controller.ts` (add `GET suggestions`)
- Test: `apps/api/src/modules/shopping-list/shopping-list.service.spec.ts` (add a case)

**Interfaces:**
- Produces: `ShoppingListService.getRestockSuggestions(accountId): Promise<RestockSuggestion[]>`; `GET /shopping-list/suggestions`.
- Consumes: `predictRestock` (Task 3).

- [ ] **Step 1: Write the failing service test**

Add to `shopping-list.service.spec.ts` (extend the prisma mock with `expenseItem.findMany` + `productAlias.findMany` + `shoppingListItem.findMany`):

```ts
it('getRestockSuggestions returns due products excluding those already on a list', async () => {
  prisma.productAlias.findMany.mockResolvedValue([]);
  prisma.expenseItem.findMany.mockResolvedValue([
    { canonicalName: 'Milk', expense: { date: new Date('2026-06-07') } },
    { canonicalName: 'Milk', expense: { date: new Date('2026-06-14') } },
    { canonicalName: 'Milk', expense: { date: new Date('2026-06-21') } },
    { canonicalName: 'Bread', expense: { date: new Date('2026-06-01') } },
    { canonicalName: 'Bread', expense: { date: new Date('2026-06-08') } },
    { canonicalName: 'Bread', expense: { date: new Date('2026-06-15') } },
  ]);
  // Bread is already on a list → excluded
  prisma.shoppingListItem.findMany.mockResolvedValue([{ canonicalName: 'Bread' }]);
  const res = await service.getRestockSuggestions('a1');
  expect(res.every((s) => s.canonicalName !== 'Bread')).toBe(true);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/api && npx jest src/modules/shopping-list/shopping-list.service.spec.ts -t getRestockSuggestions`
Expected: FAIL.

- [ ] **Step 3: Implement the service method**

Add the import `import { predictRestock } from './restock-predictor';` and `import type { RestockSuggestion } from '@budget/shared-types';`, then:

```ts
  async getRestockSuggestions(accountId: string): Promise<RestockSuggestion[]> {
    // Alias resolution (mirror price-history: alias.canonicalName overrides item.canonicalName)
    const aliases: Array<{ rawName: string; canonicalName: string }> =
      await (this.prisma as any).productAlias.findMany({ where: { accountId }, select: { rawName: true, canonicalName: true } });
    const aliasMap = new Map(aliases.map((a) => [a.rawName, a.canonicalName]));

    const items: Array<{ canonicalName: string; expense: { date: Date } }> =
      await (this.prisma as any).expenseItem.findMany({
        where: { expense: { accountId, isDeleted: false }, canonicalName: { not: null }, isDeleted: false },
        select: { canonicalName: true, expense: { select: { date: true } } },
      });

    const byProduct = new Map<string, Date[]>();
    for (const it of items) {
      const resolved = aliasMap.get(it.canonicalName) ?? it.canonicalName;
      if (resolved === '__ignored__') continue;
      const arr = byProduct.get(resolved) ?? [];
      arr.push(it.expense.date);
      byProduct.set(resolved, arr);
    }

    // Exclude products already present as a non-deleted item on any list in this account
    const onList: Array<{ canonicalName: string | null }> = await this.prisma.shoppingListItem.findMany({
      where: { accountId, isDeleted: false, canonicalName: { not: null } },
      select: { canonicalName: true },
    });
    const listed = new Set(onList.map((i) => i.canonicalName));

    return predictRestock(byProduct)
      .filter((s) => s.dueInDays <= 0 && !listed.has(s.canonicalName));
  }
```

- [ ] **Step 4: Add the endpoint**

In `shopping-list.controller.ts`, add (declare BEFORE the dynamic `:id` routes, alongside the item routes):

```ts
  // GET /shopping-list/suggestions
  @Get('suggestions')
  getSuggestions(@Req() req: AuthenticatedRequest) {
    return this.service.getRestockSuggestions(req.accountId);
  }
```

- [ ] **Step 5: Run test + typecheck**

Run: `cd apps/api && npx jest src/modules/shopping-list/shopping-list.service.spec.ts -t getRestockSuggestions` → PASS.
Run: `cd apps/api && npx tsc --noEmit` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/shopping-list
git commit -m "feat(shopping-list): restock suggestions service + GET /suggestions"
```

---

### Task 5: Notification plumbing (gate, preferences, i18n)

**Files:**
- Modify: `apps/api/src/modules/notifications/notifications.service.ts` (select + gate)
- Modify: `apps/api/src/modules/users/users.service.ts` (get/update preferences)
- Modify: `apps/api/src/modules/users/users.controller.ts` (PATCH body type)
- Modify: `apps/api/src/modules/notifications/notification-i18n.ts` (9 languages + accessors)

- [ ] **Step 1: sendToUser select + gate**

In `notifications.service.ts`: add `notifyShoppingReminders: true` to the `select` (the block at ~37-50), and add this line right after the `trip_settle_up` gate (~66):

```ts
if (notificationType === 'shopping_reminder' && !user.notifyShoppingReminders) return false;
```

- [ ] **Step 2: users.service preferences**

In `getNotificationPreferences`: add `notifyShoppingReminders: true` to the `select` and `shoppingReminders: user?.notifyShoppingReminders ?? true` to the returned object. In `updateNotificationPreferences`: add `shoppingReminders?: boolean` to the `prefs` param type and `if (prefs.shoppingReminders !== undefined) data.notifyShoppingReminders = prefs.shoppingReminders;`. In `users.controller.ts` PATCH body type, add `shoppingReminders?: boolean`.

- [ ] **Step 3: notification-i18n entries (all 9 languages)**

Add to the interface (near `trackingGapTitle`/`Body`):

```ts
  shoppingReminderTitle: () => string;
  shoppingReminderBody: (product: string, extraCount: number) => string;
```

Add to EACH of the 9 language blocks (en/ru/ua/pl/es/fr/de/be/nl) a genuine translation of the English:

```ts
  // en
  shoppingReminderTitle: () => 'Time to restock?',
  shoppingReminderBody: (product: string, extraCount: number) =>
    extraCount > 0
      ? `You usually rebuy ${product} and ${extraCount} more around now.`
      : `You usually rebuy ${product} around now.`,
```

Add the two exported accessors:

```ts
export function shoppingReminderTitle(lang: Lang): string {
  return t(lang).shoppingReminderTitle();
}
export function shoppingReminderBody(lang: Lang, product: string, extraCount: number): string {
  return t(lang).shoppingReminderBody(product, extraCount);
}
```

- [ ] **Step 4: Typecheck + commit**

Run: `cd apps/api && npx tsc --noEmit` → PASS.
```bash
git add apps/api/src/modules/notifications apps/api/src/modules/users
git commit -m "feat(notifications): shopping_reminder gate, preference, 9-lang i18n"
```

---

### Task 6: shopping-reminder cron

**Files:**
- Create: `apps/api/src/modules/shopping-list/shopping-reminder.cron.ts`
- Modify: `apps/api/src/modules/shopping-list/shopping-list.module.ts` (register the cron; ensure `NotificationsService` is injectable — import `NotificationsModule` if it is not `@Global()`)
- Test: `apps/api/src/modules/shopping-list/shopping-reminder.cron.spec.ts`

**Interfaces:**
- Consumes: `ShoppingListService.getRestockSuggestions` (Task 4), `NotificationsService.sendToUser`, `notification-i18n` accessors (Task 5).

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/shopping-list/shopping-reminder.cron.spec.ts
import { Test } from '@nestjs/testing';
import { ShoppingReminderCron } from './shopping-reminder.cron';
import { ShoppingListService } from './shopping-list.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../database/prisma.service';

describe('ShoppingReminderCron', () => {
  it('sends one shopping_reminder to each eligible member when there are due products', async () => {
    const prisma = {
      account: { findMany: jest.fn().mockResolvedValue([{ id: 'a1' }]) },
      accountMember: { findMany: jest.fn().mockResolvedValue([{ userId: 'u1', user: { id: 'u1', notifyShoppingReminders: true, pushToken: 'tok', isActive: true } }]) },
    };
    const svc = { getRestockSuggestions: jest.fn().mockResolvedValue([{ canonicalName: 'Milk', dueInDays: -2 }, { canonicalName: 'Eggs', dueInDays: -1 }]) };
    const notif = { sendToUser: jest.fn().mockResolvedValue(true) };
    const mod = await Test.createTestingModule({
      providers: [
        ShoppingReminderCron,
        { provide: ShoppingListService, useValue: svc },
        { provide: NotificationsService, useValue: notif },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    await mod.get(ShoppingReminderCron).handleShoppingReminders();
    expect(notif.sendToUser).toHaveBeenCalledTimes(1);
    expect(notif.sendToUser.mock.calls[0][4]).toBe('shopping_reminder'); // notificationType arg
  });

  it('sends nothing when there are no due products', async () => {
    const prisma = {
      account: { findMany: jest.fn().mockResolvedValue([{ id: 'a1' }]) },
      accountMember: { findMany: jest.fn().mockResolvedValue([{ userId: 'u1', user: { id: 'u1', notifyShoppingReminders: true, pushToken: 'tok', isActive: true } }]) },
    };
    const svc = { getRestockSuggestions: jest.fn().mockResolvedValue([]) };
    const notif = { sendToUser: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [ShoppingReminderCron, { provide: ShoppingListService, useValue: svc }, { provide: NotificationsService, useValue: notif }, { provide: PrismaService, useValue: prisma }],
    }).compile();
    await mod.get(ShoppingReminderCron).handleShoppingReminders();
    expect(notif.sendToUser).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/api && npx jest src/modules/shopping-list/shopping-reminder.cron.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the cron** (mirror `tracking-gap-reminder.cron.ts`)

```ts
// apps/api/src/modules/shopping-list/shopping-reminder.cron.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ShoppingListService } from './shopping-list.service';
import * as ni18n from '../notifications/notification-i18n';

@Injectable()
export class ShoppingReminderCron {
  private readonly logger = new Logger(ShoppingReminderCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly shoppingListService: ShoppingListService,
  ) {}

  @Cron('0 10 * * *')
  async handleShoppingReminders() {
    // Accounts with at least one canonical-named receipt item in the last 60 days (active grocery trackers)
    const since = new Date(Date.now() - 60 * 86_400_000);
    const accounts = await this.prisma.account.findMany({
      where: { expenses: { some: { isDeleted: false, date: { gte: since }, items: { some: { canonicalName: { not: null }, isDeleted: false } } } } },
      select: { id: true },
    });

    for (const account of accounts) {
      let due;
      try {
        due = await this.shoppingListService.getRestockSuggestions(account.id);
      } catch (e) {
        this.logger.warn(`restock suggestions failed for ${account.id}`, e as Error);
        continue;
      }
      if (!due.length) continue;

      const top = due[0].canonicalName;
      const extra = due.length - 1;
      const members = await this.prisma.accountMember.findMany({
        where: { accountId: account.id, user: { notifyShoppingReminders: true, pushToken: { not: null }, isActive: true } },
        select: { userId: true },
      });
      for (const m of members) {
        this.notificationsService
          .sendToUser(
            m.userId,
            (lang) => ni18n.shoppingReminderTitle(lang),
            (lang) => ni18n.shoppingReminderBody(lang, top, extra),
            { type: 'shopping_reminder' },
            'shopping_reminder',
          )
          .catch(() => {});
      }
    }
  }
}
```

- [ ] **Step 4: Register in the module**

In `shopping-list.module.ts` add `ShoppingReminderCron` to `providers`. If `NotificationsService` is not resolvable (i.e. `NotificationsModule` is not `@Global()`), add `imports: [NotificationsModule]`. (Check `notifications.module.ts` / how `gamification.module.ts` resolves it — `TrackingGapReminderCron` works without an explicit import, so `NotificationsService` is app-wide; mirror that.)

- [ ] **Step 5: Run tests + typecheck**

Run: `cd apps/api && npx jest src/modules/shopping-list/shopping-reminder.cron.spec.ts` → PASS (2).
Run: `cd apps/api && npx tsc --noEmit` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/shopping-list
git commit -m "feat(shopping-list): daily shopping-reminder cron"
```

---

### Task 7: Mobile — suggestions strip, api, deep-link, notification toggle

**Files:**
- Modify: `apps/mobile/src/services/shoppingLists.api.ts` (`getRestockSuggestions`)
- Modify: `apps/mobile/src/services/users.api.ts` (add `shoppingReminders` to the get/update preference types)
- Modify: `apps/mobile/src/stores/shoppingListStore.ts` (`suggestions` state + `loadSuggestions()`)
- Modify: `apps/mobile/app/shopping-list/index.tsx` (render the "Time to restock" strip)
- Modify: `apps/mobile/src/services/notifications.ts` (deep-link `shopping_reminder` → `/shopping-list`)
- Modify: `apps/mobile/app/settings/notifications.tsx` (preference toggle)

- [ ] **Step 1: API client method**

In `shoppingLists.api.ts` add: `getRestockSuggestions() { return httpClient.request<RestockSuggestion[]>('/shopping-list/suggestions'); }` (import `RestockSuggestion`). In `users.api.ts`, add `shoppingReminders?: boolean` to the get-response inline type and the update-param inline type.

- [ ] **Step 2: Store**

In `shoppingListStore.ts` add `suggestions: RestockSuggestion[]` state and `loadSuggestions()` (`api.getRestockSuggestions()` → `set({ suggestions })`, `console.warn` on failure — server-only, no offline cache needed). Call `loadSuggestions()` inside `hydrate()`.

- [ ] **Step 3: List-screen strip**

In `app/shopping-list/index.tsx`, above the item list render a horizontal "Time to restock" strip (only when `suggestions.length > 0`): a `t('shoppingList.restockTitle')` header + chips, each showing `suggestion.canonicalName`; tapping a chip → `addItem(suggestion.canonicalName, suggestion.canonicalName, 1)` and it disappears from the strip (already-listed items are excluded server-side on the next `loadSuggestions`). Available to all members (not `canEdit`-gated).

- [ ] **Step 4: Deep-link**

In `src/services/notifications.ts` `handleNotificationResponse` switch, add before `default`:

```ts
case 'shopping_reminder':
  router.push('/shopping-list' as any);
  break;
```

- [ ] **Step 5: Notification toggle**

In `app/settings/notifications.tsx`: add `notifShoppingReminders` state, load it from `prefs.shoppingReminders ?? true`, a `handleToggleShoppingReminders` (optimistic + rollback, mirror `handleToggleTrackingGap`), include it in the master `handleToggleAllNotifications` aggregate, and a `Switch` row with `t('notifications.shoppingReminder')`/`...Desc`.

- [ ] **Step 6: Typecheck + commit**

Run: `cd apps/mobile && npx tsc --noEmit` → PASS.
```bash
git add apps/mobile/src/services/shoppingLists.api.ts apps/mobile/src/services/users.api.ts apps/mobile/src/stores/shoppingListStore.ts apps/mobile/app/shopping-list/index.tsx apps/mobile/src/services/notifications.ts apps/mobile/app/settings/notifications.tsx
git commit -m "feat(mobile): restock suggestions strip + reminder toggle + deep-link"
```

---

### Task 8: Mobile i18n

**Files:**
- Modify: all 9 `apps/mobile/src/i18n/locales/*.ts`

- [ ] **Step 1: Add keys to `en.ts`**

Under `shoppingList`: `restockTitle: 'Time to restock'`. Under `notifications`: `shoppingReminder: 'Restock reminders'`, `shoppingReminderDesc: 'Get reminded when you\'re due to rebuy a regular item'`.

- [ ] **Step 2: Propagate to the other 8 locales** (genuine translations) via the `i18n-add-strings` skill. Verify all 9 files have the 3 keys.

- [ ] **Step 3: Typecheck + commit**

Run: `cd apps/mobile && npx tsc --noEmit` → PASS.
```bash
git add apps/mobile/src/i18n/locales
git commit -m "feat(mobile): restock i18n across 9 locales"
```

---

### Task 9: Final verification

- [ ] **Step 1:** `cd apps/api && npx tsc --noEmit && npx jest src/modules/shopping-list src/modules/notifications` — shopping-list + notification suites green (price-history baseline = the 2 known `computeInflationIndex` failures only).
- [ ] **Step 2:** `cd apps/mobile && npx tsc --noEmit` → clean; `npx jest` → only the known baseline failures (notificationParser CHF/CZK + invitationStore); no new failures.
- [ ] **Step 3:** `cd apps/api && npm run build` → succeeds (DI resolves the cron).
- [ ] **Step 4:** i18n parity: all 9 mobile locales have `shoppingList.restockTitle` + `notifications.shoppingReminder`/`Desc`; all 9 API `notification-i18n` blocks have `shoppingReminderTitle`/`Body`.

---

## Self-Review

**Spec coverage (M3):**
- Pure median-gap predictor + tests → Task 3. ✓
- `GET /shopping-list/suggestions` (free, excludes already-listed) → Task 4. ✓
- `shopping-reminder.cron.ts` daily push → Task 6. ✓
- `shopping_reminder` NotificationType + `notifyShoppingReminders` preference + 9-lang i18n + preference API → Tasks 1, 2, 5. ✓
- Mobile suggestions strip + toggle + deep-link + i18n → Tasks 7, 8. ✓

**Placeholder scan:** predictor + notification gate + cron have complete code; i18n/mobile-UI steps give exact keys and the concrete mirror files.

**Type consistency:** `predictRestock(Map<string,Date[]>, now?) → RestockSuggestion[]` used identically in Task 3/4; `RestockSuggestion` shape consistent across shared-types/service/mobile; `shopping_reminder` string identical in NotificationType, gate, cron arg, deep-link.

## Roadmap — remaining
Plan 4 (M4 Geo) · Plan 5 (M5 Multi-list UI) · Plan 6 (M6 Deals — reuses this cron + a `shopping_deal` type).
