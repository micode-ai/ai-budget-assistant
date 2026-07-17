# Shopping Reminder / Deal Push De-duplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the daily-repeating `shopping_reminder` / `shopping_deal` pushes by remembering what was already sent — restock reminders fire once per purchase cycle, deals once per store per week, with a soft per-account global floor.

**Architecture:** A new `shopping_notification_log` table records a per-account `dedupKey` for each push actually sent (anomaly-alerts convention: insert + catch P2002 = "already sent" → skip, no transaction). A pure util builds the keys; a thin `ShoppingNotificationLedger` service does the Prisma IO; `ShoppingReminderCron` is rewritten to gate each send through the ledger and a global floor, and gains a daily cleanup cron.

**Tech Stack:** NestJS 10, Prisma 5 (PostgreSQL), `@nestjs/schedule` cron, Jest.

## Global Constraints

- Service method signature convention: account-scoped queries filter by `accountId`. Reference doc: `CLAUDE.md` → API patterns.
- Dedup discipline copies `anomaly_alerts`: `@@unique([accountId, dedupKey])`, insert-and-catch-`P2002` **outside** any `$transaction` (Postgres poisons a tx on the first unique violation — ABA-313).
- Migrations are authored **DB-free** (no local DB); hand-write `migration.sql` to match `schema.prisma`, then `npx prisma generate`. Prod applies via `prisma migrate deploy` in the deploy migrator.
- Do NOT import runtime values from `@budget/shared-*` in `apps/api` — `import type` only.
- No mobile change, no i18n change: `shopping_reminder` / `shopping_deal` notification types, bodies, and the `notifyShoppingReminders` / `notifyShoppingDeals` preference gates are unchanged.
- Env: `SHOPPING_REMINDER_MIN_GAP_DAYS` — per-account, per-type minimum days between sends. Default **2**. Clamp `>= 0`; `0` disables the floor (per-cycle dedup still applies).

---

### Task 1: Schema + migration for `shopping_notification_log`

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (add model + `Account` back-relation)
- Create: `apps/api/prisma/migrations/20260717120000_add_shopping_notification_log/migration.sql`

**Interfaces:**
- Produces: Prisma model `ShoppingNotificationLog` with fields `id`, `accountId`, `type`, `dedupKey`, `sentAt`; unique `(accountId, dedupKey)`; index `(accountId, type, sentAt)`. Prisma client accessor `prisma.shoppingNotificationLog`.

- [ ] **Step 1: Add the model to `schema.prisma`**

Add near the other shopping-list models:

```prisma
model ShoppingNotificationLog {
  id        String   @id @default(uuid())
  accountId String   @map("account_id")
  type      String
  dedupKey  String   @map("dedup_key")
  sentAt    DateTime @default(now()) @map("sent_at")

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@unique([accountId, dedupKey])
  @@index([accountId, type, sentAt])
  @@map("shopping_notification_log")
}
```

- [ ] **Step 2: Add the back-relation to the `Account` model**

In `model Account { ... }`, add alongside its other relation arrays (e.g. near `shoppingLists`):

```prisma
  shoppingNotificationLogs ShoppingNotificationLog[]
```

- [ ] **Step 3: Hand-author the migration SQL (DB-free)**

Create `apps/api/prisma/migrations/20260717120000_add_shopping_notification_log/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "shopping_notification_log" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dedup_key" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopping_notification_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shopping_notification_log_account_id_dedup_key_key" ON "shopping_notification_log"("account_id", "dedup_key");

-- CreateIndex
CREATE INDEX "shopping_notification_log_account_id_type_sent_at_idx" ON "shopping_notification_log"("account_id", "type", "sent_at");

-- AddForeignKey
ALTER TABLE "shopping_notification_log" ADD CONSTRAINT "shopping_notification_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Validate schema and regenerate the client**

Run (from `apps/api/`):
```bash
npx prisma validate && npx prisma generate
```
Expected: `The schema at prisma\schema.prisma is valid` and `Generated Prisma Client`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260717120000_add_shopping_notification_log/migration.sql
git commit -m "feat(shopping-list): add shopping_notification_log dedup table"
```

---

### Task 2: Pure dedup-key util

**Files:**
- Create: `apps/api/src/modules/shopping-list/shopping-notification-dedup.util.ts`
- Test: `apps/api/src/modules/shopping-list/shopping-notification-dedup.util.spec.ts`

**Interfaces:**
- Produces:
  - `restockDedupKey(canonicalName: string, lastPurchaseISO: string): string` → `restock:{canonicalName}:{lastPurchaseISO}`
  - `dealDedupKey(canonicalName: string, merchant: string, week: string): string` → `deal:{canonicalName}:{merchant}:{week}`
  - `weekBucket(d: Date): string` → the Monday (UTC) of `d`'s week as `YYYY-MM-DD`

- [ ] **Step 1: Write the failing test**

Create `shopping-notification-dedup.util.spec.ts`:

```typescript
import { restockDedupKey, dealDedupKey, weekBucket } from './shopping-notification-dedup.util';

describe('shopping-notification-dedup.util', () => {
  it('builds a restock key bound to the last-purchase date', () => {
    expect(restockDedupKey('Bread', '2026-07-13')).toBe('restock:Bread:2026-07-13');
  });

  it('builds a deal key bound to product, merchant and week', () => {
    expect(dealDedupKey('Milk', 'Lidl', '2026-07-13')).toBe('deal:Milk:Lidl:2026-07-13');
  });

  it('weekBucket returns the Monday (UTC) of the given date', () => {
    expect(weekBucket(new Date('2026-07-13T00:00:00Z'))).toBe('2026-07-13'); // Monday
    expect(weekBucket(new Date('2026-07-17T09:30:00Z'))).toBe('2026-07-13'); // Friday
    expect(weekBucket(new Date('2026-07-19T23:00:00Z'))).toBe('2026-07-13'); // Sunday
    expect(weekBucket(new Date('2026-07-20T00:00:00Z'))).toBe('2026-07-20'); // next Monday
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/api/`): `npx jest shopping-notification-dedup.util -t "restock key"`
Expected: FAIL — `Cannot find module './shopping-notification-dedup.util'`.

- [ ] **Step 3: Write the util**

Create `shopping-notification-dedup.util.ts`:

```typescript
const DAY_MS = 86_400_000;

/** Monday (UTC) of the week containing `d`, as an ISO date string YYYY-MM-DD. */
export function weekBucket(d: Date): string {
  const utcMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dayNum = (new Date(utcMidnight).getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  const monday = new Date(utcMidnight - dayNum * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

export function restockDedupKey(canonicalName: string, lastPurchaseISO: string): string {
  return `restock:${canonicalName}:${lastPurchaseISO}`;
}

export function dealDedupKey(canonicalName: string, merchant: string, week: string): string {
  return `deal:${canonicalName}:${merchant}:${week}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/api/`): `npx jest shopping-notification-dedup.util`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/shopping-list/shopping-notification-dedup.util.ts apps/api/src/modules/shopping-list/shopping-notification-dedup.util.spec.ts
git commit -m "feat(shopping-list): pure dedup-key util for reminder de-duplication"
```

---

### Task 3: `ShoppingNotificationLedger` service (Prisma IO) + module wiring

**Files:**
- Create: `apps/api/src/modules/shopping-list/shopping-notification-ledger.service.ts`
- Test: `apps/api/src/modules/shopping-list/shopping-notification-ledger.service.spec.ts`
- Modify: `apps/api/src/modules/shopping-list/shopping-list.module.ts`

**Interfaces:**
- Consumes: `prisma.shoppingNotificationLog` (Task 1), `PrismaService`.
- Produces class `ShoppingNotificationLedger` with:
  - `tryRecord(accountId: string, type: string, dedupKey: string): Promise<boolean>` — `true` if the row was newly inserted (send allowed), `false` on P2002 (already sent).
  - `withinFloor(accountId: string, type: string, minGapDays: number, now?: Date): Promise<boolean>` — `true` if a row of this type was sent within `minGapDays` (⇒ caller should skip). Always `false` when `minGapDays <= 0`.
  - `deleteOlderThan(days: number, now?: Date): Promise<number>` — deletes rows with `sentAt` older than `days`; returns count.

- [ ] **Step 1: Write the failing test**

Create `shopping-notification-ledger.service.spec.ts`:

```typescript
import { Prisma } from '@prisma/client';
import { ShoppingNotificationLedger } from './shopping-notification-ledger.service';

function makePrisma() {
  return {
    shoppingNotificationLog: {
      create: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
}

const P2002 = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });

describe('ShoppingNotificationLedger', () => {
  it('tryRecord returns true when the row is newly inserted', async () => {
    const prisma = makePrisma();
    prisma.shoppingNotificationLog.create.mockResolvedValue({ id: 'r1' });
    const led = new ShoppingNotificationLedger(prisma as any);
    await expect(led.tryRecord('a1', 'shopping_reminder', 'restock:Bread:2026-07-13')).resolves.toBe(true);
    expect(prisma.shoppingNotificationLog.create).toHaveBeenCalledWith({
      data: { accountId: 'a1', type: 'shopping_reminder', dedupKey: 'restock:Bread:2026-07-13' },
    });
  });

  it('tryRecord returns false on P2002 (already sent this cycle)', async () => {
    const prisma = makePrisma();
    prisma.shoppingNotificationLog.create.mockRejectedValue(P2002);
    const led = new ShoppingNotificationLedger(prisma as any);
    await expect(led.tryRecord('a1', 'shopping_reminder', 'k')).resolves.toBe(false);
  });

  it('tryRecord rethrows non-P2002 errors', async () => {
    const prisma = makePrisma();
    prisma.shoppingNotificationLog.create.mockRejectedValue(new Error('db down'));
    const led = new ShoppingNotificationLedger(prisma as any);
    await expect(led.tryRecord('a1', 'shopping_deal', 'k')).rejects.toThrow('db down');
  });

  it('withinFloor is false when minGapDays <= 0 (floor disabled), without querying', async () => {
    const prisma = makePrisma();
    const led = new ShoppingNotificationLedger(prisma as any);
    await expect(led.withinFloor('a1', 'shopping_reminder', 0)).resolves.toBe(false);
    expect(prisma.shoppingNotificationLog.findFirst).not.toHaveBeenCalled();
  });

  it('withinFloor is false when no prior send exists', async () => {
    const prisma = makePrisma();
    prisma.shoppingNotificationLog.findFirst.mockResolvedValue(null);
    const led = new ShoppingNotificationLedger(prisma as any);
    await expect(led.withinFloor('a1', 'shopping_reminder', 2)).resolves.toBe(false);
  });

  it('withinFloor is true when the last send is within the gap window', async () => {
    const now = new Date('2026-07-17T10:00:00Z');
    const prisma = makePrisma();
    prisma.shoppingNotificationLog.findFirst.mockResolvedValue({ sentAt: new Date('2026-07-16T10:00:00Z') }); // 1 day ago
    const led = new ShoppingNotificationLedger(prisma as any);
    await expect(led.withinFloor('a1', 'shopping_reminder', 2, now)).resolves.toBe(true);
  });

  it('withinFloor is false when the last send is older than the gap window', async () => {
    const now = new Date('2026-07-17T10:00:00Z');
    const prisma = makePrisma();
    prisma.shoppingNotificationLog.findFirst.mockResolvedValue({ sentAt: new Date('2026-07-14T09:00:00Z') }); // >2 days ago
    const led = new ShoppingNotificationLedger(prisma as any);
    await expect(led.withinFloor('a1', 'shopping_reminder', 2, now)).resolves.toBe(false);
  });

  it('deleteOlderThan deletes rows older than N days and returns the count', async () => {
    const now = new Date('2026-07-17T00:00:00Z');
    const prisma = makePrisma();
    prisma.shoppingNotificationLog.deleteMany.mockResolvedValue({ count: 5 });
    const led = new ShoppingNotificationLedger(prisma as any);
    await expect(led.deleteOlderThan(90, now)).resolves.toBe(5);
    const arg = prisma.shoppingNotificationLog.deleteMany.mock.calls[0][0];
    expect(arg.where.sentAt.lt).toEqual(new Date('2026-04-18T00:00:00Z')); // now - 90 days
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/api/`): `npx jest shopping-notification-ledger.service`
Expected: FAIL — `Cannot find module './shopping-notification-ledger.service'`.

- [ ] **Step 3: Write the service**

Create `shopping-notification-ledger.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

const DAY_MS = 86_400_000;

function isP2002(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/**
 * Records which shopping pushes were already sent, so the daily cron does not
 * re-send the same restock reminder every day. Mirrors the anomaly-alerts
 * dedup convention: insert + catch P2002 = "already sent" → skip (no $transaction).
 */
@Injectable()
export class ShoppingNotificationLedger {
  constructor(private readonly prisma: PrismaService) {}

  /** @returns true if newly inserted (send allowed); false if already recorded (P2002). */
  async tryRecord(accountId: string, type: string, dedupKey: string): Promise<boolean> {
    try {
      await this.prisma.shoppingNotificationLog.create({ data: { accountId, type, dedupKey } });
      return true;
    } catch (e) {
      if (isP2002(e)) return false;
      throw e;
    }
  }

  /** @returns true if a push of `type` was sent within `minGapDays` (caller should skip). */
  async withinFloor(accountId: string, type: string, minGapDays: number, now: Date = new Date()): Promise<boolean> {
    if (minGapDays <= 0) return false;
    const last = await this.prisma.shoppingNotificationLog.findFirst({
      where: { accountId, type },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    });
    if (!last) return false;
    return now.getTime() - last.sentAt.getTime() < minGapDays * DAY_MS;
  }

  /** Deletes log rows older than `days`; returns the number deleted. */
  async deleteOlderThan(days: number, now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - days * DAY_MS);
    const { count } = await this.prisma.shoppingNotificationLog.deleteMany({ where: { sentAt: { lt: cutoff } } });
    return count;
  }
}
```

- [ ] **Step 4: Register the provider**

Modify `shopping-list.module.ts` to add the ledger to `providers`:

```typescript
import { Module } from '@nestjs/common';
import { ShoppingListController } from './shopping-list.controller';
import { ShoppingListService } from './shopping-list.service';
import { ShoppingReminderCron } from './shopping-reminder.cron';
import { ShoppingNotificationLedger } from './shopping-notification-ledger.service';

@Module({
  controllers: [ShoppingListController],
  providers: [ShoppingListService, ShoppingReminderCron, ShoppingNotificationLedger],
  exports: [ShoppingListService],
})
export class ShoppingListModule {}
```

- [ ] **Step 5: Run tests to verify they pass**

Run (from `apps/api/`): `npx jest shopping-notification-ledger.service`
Expected: PASS — 8 tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/shopping-list/shopping-notification-ledger.service.ts apps/api/src/modules/shopping-list/shopping-notification-ledger.service.spec.ts apps/api/src/modules/shopping-list/shopping-list.module.ts
git commit -m "feat(shopping-list): notification ledger service (dedup + global floor + cleanup)"
```

---

### Task 4: Rewrite the cron to gate sends + add cleanup cron

**Files:**
- Modify: `apps/api/src/modules/shopping-list/shopping-reminder.cron.ts`
- Modify (rewrite): `apps/api/src/modules/shopping-list/shopping-reminder.cron.spec.ts`

**Interfaces:**
- Consumes: `ShoppingNotificationLedger.withinFloor` / `.tryRecord` / `.deleteOlderThan` (Task 3); `restockDedupKey` / `dealDedupKey` / `weekBucket` (Task 2); `RestockSuggestion.lastPurchase`, `DealSuggestion.merchant` (existing shared-types).
- Produces: unchanged public cron entrypoint `handleShoppingReminders()` + new `cleanupOldLogs()`.

- [ ] **Step 1: Rewrite the cron spec (failing tests first)**

Replace the contents of `shopping-reminder.cron.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { ShoppingReminderCron } from './shopping-reminder.cron';
import { ShoppingListService } from './shopping-list.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../database/prisma.service';
import { ShoppingNotificationLedger } from './shopping-notification-ledger.service';

const MEMBER = { userId: 'u1', user: { id: 'u1', notifyShoppingReminders: true, notifyShoppingDeals: true, pushToken: 'tok', isActive: true } };

function build(overrides: {
  restock?: any[];
  deals?: any[];
  withinFloor?: jest.Mock;
  tryRecord?: jest.Mock;
}) {
  const prisma = {
    account: { findMany: jest.fn().mockResolvedValue([{ id: 'a1' }]) },
    accountMember: { findMany: jest.fn().mockResolvedValue([MEMBER]) },
  };
  const svc = {
    getRestockSuggestions: jest.fn().mockResolvedValue(overrides.restock ?? []),
    getDeals: jest.fn().mockResolvedValue(overrides.deals ?? []),
  };
  const notif = { sendToUser: jest.fn().mockResolvedValue(true) };
  const ledger = {
    withinFloor: overrides.withinFloor ?? jest.fn().mockResolvedValue(false),
    tryRecord: overrides.tryRecord ?? jest.fn().mockResolvedValue(true),
    deleteOlderThan: jest.fn().mockResolvedValue(0),
  };
  return { prisma, svc, notif, ledger };
}

async function make(parts: ReturnType<typeof build>) {
  const mod = await Test.createTestingModule({
    providers: [
      ShoppingReminderCron,
      { provide: ShoppingListService, useValue: parts.svc },
      { provide: NotificationsService, useValue: parts.notif },
      { provide: PrismaService, useValue: parts.prisma },
      { provide: ShoppingNotificationLedger, useValue: parts.ledger },
    ],
  }).compile();
  return mod.get(ShoppingReminderCron);
}

describe('ShoppingReminderCron', () => {
  it('sends one shopping_reminder and records the per-cycle dedup key', async () => {
    const parts = build({ restock: [{ canonicalName: 'Bread', lastPurchase: '2026-07-13', dueInDays: -2 }, { canonicalName: 'Eggs', lastPurchase: '2026-07-14', dueInDays: -1 }] });
    const cron = await make(parts);
    await cron.handleShoppingReminders();
    expect(parts.ledger.tryRecord).toHaveBeenCalledWith('a1', 'shopping_reminder', 'restock:Bread:2026-07-13');
    expect(parts.notif.sendToUser).toHaveBeenCalledTimes(1);
    expect(parts.notif.sendToUser.mock.calls[0][4]).toBe('shopping_reminder');
  });

  it('does NOT send when the key was already recorded this cycle (tryRecord=false)', async () => {
    const parts = build({ restock: [{ canonicalName: 'Bread', lastPurchase: '2026-07-13', dueInDays: -2 }], tryRecord: jest.fn().mockResolvedValue(false) });
    const cron = await make(parts);
    await cron.handleShoppingReminders();
    expect(parts.notif.sendToUser).not.toHaveBeenCalled();
  });

  it('does NOT send (and does not record) when within the global floor', async () => {
    const parts = build({ restock: [{ canonicalName: 'Bread', lastPurchase: '2026-07-13', dueInDays: -2 }], withinFloor: jest.fn().mockResolvedValue(true) });
    const cron = await make(parts);
    await cron.handleShoppingReminders();
    expect(parts.ledger.tryRecord).not.toHaveBeenCalled();
    expect(parts.notif.sendToUser).not.toHaveBeenCalled();
  });

  it('sends a shopping_deal keyed by product+merchant+week', async () => {
    const parts = build({ deals: [{ canonicalName: 'Milk', merchant: 'Lidl', dropPct: 20, price: 4, avgPrice: 5, currency: 'PLN' }] });
    const cron = await make(parts);
    await cron.handleShoppingReminders();
    const dealCall = parts.ledger.tryRecord.mock.calls.find((c: unknown[]) => c[1] === 'shopping_deal');
    expect(dealCall[2]).toMatch(/^deal:Milk:Lidl:\d{4}-\d{2}-\d{2}$/);
    expect(parts.notif.sendToUser.mock.calls[0][4]).toBe('shopping_deal');
  });

  it('sends nothing when there are no due products and no deals', async () => {
    const parts = build({});
    const cron = await make(parts);
    await cron.handleShoppingReminders();
    expect(parts.notif.sendToUser).not.toHaveBeenCalled();
    expect(parts.ledger.tryRecord).not.toHaveBeenCalled();
  });

  it('does not pre-filter members by notifyShoppingReminders (deal-only opt-ins are eligible)', async () => {
    const parts = build({ deals: [{ canonicalName: 'Milk', merchant: 'Lidl', dropPct: 20, price: 4, avgPrice: 5, currency: 'PLN' }] });
    const cron = await make(parts);
    await cron.handleShoppingReminders();
    const call = (parts.prisma.accountMember.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.user).not.toHaveProperty('notifyShoppingReminders');
    expect(call.where.user).toEqual(expect.objectContaining({ pushToken: { not: null }, isActive: true }));
  });

  it('cleanupOldLogs delegates to the ledger with a 90-day window', async () => {
    const parts = build({});
    const cron = await make(parts);
    await cron.cleanupOldLogs();
    expect(parts.ledger.deleteOlderThan).toHaveBeenCalledWith(90);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `apps/api/`): `npx jest shopping-reminder.cron`
Expected: FAIL — cron constructor does not accept `ShoppingNotificationLedger` / `cleanupOldLogs` undefined / dedup not called.

- [ ] **Step 3: Rewrite the cron**

Replace the contents of `shopping-reminder.cron.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ShoppingListService } from './shopping-list.service';
import { ShoppingNotificationLedger } from './shopping-notification-ledger.service';
import { restockDedupKey, dealDedupKey, weekBucket } from './shopping-notification-dedup.util';
import * as ni18n from '../notifications/notification-i18n';
import type { DealSuggestion, RestockSuggestion } from '@budget/shared-types';

const LOG_RETENTION_DAYS = 90;

@Injectable()
export class ShoppingReminderCron {
  private readonly logger = new Logger(ShoppingReminderCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly shoppingListService: ShoppingListService,
    private readonly ledger: ShoppingNotificationLedger,
  ) {}

  /** Per-account, per-type minimum days between sends. Default 2; 0 disables. */
  private minGapDays(): number {
    const v = Number(process.env.SHOPPING_REMINDER_MIN_GAP_DAYS);
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 2;
  }

  @Cron('0 10 * * *')
  async handleShoppingReminders() {
    const since = new Date(Date.now() - 60 * 86_400_000);
    const accounts = await this.prisma.account.findMany({
      where: { expenses: { some: { isDeleted: false, date: { gte: since }, items: { some: { canonicalName: { not: null }, isDeleted: false } } } } },
      select: { id: true },
    });

    const gap = this.minGapDays();

    for (const account of accounts) {
      let due: RestockSuggestion[] = [];
      try {
        due = await this.shoppingListService.getRestockSuggestions(account.id);
      } catch (e) {
        this.logger.warn(`restock suggestions failed for ${account.id}`, e as Error);
      }

      let deals: DealSuggestion[] = [];
      try {
        deals = await this.shoppingListService.getDeals(account.id);
      } catch (e) {
        this.logger.warn(`deal suggestions failed for ${account.id}`, e as Error);
      }

      if (!due.length && !deals.length) continue;

      const members = await this.prisma.accountMember.findMany({
        where: { accountId: account.id, user: { pushToken: { not: null }, isActive: true } },
        select: { userId: true },
      });
      if (!members.length) continue;

      const now = new Date();

      // Restock: once per purchase cycle (dedup key bound to lastPurchase), gated by the global floor.
      if (due.length && !(await this.ledger.withinFloor(account.id, 'shopping_reminder', gap, now))) {
        const top = due[0];
        const key = restockDedupKey(top.canonicalName, top.lastPurchase);
        if (await this.ledger.tryRecord(account.id, 'shopping_reminder', key)) {
          const extra = due.length - 1;
          for (const m of members) {
            this.notificationsService
              .sendToUser(
                m.userId,
                (lang) => ni18n.shoppingReminderTitle(lang),
                (lang) => ni18n.shoppingReminderBody(lang, top.canonicalName, extra),
                { type: 'shopping_reminder' },
                'shopping_reminder',
              )
              .catch(() => {});
          }
        }
      }

      // Deals: once per product+merchant+week, gated by the global floor.
      if (deals.length && !(await this.ledger.withinFloor(account.id, 'shopping_deal', gap, now))) {
        const top = deals[0];
        const key = dealDedupKey(top.canonicalName, top.merchant, weekBucket(now));
        if (await this.ledger.tryRecord(account.id, 'shopping_deal', key)) {
          for (const m of members) {
            this.notificationsService
              .sendToUser(
                m.userId,
                (lang) => ni18n.shoppingDealTitle(lang),
                (lang) => ni18n.shoppingDealBody(lang, top.canonicalName, top.merchant, top.dropPct),
                { type: 'shopping_deal' },
                'shopping_deal',
              )
              .catch(() => {});
          }
        }
      }
    }
  }

  @Cron('0 3 * * *')
  async cleanupOldLogs() {
    try {
      const deleted = await this.ledger.deleteOlderThan(LOG_RETENTION_DAYS);
      if (deleted) this.logger.log(`cleaned ${deleted} old shopping notification log rows`);
    } catch (e) {
      this.logger.warn('shopping notification log cleanup failed', e as Error);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `apps/api/`): `npx jest shopping-reminder.cron shopping-notification`
Expected: PASS — cron spec (7 tests) + util + ledger all green.

- [ ] **Step 5: Typecheck the API**

Run (from repo root): `npm run typecheck -w apps/api` (or `cd apps/api && npx tsc --noEmit`)
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/shopping-list/shopping-reminder.cron.ts apps/api/src/modules/shopping-list/shopping-reminder.cron.spec.ts
git commit -m "feat(shopping-list): dedup shopping reminder/deal pushes (once per cycle + global floor + cleanup)"
```

---

## Self-Review

**1. Spec coverage:**
- §1 restock edge-triggered → Task 4 cron (`restockDedupKey(top.canonicalName, top.lastPurchase)` + `tryRecord`). ✓
- §2 deals once per occurrence → Task 4 (`dealDedupKey` + `weekBucket`). ✓
- §3 soft global floor (`SHOPPING_REMINDER_MIN_GAP_DAYS`, default 2, 0 disables) → Task 3 `withinFloor` + Task 4 `minGapDays()`. ✓
- §4 storage table (anomaly pattern, insert+P2002, no tx) → Task 1 schema/migration + Task 3 `tryRecord`. ✓
- §5 send flow rewrite → Task 4. ✓
- §6 cleanup cron (`0 3 * * *`, 90 days) → Task 4 `cleanupOldLogs` + Task 3 `deleteOlderThan`. ✓
- Testing section → Tasks 2/3/4 specs. ✓
- Non-goals honored: no maths change, no preference change, no mobile/i18n change. ✓

**2. Placeholder scan:** No TBD/TODO. Every code step has a complete, final code block.

**3. Type consistency:** `tryRecord(accountId, type, dedupKey)`, `withinFloor(accountId, type, minGapDays, now?)`, `deleteOlderThan(days, now?)` are used identically in Task 3 (definition), Task 3 tests, and Task 4 (cron + cron tests). Key builders `restockDedupKey`/`dealDedupKey`/`weekBucket` match between Task 2 and Task 4. Prisma accessor `shoppingNotificationLog` matches the `@@map` in Task 1. ✓

## Post-implementation (out of plan scope, do at task close)

- Run `finish-aba-task` skill: create ABA-{N} issue, update `CLAUDE.md` (shopping-list section) + `.env.example` (`SHOPPING_REMINDER_MIN_GAP_DAYS`) + docs/en+ru ARCHITECTURE.
- Do NOT push; commit locally and ask before pushing.
