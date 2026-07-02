# Family Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Instagram-style activity feed for shared accounts — grouped expense/income cards per user per day, purchase-request event cards, emoji reactions — delivered as a home-screen widget and a full-page feed.

**Architecture:** Event-log table (`family_feed_events`) is written fire-and-forget by existing services (ExpensesService, IncomesService, PurchaseRequestsService); a standalone `FamilyFeedModule` serves 3 REST endpoints; grouping (by userId + UTC calendar day) happens in-memory after the DB query; reactions live in a separate `feed_reactions` table with a `@@unique([eventId, userId])` upsert constraint.

**Tech Stack:** NestJS 10 + Prisma 5 (API), Expo/React Native + Zustand (mobile), class-validator DTOs, i18next (9 locales).

## Global Constraints

- API pattern: `(accountId, userId, dto)` service signatures; all Prisma queries scoped by `accountId`; `JwtAuthGuard + AccountContextGuard` class-level on controller.
- Guards: `ViewerBlockGuard` as `@UseGuards(new ViewerBlockGuard())` — zero-dependency, no AccountsModule import. Viewers CAN react — do NOT put ViewerBlockGuard on react/removeReaction endpoints.
- `import type` only from `@budget/shared-types` in `apps/api` — never import runtime values.
- `AuthenticatedRequest` is from `../../common/types/index`; use `req.user.id` (not `req.userId`).
- `PrismaService` and `NotificationsService` are `@Global()` — no explicit module import needed.
- Mobile Zustand store: `create<State>()((set, get) => ...)` curried form.
- Mobile theme: `useTheme()` from `@/theme`; color `textPrimary` not `text`.
- Mobile account role check: `useAccountStore(s => s.currentAccount()?.type)`.
- i18n: 9 locales — `en`, `de`, `es`, `fr`, `pl`, `ru`, `ua`, `be`, `nl`. Update ALL 9 on every key addition.
- No backfill of historical events — feed starts from deploy date.
- Personal accounts (`type === 'personal'`): `recordEvent()` no-ops; widget hidden; GET returns `[]`.
- `FeedEventType` enum values are uppercase in Prisma/DB (`EXPENSE_ADDED`) and lowercase underscore in the `FeedGroup.type` field (`'expenses'`, `'purchase_request_created'`).

---

### Task 1: Shared types

**Files:**
- Create: `packages/shared-types/src/entities/family-feed.ts`
- Create: `packages/shared-types/src/dto/family-feed.ts`
- Modify: `packages/shared-types/src/entities/index.ts`
- Modify: `packages/shared-types/src/dto/index.ts`

**Interfaces:**
- Produces: `FamilyFeedEvent`, `FeedReaction`, `FeedGroup`, `FeedEventType`, `ReactToFeedEventDto` — used by Tasks 3, 4, 6, 8, 9.

- [ ] **Step 1: Create entity file**

Create `packages/shared-types/src/entities/family-feed.ts`:

```typescript
export type FeedEventType =
  | 'EXPENSE_ADDED'
  | 'INCOME_ADDED'
  | 'PURCHASE_REQUEST_CREATED'
  | 'PURCHASE_REQUEST_APPROVED'
  | 'PURCHASE_REQUEST_PURCHASED';

export interface FamilyFeedEvent {
  id: string;
  accountId: string;
  userId: string;
  type: FeedEventType;
  entityId: string;
  metadata: { amount: number; currency: string; title?: string };
  createdAt: string;
  reactions: FeedReaction[];
}

export interface FeedReaction {
  id: string;
  eventId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

export interface FeedGroup {
  id: string;
  type:
    | 'expenses'
    | 'incomes'
    | 'purchase_request_created'
    | 'purchase_request_approved'
    | 'purchase_request_purchased';
  userId: string;
  userName: string;
  date: string; // 'YYYY-MM-DD' UTC
  // expense/income groups only:
  count?: number;
  totalAmount?: number;
  currency?: string;
  eventIds?: string[];
  // purchase_request cards only:
  purchaseRequest?: {
    id: string;
    title: string;
    amount: number;
    currency: string;
    status: string;
  };
  // all types:
  reactions: { emoji: string; count: number; userIds: string[] }[];
  myReaction: string | null;
}
```

- [ ] **Step 2: Create DTO file**

Create `packages/shared-types/src/dto/family-feed.ts`:

```typescript
export interface ReactToFeedEventDto {
  emoji: string;
}
```

- [ ] **Step 3: Register in barrels**

In `packages/shared-types/src/entities/index.ts`, add at the end:
```typescript
export * from './family-feed';
```

In `packages/shared-types/src/dto/index.ts`, add at the end:
```typescript
export * from './family-feed';
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd packages/shared-types && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/entities/family-feed.ts packages/shared-types/src/dto/family-feed.ts packages/shared-types/src/entities/index.ts packages/shared-types/src/dto/index.ts
git commit -m "feat(types): FamilyFeedEvent, FeedReaction, FeedGroup entities and DTO"
```

---

### Task 2: DB Schema + Migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Creates: `apps/api/prisma/migrations/20260630100000_add_family_feed/migration.sql` (auto-generated)

**Interfaces:**
- Produces: `prisma.familyFeedEvent.*` and `prisma.feedReaction.*` used by Task 3.

- [ ] **Step 1: Add enum to schema.prisma**

In `apps/api/prisma/schema.prisma`, find the existing enums section (near `ApprovalRule`, `VoteChoice`). Add after them:

```prisma
enum FeedEventType {
  EXPENSE_ADDED
  INCOME_ADDED
  PURCHASE_REQUEST_CREATED
  PURCHASE_REQUEST_APPROVED
  PURCHASE_REQUEST_PURCHASED
}
```

- [ ] **Step 2: Add models to schema.prisma**

After the `PurchaseRequestVote` model, add:

```prisma
model FamilyFeedEvent {
  id        String        @id @default(cuid())
  accountId String        @map("account_id")
  userId    String        @map("user_id")
  type      FeedEventType
  entityId  String        @map("entity_id")
  metadata  Json
  createdAt DateTime      @default(now()) @map("created_at")

  account   Account       @relation(fields: [accountId], references: [id], onDelete: Cascade)
  user      User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  reactions FeedReaction[]

  @@index([accountId, createdAt(sort: Desc)])
  @@map("family_feed_events")
}

model FeedReaction {
  id        String          @id @default(cuid())
  eventId   String          @map("event_id")
  userId    String          @map("user_id")
  emoji     String
  createdAt DateTime        @default(now()) @map("created_at")

  event FamilyFeedEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user  User            @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([eventId, userId])
  @@map("feed_reactions")
}
```

- [ ] **Step 3: Add relations to Account and User models**

In the `Account` model relations block, add:
```prisma
  feedEvents  FamilyFeedEvent[]
```

In the `User` model relations block, add:
```prisma
  feedEvents    FamilyFeedEvent[]
  feedReactions FeedReaction[]
```

- [ ] **Step 4: Run migration**

```bash
cd apps/api
npx prisma migrate dev --name add_family_feed
```
Expected: migration file created at `prisma/migrations/20260630100000_add_family_feed/migration.sql` (timestamp may differ slightly), Prisma client regenerated.

- [ ] **Step 5: Verify Prisma client**

```bash
npx prisma generate
```
Expected: no errors. `prisma.familyFeedEvent` and `prisma.feedReaction` are now available.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(db): add family_feed_events and feed_reactions tables"
```

---

### Task 3: FamilyFeedService (TDD)

**Files:**
- Create: `apps/api/src/modules/family-feed/family-feed.service.ts`
- Create: `apps/api/src/modules/family-feed/family-feed.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (global); `FeedGroup`, `FeedEventType` from `@budget/shared-types` (type-only import).
- Produces:
  - `recordEvent(accountId: string, userId: string, type: string, entityId: string, metadata: { amount: number; currency: string; title?: string }): Promise<void>`
  - `groupEvents(events: RawFeedEvent[], callerUserId: string): FeedGroup[]` — pure, exported for testing
  - `getFeed(accountId: string, userId: string, limit?: number): Promise<FeedGroup[]>`
  - `react(accountId: string, userId: string, eventId: string, emoji: string): Promise<void>`
  - `removeReaction(accountId: string, userId: string, eventId: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/modules/family-feed/family-feed.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FamilyFeedService } from './family-feed.service';
import { PrismaService } from '../../database/prisma.service';

type RawEvent = {
  id: string;
  userId: string;
  type: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  user: { name: string };
  reactions: { emoji: string; userId: string }[];
};

const makeEvent = (overrides: Partial<RawEvent> = {}): RawEvent => ({
  id: 'e1',
  userId: 'u1',
  type: 'EXPENSE_ADDED',
  entityId: 'exp1',
  metadata: { amount: 100, currency: 'PLN' },
  createdAt: new Date('2026-01-15T10:00:00Z'),
  user: { name: 'Alice' },
  reactions: [],
  ...overrides,
});

describe('FamilyFeedService', () => {
  let service: FamilyFeedService;
  let prisma: {
    account: { findUnique: jest.Mock };
    familyFeedEvent: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock };
    feedReaction: { upsert: jest.Mock; deleteMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      account: { findUnique: jest.fn() },
      familyFeedEvent: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
      feedReaction: { upsert: jest.fn(), deleteMany: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [
        FamilyFeedService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(FamilyFeedService);
  });

  // ── groupEvents ──────────────────────────────────────────────────────

  describe('groupEvents', () => {
    it('groups two expenses from same user on same UTC day into one card', () => {
      const events = [
        makeEvent({ id: 'e1', metadata: { amount: 50, currency: 'PLN' }, createdAt: new Date('2026-01-15T10:00:00Z') }),
        makeEvent({ id: 'e2', metadata: { amount: 70, currency: 'PLN' }, createdAt: new Date('2026-01-15T14:00:00Z') }),
      ];
      const groups = service.groupEvents(events, 'u1');
      expect(groups).toHaveLength(1);
      expect(groups[0].type).toBe('expenses');
      expect(groups[0].count).toBe(2);
      expect(groups[0].totalAmount).toBe(120);
      expect(groups[0].eventIds).toEqual(['e1', 'e2']);
    });

    it('creates two groups for same user on different days', () => {
      const events = [
        makeEvent({ id: 'e1', createdAt: new Date('2026-01-15T10:00:00Z') }),
        makeEvent({ id: 'e2', createdAt: new Date('2026-01-16T10:00:00Z') }),
      ];
      const groups = service.groupEvents(events, 'u1');
      expect(groups).toHaveLength(2);
    });

    it('creates two groups for different users on same day', () => {
      const events = [
        makeEvent({ id: 'e1', userId: 'u1' }),
        makeEvent({ id: 'e2', userId: 'u2', user: { name: 'Bob' } }),
      ];
      const groups = service.groupEvents(events, 'u1');
      expect(groups).toHaveLength(2);
    });

    it('never groups purchase request events — each is its own card', () => {
      const events = [
        makeEvent({ id: 'e1', type: 'PURCHASE_REQUEST_CREATED', entityId: 'pr1', metadata: { amount: 450, currency: 'PLN', title: 'Nike' } }),
        makeEvent({ id: 'e2', type: 'PURCHASE_REQUEST_CREATED', entityId: 'pr2', metadata: { amount: 200, currency: 'PLN', title: 'Adidas' } }),
      ];
      const groups = service.groupEvents(events, 'u1');
      expect(groups).toHaveLength(2);
      expect(groups[0].type).toBe('purchase_request_created');
      expect(groups[0].purchaseRequest?.title).toBe('Nike');
    });

    it('sets myReaction to caller emoji when present', () => {
      const events = [
        makeEvent({ reactions: [{ emoji: '👍', userId: 'u1' }, { emoji: '❤️', userId: 'u2' }] }),
      ];
      const groups = service.groupEvents(events, 'u1');
      expect(groups[0].myReaction).toBe('👍');
    });

    it('sets myReaction to null when caller has no reaction', () => {
      const events = [makeEvent({ reactions: [{ emoji: '👍', userId: 'u2' }] })];
      const groups = service.groupEvents(events, 'u1');
      expect(groups[0].myReaction).toBeNull();
    });

    it('separates expenses and incomes into different group types', () => {
      const events = [
        makeEvent({ id: 'e1', type: 'EXPENSE_ADDED' }),
        makeEvent({ id: 'e2', type: 'INCOME_ADDED' }),
      ];
      const groups = service.groupEvents(events, 'u1');
      expect(groups).toHaveLength(2);
      expect(groups.map((g) => g.type).sort()).toEqual(['expenses', 'incomes']);
    });
  });

  // ── recordEvent ──────────────────────────────────────────────────────

  describe('recordEvent', () => {
    it('does not create event for personal account', async () => {
      prisma.account.findUnique.mockResolvedValue({ type: 'personal' });
      await service.recordEvent('acc1', 'u1', 'EXPENSE_ADDED', 'exp1', { amount: 50, currency: 'PLN' });
      expect(prisma.familyFeedEvent.create).not.toHaveBeenCalled();
    });

    it('creates event for shared account', async () => {
      prisma.account.findUnique.mockResolvedValue({ type: 'shared' });
      prisma.familyFeedEvent.create.mockResolvedValue({});
      await service.recordEvent('acc1', 'u1', 'EXPENSE_ADDED', 'exp1', { amount: 50, currency: 'PLN' });
      expect(prisma.familyFeedEvent.create).toHaveBeenCalledWith({
        data: { accountId: 'acc1', userId: 'u1', type: 'EXPENSE_ADDED', entityId: 'exp1', metadata: { amount: 50, currency: 'PLN' } },
      });
    });

    it('no-ops silently when account not found', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      await expect(service.recordEvent('acc1', 'u1', 'EXPENSE_ADDED', 'exp1', { amount: 50, currency: 'PLN' })).resolves.toBeUndefined();
      expect(prisma.familyFeedEvent.create).not.toHaveBeenCalled();
    });
  });

  // ── react / removeReaction ───────────────────────────────────────────

  describe('react', () => {
    it('upserts reaction with correct data', async () => {
      prisma.familyFeedEvent.findFirst.mockResolvedValue({ id: 'ev1' });
      prisma.feedReaction.upsert.mockResolvedValue({});
      await service.react('acc1', 'u1', 'ev1', '👍');
      expect(prisma.feedReaction.upsert).toHaveBeenCalledWith({
        where: { eventId_userId: { eventId: 'ev1', userId: 'u1' } },
        create: { eventId: 'ev1', userId: 'u1', emoji: '👍' },
        update: { emoji: '👍' },
      });
    });

    it('throws NotFoundException when event not in this account', async () => {
      prisma.familyFeedEvent.findFirst.mockResolvedValue(null);
      await expect(service.react('acc1', 'u1', 'bad-id', '👍')).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeReaction', () => {
    it('deletes reaction', async () => {
      prisma.familyFeedEvent.findFirst.mockResolvedValue({ id: 'ev1' });
      prisma.feedReaction.deleteMany.mockResolvedValue({ count: 1 });
      await service.removeReaction('acc1', 'u1', 'ev1');
      expect(prisma.feedReaction.deleteMany).toHaveBeenCalledWith({ where: { eventId: 'ev1', userId: 'u1' } });
    });

    it('throws NotFoundException when event not found', async () => {
      prisma.familyFeedEvent.findFirst.mockResolvedValue(null);
      await expect(service.removeReaction('acc1', 'u1', 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api
npx jest family-feed --no-coverage 2>&1 | tail -10
```
Expected: FAIL — `Cannot find module './family-feed.service'`.

- [ ] **Step 3: Implement the service**

Create `apps/api/src/modules/family-feed/family-feed.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { FeedGroup } from '@budget/shared-types';

type RawFeedEvent = {
  id: string;
  userId: string;
  type: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  user: { name: string };
  reactions: { emoji: string; userId: string }[];
};

@Injectable()
export class FamilyFeedService {
  constructor(private readonly prisma: PrismaService) {}

  // ── pure helper — public for testing ─────────────────────────────────

  groupEvents(events: RawFeedEvent[], callerUserId: string): FeedGroup[] {
    const groups: FeedGroup[] = [];
    const dayKeys = new Map<string, FeedGroup>();

    for (const event of events) {
      const date = event.createdAt.toISOString().slice(0, 10);
      const { reactions, myReaction } = this.buildReactions(event.reactions, callerUserId);

      if (event.type === 'EXPENSE_ADDED' || event.type === 'INCOME_ADDED') {
        const groupType = event.type === 'EXPENSE_ADDED' ? 'expenses' : 'incomes';
        const key = `${event.userId}:${date}:${groupType}`;

        if (dayKeys.has(key)) {
          const g = dayKeys.get(key)!;
          g.count! += 1;
          g.totalAmount! += (event.metadata.amount as number);
          g.eventIds!.push(event.id);
        } else {
          const g: FeedGroup = {
            id: event.id,
            type: groupType,
            userId: event.userId,
            userName: event.user.name,
            date,
            count: 1,
            totalAmount: event.metadata.amount as number,
            currency: event.metadata.currency as string,
            eventIds: [event.id],
            reactions,
            myReaction,
          };
          dayKeys.set(key, g);
          groups.push(g);
        }
      } else {
        // PURCHASE_REQUEST_* — always individual card
        const meta = event.metadata as { amount: number; currency: string; title?: string };
        const prType = event.type.toLowerCase() as FeedGroup['type'];
        groups.push({
          id: event.id,
          type: prType,
          userId: event.userId,
          userName: event.user.name,
          date,
          purchaseRequest: {
            id: event.entityId,
            title: meta.title ?? '',
            amount: meta.amount,
            currency: meta.currency,
            status:
              event.type === 'PURCHASE_REQUEST_CREATED'
                ? 'PENDING'
                : event.type === 'PURCHASE_REQUEST_APPROVED'
                ? 'APPROVED'
                : 'PURCHASED',
          },
          reactions,
          myReaction,
        });
      }
    }

    return groups;
  }

  // ── DB methods ────────────────────────────────────────────────────────

  async recordEvent(
    accountId: string,
    userId: string,
    type: string,
    entityId: string,
    metadata: { amount: number; currency: string; title?: string },
  ): Promise<void> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { type: true },
    });
    if (!account || account.type === 'personal') return;

    await this.prisma.familyFeedEvent.create({
      data: { accountId, userId, type, entityId, metadata },
    });
  }

  async getFeed(accountId: string, userId: string, limit = 100): Promise<FeedGroup[]> {
    const events = await this.prisma.familyFeedEvent.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      include: {
        user: { select: { name: true } },
        reactions: { select: { emoji: true, userId: true } },
      },
    });
    return this.groupEvents(events as RawFeedEvent[], userId);
  }

  async react(accountId: string, userId: string, eventId: string, emoji: string): Promise<void> {
    const event = await this.prisma.familyFeedEvent.findFirst({
      where: { id: eventId, accountId },
    });
    if (!event) throw new NotFoundException('Feed event not found');

    await this.prisma.feedReaction.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId, emoji },
      update: { emoji },
    });
  }

  async removeReaction(accountId: string, userId: string, eventId: string): Promise<void> {
    const event = await this.prisma.familyFeedEvent.findFirst({
      where: { id: eventId, accountId },
    });
    if (!event) throw new NotFoundException('Feed event not found');

    await this.prisma.feedReaction.deleteMany({ where: { eventId, userId } });
  }

  // ── private ──────────────────────────────────────────────────────────

  private buildReactions(
    raw: { emoji: string; userId: string }[],
    callerUserId: string,
  ): { reactions: { emoji: string; count: number; userIds: string[] }[]; myReaction: string | null } {
    const map = new Map<string, string[]>();
    for (const r of raw) {
      if (!map.has(r.emoji)) map.set(r.emoji, []);
      map.get(r.emoji)!.push(r.userId);
    }
    const reactions = Array.from(map.entries()).map(([emoji, userIds]) => ({
      emoji,
      count: userIds.length,
      userIds,
    }));
    const myReaction = raw.find((r) => r.userId === callerUserId)?.emoji ?? null;
    return { reactions, myReaction };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api
npx jest family-feed.service --no-coverage 2>&1 | tail -10
```
Expected: all 12 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/family-feed/
git commit -m "feat(api): FamilyFeedService with grouping and reaction logic (TDD)"
```

---

### Task 4: FamilyFeedController + Module + AppModule registration (TDD)

**Files:**
- Create: `apps/api/src/modules/family-feed/dto/index.ts`
- Create: `apps/api/src/modules/family-feed/family-feed.controller.ts`
- Create: `apps/api/src/modules/family-feed/family-feed.controller.spec.ts`
- Create: `apps/api/src/modules/family-feed/family-feed.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `FamilyFeedService` (Task 3), `JwtAuthGuard`, `AccountContextGuard`, `AuthenticatedRequest`.
- Produces: `GET /family-feed`, `POST /family-feed/:eventId/react`, `DELETE /family-feed/:eventId/react`.

- [ ] **Step 1: Create DTO**

Create `apps/api/src/modules/family-feed/dto/index.ts`:

```typescript
import { IsString, IsIn } from 'class-validator';

export const ALLOWED_EMOJIS = ['👍', '❤️', '😮', '😂', '🔥', '😬'] as const;

export class ReactToFeedEventApiDto {
  @IsString()
  @IsIn(ALLOWED_EMOJIS as unknown as string[])
  emoji: string;
}
```

- [ ] **Step 2: Write the failing controller tests**

Create `apps/api/src/modules/family-feed/family-feed.controller.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { FamilyFeedController } from './family-feed.controller';
import { FamilyFeedService } from './family-feed.service';
import type { AuthenticatedRequest } from '../../common/types/index';

describe('FamilyFeedController', () => {
  let controller: FamilyFeedController;
  let svc: { getFeed: jest.Mock; react: jest.Mock; removeReaction: jest.Mock };

  const req = { accountId: 'acc1', user: { id: 'u1' } } as unknown as AuthenticatedRequest;

  beforeEach(async () => {
    svc = {
      getFeed: jest.fn().mockResolvedValue([]),
      react: jest.fn().mockResolvedValue(undefined),
      removeReaction: jest.fn().mockResolvedValue(undefined),
    };
    const module = await Test.createTestingModule({
      controllers: [FamilyFeedController],
      providers: [{ provide: FamilyFeedService, useValue: svc }],
    }).compile();
    controller = module.get(FamilyFeedController);
  });

  it('GET /family-feed calls getFeed with accountId and userId', async () => {
    const result = await controller.getFeed(req);
    expect(svc.getFeed).toHaveBeenCalledWith('acc1', 'u1', 100);
    expect(result).toEqual([]);
  });

  it('POST /family-feed/:eventId/react calls react', async () => {
    await controller.react(req, 'ev1', { emoji: '👍' });
    expect(svc.react).toHaveBeenCalledWith('acc1', 'u1', 'ev1', '👍');
  });

  it('DELETE /family-feed/:eventId/react calls removeReaction', async () => {
    await controller.removeReaction(req, 'ev1');
    expect(svc.removeReaction).toHaveBeenCalledWith('acc1', 'u1', 'ev1');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd apps/api
npx jest family-feed.controller --no-coverage 2>&1 | tail -5
```
Expected: FAIL — `Cannot find module './family-feed.controller'`.

- [ ] **Step 4: Implement the controller**

Create `apps/api/src/modules/family-feed/family-feed.controller.ts`:

```typescript
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { FamilyFeedService } from './family-feed.service';
import { ReactToFeedEventApiDto } from './dto';
import type { AuthenticatedRequest } from '../../common/types/index';

@Controller('family-feed')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class FamilyFeedController {
  constructor(private readonly svc: FamilyFeedService) {}

  @Get()
  getFeed(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: number,
  ) {
    return this.svc.getFeed(req.accountId, req.user.id, limit ? Number(limit) : 100);
  }

  @Post(':eventId/react')
  react(
    @Req() req: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: ReactToFeedEventApiDto,
  ) {
    return this.svc.react(req.accountId, req.user.id, eventId, dto.emoji);
  }

  @Delete(':eventId/react')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeReaction(
    @Req() req: AuthenticatedRequest,
    @Param('eventId') eventId: string,
  ) {
    return this.svc.removeReaction(req.accountId, req.user.id, eventId);
  }
}
```

- [ ] **Step 5: Create the module**

Create `apps/api/src/modules/family-feed/family-feed.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { FamilyFeedController } from './family-feed.controller';
import { FamilyFeedService } from './family-feed.service';

// PrismaService is @Global() — no explicit DatabaseModule import needed.
@Module({
  controllers: [FamilyFeedController],
  providers: [FamilyFeedService],
  exports: [FamilyFeedService],
})
export class FamilyFeedModule {}
```

- [ ] **Step 6: Register in AppModule**

In `apps/api/src/app.module.ts`, add the import:

```typescript
import { FamilyFeedModule } from './modules/family-feed/family-feed.module';
```

Add `FamilyFeedModule` to the `imports` array (alphabetically near `ExpensesModule`).

- [ ] **Step 7: Run all family-feed tests**

```bash
cd apps/api
npx jest family-feed --no-coverage 2>&1 | tail -10
```
Expected: 15 tests PASS (12 service + 3 controller).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/family-feed/ apps/api/src/app.module.ts
git commit -m "feat(api): FamilyFeedController + Module (TDD) — GET /family-feed, react/remove endpoints"
```

---

### Task 5: Wire event recording into existing services

**Files:**
- Modify: `apps/api/src/modules/expenses/expenses.service.ts`
- Modify: `apps/api/src/modules/expenses/expenses.module.ts`
- Modify: `apps/api/src/modules/incomes/incomes.service.ts`
- Modify: `apps/api/src/modules/incomes/incomes.module.ts`
- Modify: `apps/api/src/modules/purchase-requests/purchase-requests.service.ts`
- Modify: `apps/api/src/modules/purchase-requests/purchase-requests.module.ts`

**Interfaces:**
- Consumes: `FamilyFeedService.recordEvent()` (Task 3/4), `FamilyFeedModule` (exported).

- [ ] **Step 1: Wire into ExpensesService**

In `apps/api/src/modules/expenses/expenses.service.ts`, inject `FamilyFeedService`:

```typescript
// Add to imports at top (type-only since it's a service class import, not a value from shared-types):
import { FamilyFeedService } from '../family-feed/family-feed.service';
```

In the constructor, add `private readonly familyFeed: FamilyFeedService`.

In `create()`, after the line `await this.anomalyService.checkExpense(...)`, add:

```typescript
    // fire-and-forget: record in family feed (non-personal accounts only)
    void this.familyFeed
      .recordEvent(accountId, userId, 'EXPENSE_ADDED', result.expense.id, {
        amount: result.expense.amount,
        currency: result.expense.currencyCode,
      })
      .catch(() => {});
```

- [ ] **Step 2: Update ExpensesModule**

In `apps/api/src/modules/expenses/expenses.module.ts`, add `FamilyFeedModule` to imports:

```typescript
import { FamilyFeedModule } from '../family-feed/family-feed.module';

@Module({
  imports: [BudgetsModule, GamificationModule, AnomalyModule, MerchantRulesModule, FamilyFeedModule],
  controllers: [ExpensesController],
  providers: [ExpensesService, ExpenseRecurringCron],
  exports: [ExpensesService],
})
export class ExpensesModule {}
```

- [ ] **Step 3: Wire into IncomesService**

In `apps/api/src/modules/incomes/incomes.service.ts`:

```typescript
import { FamilyFeedService } from '../family-feed/family-feed.service';
```

Add `private readonly familyFeed: FamilyFeedService` to constructor.

In the `create()` method, after the income is persisted (find the return statement and add before it):

```typescript
    void this.familyFeed
      .recordEvent(accountId, userId, 'INCOME_ADDED', income.id, {
        amount: income.amount,
        currency: income.currencyCode,
      })
      .catch(() => {});
```

- [ ] **Step 4: Update IncomesModule**

In `apps/api/src/modules/incomes/incomes.module.ts`, add `FamilyFeedModule` to imports. First read the file to find the current imports array, then add:

```typescript
import { FamilyFeedModule } from '../family-feed/family-feed.module';
```

Add `FamilyFeedModule` to the `imports` array.

- [ ] **Step 5: Wire into PurchaseRequestsService**

In `apps/api/src/modules/purchase-requests/purchase-requests.service.ts`:

```typescript
import { FamilyFeedService } from '../family-feed/family-feed.service';
```

Add `private readonly familyFeed: FamilyFeedService` to constructor.

In `create()`, after `const pr = await this.prisma.purchaseRequest.create(...)`, add:

```typescript
    void this.familyFeed
      .recordEvent(pr.accountId, pr.createdByUserId, 'PURCHASE_REQUEST_CREATED', pr.id, {
        amount: pr.amount,
        currency: pr.currency,
        title: pr.title,
      })
      .catch(() => {});
```

In `evaluateApproval()`, where `status` is set to `'APPROVED'` (find the `prisma.purchaseRequest.update` call with `status: 'APPROVED'`), add after it:

```typescript
      void this.familyFeed
        .recordEvent(pr.accountId, pr.createdByUserId, 'PURCHASE_REQUEST_APPROVED', pr.id, {
          amount: pr.amount,
          currency: pr.currency,
          title: pr.title,
        })
        .catch(() => {});
```

In `markAsPurchased()`, after the status update to `'PURCHASED'`, add:

```typescript
    void this.familyFeed
      .recordEvent(pr.accountId, userId, 'PURCHASE_REQUEST_PURCHASED', pr.id, {
        amount: pr.amount,
        currency: pr.currency,
        title: pr.title,
      })
      .catch(() => {});
```

- [ ] **Step 6: Update PurchaseRequestsModule**

In `apps/api/src/modules/purchase-requests/purchase-requests.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PurchaseRequestsController } from './purchase-requests.controller';
import { PurchaseRequestsService } from './purchase-requests.service';
import { FamilyFeedModule } from '../family-feed/family-feed.module';

@Module({
  imports: [FamilyFeedModule],
  controllers: [PurchaseRequestsController],
  providers: [PurchaseRequestsService],
  exports: [PurchaseRequestsService],
})
export class PurchaseRequestsModule {}
```

- [ ] **Step 7: Run existing tests to verify no regressions**

```bash
cd apps/api
npx jest purchase-requests --no-coverage 2>&1 | tail -5
```
Expected: 27/27 PASS.

```bash
npx jest family-feed --no-coverage 2>&1 | tail -5
```
Expected: 15/15 PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/expenses/ apps/api/src/modules/incomes/ apps/api/src/modules/purchase-requests/
git commit -m "feat(api): wire family feed event recording into expenses, incomes, purchase-requests"
```

---

### Task 6: Mobile API client + Zustand store

**Files:**
- Create: `apps/mobile/src/services/family-feed.api.ts`
- Modify: `apps/mobile/src/services/api.ts`
- Create: `apps/mobile/src/stores/familyFeedStore.ts`

**Interfaces:**
- Consumes: `FeedGroup`, `ReactToFeedEventDto` from `@budget/shared-types`; `httpClient` from `./http-client`; `useAuthStore` from `@/stores/authStore`.
- Produces:
  - `api.getFamilyFeed(limit?)`, `api.reactToFeedEvent(eventId, emoji)`, `api.removeFeedReaction(eventId)`
  - `useFamilyFeedStore`: `groups`, `isLoading`, `loadFeed()`, `react(eventId, emoji)`, `removeReaction(eventId)`, `reset()`

- [ ] **Step 1: Create API client**

Create `apps/mobile/src/services/family-feed.api.ts`:

```typescript
import type { FeedGroup } from '@budget/shared-types';
import { httpClient } from './http-client';

export const familyFeedApi = {
  getFamilyFeed(limit = 100) {
    return httpClient.request<FeedGroup[]>(`/family-feed?limit=${limit}`);
  },

  reactToFeedEvent(eventId: string, emoji: string) {
    return httpClient.request<void>(`/family-feed/${eventId}/react`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
  },

  removeFeedReaction(eventId: string) {
    return httpClient.request<void>(`/family-feed/${eventId}/react`, {
      method: 'DELETE',
    });
  },
};
```

- [ ] **Step 2: Register in api.ts barrel**

In `apps/mobile/src/services/api.ts`:

Add import near the other API imports:
```typescript
import { familyFeedApi } from './family-feed.api';
```

In the `api` object spread, add:
```typescript
  ...familyFeedApi,
```

- [ ] **Step 3: Create the Zustand store**

Create `apps/mobile/src/stores/familyFeedStore.ts`:

```typescript
import { create } from 'zustand';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import type { FeedGroup } from '@budget/shared-types';

interface FamilyFeedState {
  groups: FeedGroup[];
  isLoading: boolean;

  loadFeed: () => Promise<void>;
  react: (eventId: string, emoji: string) => Promise<void>;
  removeReaction: (eventId: string) => Promise<void>;
  reset: () => void;
}

export const useFamilyFeedStore = create<FamilyFeedState>()((set, get) => ({
  groups: [],
  isLoading: false,

  loadFeed: async () => {
    set({ isLoading: true });
    try {
      const groups = await api.getFamilyFeed();
      set({ groups, isLoading: false });
    } catch (e) {
      console.warn('[familyFeedStore] loadFeed failed', e);
      set({ isLoading: false });
    }
  },

  react: async (eventId, emoji) => {
    const myUserId = useAuthStore.getState().user?.id ?? '';
    const prev = get().groups;

    // optimistic update
    set((s) => ({
      groups: s.groups.map((g) => {
        if (g.id !== eventId) return g;
        const withoutMe = g.reactions.map((r) => ({
          ...r,
          userIds: r.userIds.filter((uid) => uid !== myUserId),
          count: r.userIds.filter((uid) => uid !== myUserId).length,
        })).filter((r) => r.count > 0);

        const existing = withoutMe.find((r) => r.emoji === emoji);
        const reactions = existing
          ? withoutMe.map((r) =>
              r.emoji === emoji
                ? { ...r, count: r.count + 1, userIds: [...r.userIds, myUserId] }
                : r,
            )
          : [...withoutMe, { emoji, count: 1, userIds: [myUserId] }];

        return { ...g, reactions, myReaction: emoji };
      }),
    }));

    try {
      await api.reactToFeedEvent(eventId, emoji);
    } catch (e) {
      console.warn('[familyFeedStore] react failed', e);
      set({ groups: prev });
    }
  },

  removeReaction: async (eventId) => {
    const myUserId = useAuthStore.getState().user?.id ?? '';
    const prev = get().groups;

    // optimistic update
    set((s) => ({
      groups: s.groups.map((g) => {
        if (g.id !== eventId) return g;
        const reactions = g.reactions
          .map((r) => ({
            ...r,
            userIds: r.userIds.filter((uid) => uid !== myUserId),
            count: r.userIds.filter((uid) => uid !== myUserId).length,
          }))
          .filter((r) => r.count > 0);
        return { ...g, reactions, myReaction: null };
      }),
    }));

    try {
      await api.removeFeedReaction(eventId);
    } catch (e) {
      console.warn('[familyFeedStore] removeReaction failed', e);
      set({ groups: prev });
    }
  },

  reset: () => set({ groups: [], isLoading: false }),
}));
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd apps/mobile
npx tsc --noEmit 2>&1 | grep family-feed
```
Expected: no errors related to family-feed files.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/services/family-feed.api.ts apps/mobile/src/services/api.ts apps/mobile/src/stores/familyFeedStore.ts
git commit -m "feat(mobile): family feed API client and Zustand store"
```

---

### Task 7: Mobile i18n — 9 locales

**Files:**
- Modify: `apps/mobile/src/i18n/locales/en.ts`
- Modify: `apps/mobile/src/i18n/locales/pl.ts`
- Modify: `apps/mobile/src/i18n/locales/de.ts`
- Modify: `apps/mobile/src/i18n/locales/es.ts`
- Modify: `apps/mobile/src/i18n/locales/fr.ts`
- Modify: `apps/mobile/src/i18n/locales/ru.ts`
- Modify: `apps/mobile/src/i18n/locales/ua.ts`
- Modify: `apps/mobile/src/i18n/locales/be.ts`
- Modify: `apps/mobile/src/i18n/locales/nl.ts`

- [ ] **Step 1: Add keys to en.ts**

In `apps/mobile/src/i18n/locales/en.ts`, add inside the top-level object:

```typescript
  familyFeed: {
    title: 'Family Feed',
    showAll: 'Show all',
    today: 'Today',
    yesterday: 'Yesterday',
    expenses: '{{count}} expenses · {{amount}}',
    incomes: '{{count}} incomes · {{amount}}',
    proposedPurchase: 'proposed a purchase',
    purchaseApproved: 'Purchase approved',
    purchaseMade: 'Purchased!',
    noActivity: 'No activity yet',
    noActivityDesc: 'Expenses and purchases from all account members will appear here',
    expand: 'Show details',
    collapse: 'Hide details',
    reactAdded: 'Reaction added',
    reactRemoved: 'Reaction removed',
  },
```

- [ ] **Step 2: Add keys to pl.ts**

```typescript
  familyFeed: {
    title: 'Rodzinna tablica',
    showAll: 'Pokaż wszystkie',
    today: 'Dzisiaj',
    yesterday: 'Wczoraj',
    expenses: '{{count}} wydatki · {{amount}}',
    incomes: '{{count}} przychody · {{amount}}',
    proposedPurchase: 'zaproponował/a zakup',
    purchaseApproved: 'Zakup zatwierdzony',
    purchaseMade: 'Zakupiono!',
    noActivity: 'Brak aktywności',
    noActivityDesc: 'Tutaj pojawią się wydatki i zakupy wszystkich członków konta',
    expand: 'Pokaż szczegóły',
    collapse: 'Ukryj szczegóły',
    reactAdded: 'Reakcja dodana',
    reactRemoved: 'Reakcja usunięta',
  },
```

- [ ] **Step 3: Add keys to de.ts**

```typescript
  familyFeed: {
    title: 'Familien-Feed',
    showAll: 'Alle anzeigen',
    today: 'Heute',
    yesterday: 'Gestern',
    expenses: '{{count}} Ausgaben · {{amount}}',
    incomes: '{{count}} Einnahmen · {{amount}}',
    proposedPurchase: 'hat einen Kauf vorgeschlagen',
    purchaseApproved: 'Kauf genehmigt',
    purchaseMade: 'Gekauft!',
    noActivity: 'Noch keine Aktivität',
    noActivityDesc: 'Hier erscheinen Ausgaben und Käufe aller Kontomitglieder',
    expand: 'Details anzeigen',
    collapse: 'Details ausblenden',
    reactAdded: 'Reaktion hinzugefügt',
    reactRemoved: 'Reaktion entfernt',
  },
```

- [ ] **Step 4: Add keys to es.ts**

```typescript
  familyFeed: {
    title: 'Feed familiar',
    showAll: 'Ver todo',
    today: 'Hoy',
    yesterday: 'Ayer',
    expenses: '{{count}} gastos · {{amount}}',
    incomes: '{{count}} ingresos · {{amount}}',
    proposedPurchase: 'propuso una compra',
    purchaseApproved: 'Compra aprobada',
    purchaseMade: '¡Comprado!',
    noActivity: 'Sin actividad aún',
    noActivityDesc: 'Aquí aparecerán los gastos y compras de todos los miembros de la cuenta',
    expand: 'Mostrar detalles',
    collapse: 'Ocultar detalles',
    reactAdded: 'Reacción añadida',
    reactRemoved: 'Reacción eliminada',
  },
```

- [ ] **Step 5: Add keys to fr.ts**

```typescript
  familyFeed: {
    title: 'Fil familial',
    showAll: 'Tout afficher',
    today: "Aujourd'hui",
    yesterday: 'Hier',
    expenses: '{{count}} dépenses · {{amount}}',
    incomes: '{{count}} revenus · {{amount}}',
    proposedPurchase: 'a proposé un achat',
    purchaseApproved: 'Achat approuvé',
    purchaseMade: 'Acheté !',
    noActivity: 'Aucune activité',
    noActivityDesc: "Les dépenses et achats de tous les membres du compte apparaîtront ici",
    expand: 'Afficher les détails',
    collapse: 'Masquer les détails',
    reactAdded: 'Réaction ajoutée',
    reactRemoved: 'Réaction supprimée',
  },
```

- [ ] **Step 6: Add keys to ru.ts**

```typescript
  familyFeed: {
    title: 'Семейная лента',
    showAll: 'Показать все',
    today: 'Сегодня',
    yesterday: 'Вчера',
    expenses: '{{count}} расхода · {{amount}}',
    incomes: '{{count}} дохода · {{amount}}',
    proposedPurchase: 'предложил/а покупку',
    purchaseApproved: 'Покупка одобрена',
    purchaseMade: 'Куплено!',
    noActivity: 'Нет активности',
    noActivityDesc: 'Здесь будут отображаться расходы и покупки всех участников счёта',
    expand: 'Показать детали',
    collapse: 'Скрыть детали',
    reactAdded: 'Реакция добавлена',
    reactRemoved: 'Реакция удалена',
  },
```

- [ ] **Step 7: Add keys to ua.ts**

```typescript
  familyFeed: {
    title: 'Сімейна стрічка',
    showAll: 'Показати все',
    today: 'Сьогодні',
    yesterday: 'Вчора',
    expenses: '{{count}} витрати · {{amount}}',
    incomes: '{{count}} доходи · {{amount}}',
    proposedPurchase: 'запропонував/ла покупку',
    purchaseApproved: 'Покупку схвалено',
    purchaseMade: 'Куплено!',
    noActivity: 'Немає активності',
    noActivityDesc: 'Тут відображатимуться витрати та покупки всіх учасників рахунку',
    expand: 'Показати деталі',
    collapse: 'Приховати деталі',
    reactAdded: 'Реакцію додано',
    reactRemoved: 'Реакцію видалено',
  },
```

- [ ] **Step 8: Add keys to be.ts**

```typescript
  familyFeed: {
    title: 'Сямейная стужка',
    showAll: 'Паказаць усё',
    today: 'Сёння',
    yesterday: 'Учора',
    expenses: '{{count}} выдаткі · {{amount}}',
    incomes: '{{count}} даходы · {{amount}}',
    proposedPurchase: 'прапанаваў/ла пакупку',
    purchaseApproved: 'Пакупка зацверджана',
    purchaseMade: 'Куплена!',
    noActivity: 'Няма актыўнасці',
    noActivityDesc: 'Тут будуць адлюстроўвацца выдаткі і пакупкі ўсіх удзельнікаў рахунку',
    expand: 'Паказаць дэталі',
    collapse: 'Схаваць дэталі',
    reactAdded: 'Рэакцыя дададзена',
    reactRemoved: 'Рэакцыя выдалена',
  },
```

- [ ] **Step 9: Add keys to nl.ts**

```typescript
  familyFeed: {
    title: 'Gezinsfeed',
    showAll: 'Alles weergeven',
    today: 'Vandaag',
    yesterday: 'Gisteren',
    expenses: '{{count}} uitgaven · {{amount}}',
    incomes: '{{count}} inkomsten · {{amount}}',
    proposedPurchase: 'stelde een aankoop voor',
    purchaseApproved: 'Aankoop goedgekeurd',
    purchaseMade: 'Gekocht!',
    noActivity: 'Nog geen activiteit',
    noActivityDesc: 'Uitgaven en aankopen van alle accountleden verschijnen hier',
    expand: 'Details tonen',
    collapse: 'Details verbergen',
    reactAdded: 'Reactie toegevoegd',
    reactRemoved: 'Reactie verwijderd',
  },
```

- [ ] **Step 10: Verify TypeScript**

```bash
cd apps/mobile
npx tsc --noEmit 2>&1 | grep "locales"
```
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add apps/mobile/src/i18n/locales/
git commit -m "feat(mobile): familyFeed i18n namespace in all 9 locales"
```

---

### Task 8: Mobile components — FeedGroupCard + EmojiReactionBar

**Files:**
- Create: `apps/mobile/src/components/feed/EmojiReactionBar.tsx`
- Create: `apps/mobile/src/components/feed/FeedGroupCard.tsx`

**Interfaces:**
- Consumes: `FeedGroup` from `@budget/shared-types`; `useFamilyFeedStore` (Task 6); `useTheme`, `useStyles` from `@/theme`; `useTranslation` from `react-i18next`; `formatCurrency` from `@budget/shared-utils`.
- Produces: `<EmojiReactionBar>` and `<FeedGroupCard>` used by Tasks 9.

- [ ] **Step 1: Create EmojiReactionBar**

Create `apps/mobile/src/components/feed/EmojiReactionBar.tsx`:

```tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { useTheme } from '@/theme';

const EMOJIS = ['👍', '❤️', '😮', '😂', '🔥', '😬'] as const;

interface ReactionSummary {
  emoji: string;
  count: number;
  userIds: string[];
}

interface EmojiReactionBarProps {
  eventId: string;
  reactions: ReactionSummary[];
  myReaction: string | null;
  onReact: (eventId: string, emoji: string) => void;
  onRemove: (eventId: string) => void;
}

export function EmojiReactionBar({ eventId, reactions, myReaction, onReact, onRemove }: EmojiReactionBarProps) {
  const theme = useTheme();
  const [pickerVisible, setPickerVisible] = useState(false);

  const handleEmojiTap = (emoji: string) => {
    setPickerVisible(false);
    if (myReaction === emoji) {
      onRemove(eventId);
    } else {
      onReact(eventId, emoji);
    }
  };

  return (
    <View style={styles.row}>
      {reactions.map((r) => (
        <TouchableOpacity
          key={r.emoji}
          style={[
            styles.chip,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            myReaction === r.emoji && { borderColor: theme.colors.primary },
          ]}
          onPress={() => handleEmojiTap(r.emoji)}
        >
          <Text style={styles.emojiText}>{r.emoji}</Text>
          <Text style={[styles.countText, { color: theme.colors.textSecondary }]}>{r.count}</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={[styles.addBtn, { borderColor: theme.colors.border }]}
        onPress={() => setPickerVisible(true)}
      >
        <Text style={[styles.addText, { color: theme.colors.textSecondary }]}>＋</Text>
      </TouchableOpacity>

      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setPickerVisible(false)}>
          <View style={[styles.picker, { backgroundColor: theme.colors.card }]}>
            {EMOJIS.map((emoji) => (
              <TouchableOpacity key={emoji} style={styles.pickerEmoji} onPress={() => handleEmojiTap(emoji)}>
                <Text style={styles.pickerEmojiText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  emojiText: { fontSize: 14 },
  countText: { fontSize: 12 },
  addBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  addText: { fontSize: 14 },
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  picker: { flexDirection: 'row', padding: 12, borderRadius: 16, gap: 8 },
  pickerEmoji: { padding: 8 },
  pickerEmojiText: { fontSize: 24 },
});
```

- [ ] **Step 2: Create FeedGroupCard**

Create `apps/mobile/src/components/feed/FeedGroupCard.tsx`:

```tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { formatCurrency } from '@budget/shared-utils';
import { useAuthStore } from '@/stores/authStore';
import { useFamilyFeedStore } from '@/stores/familyFeedStore';
import { EmojiReactionBar } from './EmojiReactionBar';
import type { FeedGroup } from '@budget/shared-types';

interface FeedGroupCardProps {
  group: FeedGroup;
}

export function FeedGroupCard({ group }: FeedGroupCardProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { react, removeReaction } = useFamilyFeedStore();
  const baseCurrency = useAuthStore((s) => s.user?.currencyCode) ?? 'USD';
  const [expanded, setExpanded] = useState(false);

  const isToday = group.date === new Date().toISOString().slice(0, 10);
  const isYesterday =
    group.date ===
    new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const dateLabel = isToday
    ? t('familyFeed.today')
    : isYesterday
    ? t('familyFeed.yesterday')
    : group.date;

  const isPR =
    group.type === 'purchase_request_created' ||
    group.type === 'purchase_request_approved' ||
    group.type === 'purchase_request_purchased';

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
      {/* Header row */}
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: theme.colors.primary + '33' }]}>
          <Text style={[styles.avatarText, { color: theme.colors.primary }]}>
            {group.userName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.userName, { color: theme.colors.textPrimary }]}>{group.userName}</Text>
          <Text style={[styles.dateLabel, { color: theme.colors.textSecondary }]}>{dateLabel}</Text>
        </View>
        {isPR && group.purchaseRequest && (
          <View style={[styles.statusBadge, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.statusText, { color: theme.colors.textSecondary }]}>
              {group.type === 'purchase_request_approved'
                ? t('familyFeed.purchaseApproved')
                : group.type === 'purchase_request_purchased'
                ? t('familyFeed.purchaseMade')
                : 'PENDING'}
            </Text>
          </View>
        )}
      </View>

      {/* Body */}
      {isPR && group.purchaseRequest ? (
        <TouchableOpacity
          onPress={() => router.push(`/purchase-requests/${group.purchaseRequest!.id}`)}
          style={styles.body}
        >
          <Text style={[styles.bodyTitle, { color: theme.colors.textPrimary }]}>
            {group.userName} {t('familyFeed.proposedPurchase')}
          </Text>
          <Text style={[styles.bodyAmount, { color: theme.colors.textPrimary }]}>
            {group.purchaseRequest.title} ·{' '}
            {formatCurrency(group.purchaseRequest.amount, group.purchaseRequest.currency)}
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.body}>
          {group.count === 1 && group.eventIds ? (
            <TouchableOpacity
              onPress={() =>
                router.push(
                  group.type === 'expenses'
                    ? `/expense/${group.eventIds![0]}`
                    : `/income/${group.eventIds![0]}`,
                )
              }
            >
              <Text style={[styles.bodyAmount, { color: theme.colors.textPrimary }]}>
                {formatCurrency(group.totalAmount ?? 0, group.currency ?? baseCurrency)}
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <Text style={[styles.bodyAmount, { color: theme.colors.textPrimary }]}>
                {t(group.type === 'expenses' ? 'familyFeed.expenses' : 'familyFeed.incomes', {
                  count: group.count,
                  amount: formatCurrency(group.totalAmount ?? 0, group.currency ?? baseCurrency),
                })}
              </Text>
              <TouchableOpacity onPress={() => setExpanded((v) => !v)} style={styles.expandBtn}>
                <Text style={[styles.expandText, { color: theme.colors.primary }]}>
                  {expanded ? t('familyFeed.collapse') : t('familyFeed.expand')}
                </Text>
              </TouchableOpacity>
              {expanded && group.eventIds && (
                <View style={styles.expandedList}>
                  {group.eventIds.map((eid) => (
                    <TouchableOpacity
                      key={eid}
                      onPress={() =>
                        router.push(group.type === 'expenses' ? `/expense/${eid}` : `/income/${eid}`)
                      }
                    >
                      <Text style={[styles.expandedRow, { color: theme.colors.textSecondary }]}>· {eid}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      )}

      {/* Reactions */}
      <EmojiReactionBar
        eventId={group.id}
        reactions={group.reactions}
        myReaction={group.myReaction}
        onReact={react}
        onRemove={removeReaction}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '600' },
  headerText: { flex: 1 },
  userName: { fontSize: 14, fontWeight: '600' },
  dateLabel: { fontSize: 12 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11 },
  body: { marginBottom: 4 },
  bodyTitle: { fontSize: 13, marginBottom: 2 },
  bodyAmount: { fontSize: 15, fontWeight: '600' },
  expandBtn: { marginTop: 4 },
  expandText: { fontSize: 13 },
  expandedList: { marginTop: 4, gap: 2 },
  expandedRow: { fontSize: 13 },
});
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd apps/mobile
npx tsc --noEmit 2>&1 | grep "feed/"
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/feed/
git commit -m "feat(mobile): FeedGroupCard and EmojiReactionBar components"
```

---

### Task 9: Mobile screen + widget + home screen integration

**Files:**
- Create: `apps/mobile/app/family-feed/index.tsx`
- Create: `apps/mobile/src/components/widgets/FamilyFeedWidget.tsx`
- Modify: `apps/mobile/src/stores/widgetVisibilityStore.ts`
- Modify: `apps/mobile/app/(tabs)/index.tsx`
- Modify: `apps/mobile/app/_layout.tsx`

**Interfaces:**
- Consumes: `FeedGroupCard` (Task 8), `useFamilyFeedStore` (Task 6), `useAccountStore`, `useTheme`, `useStyles`, `useTranslation`.
- Produces: full feed screen at `/family-feed`, `FamilyFeedWidget` on home, `'familyFeed'` in widget order.

- [ ] **Step 1: Create full feed screen**

Create `apps/mobile/app/family-feed/index.tsx`:

```tsx
import React, { useCallback } from 'react';
import { View, FlatList, Text, ActivityIndicator, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useFamilyFeedStore } from '@/stores/familyFeedStore';
import { FeedGroupCard } from '@/components/feed/FeedGroupCard';
import type { FeedGroup } from '@budget/shared-types';

export default function FamilyFeedScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { groups, isLoading, loadFeed } = useFamilyFeedStore();

  useFocusEffect(
    useCallback(() => {
      void loadFeed();
    }, [loadFeed]),
  );

  const renderItem = useCallback(({ item }: { item: FeedGroup }) => <FeedGroupCard group={item} />, []);
  const keyExtractor = useCallback((item: FeedGroup) => item.id, []);

  if (isLoading && groups.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      data={groups}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      contentContainerStyle={[styles.list, groups.length === 0 && styles.emptyContainer]}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={loadFeed} tintColor={theme.colors.primary} />
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>{t('familyFeed.noActivity')}</Text>
          <Text style={[styles.emptyDesc, { color: theme.colors.textSecondary }]}>{t('familyFeed.noActivityDesc')}</Text>
        </View>
      }
    />
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    list: { padding: 16, paddingBottom: 40 },
    emptyContainer: { flex: 1 },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, paddingHorizontal: 32 },
    emptyTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
    emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  });
```

- [ ] **Step 2: Create FamilyFeedWidget**

Create `apps/mobile/src/components/widgets/FamilyFeedWidget.tsx`:

```tsx
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useFamilyFeedStore } from '@/stores/familyFeedStore';
import { FeedGroupCard } from '@/components/feed/FeedGroupCard';

export function FamilyFeedWidget() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const router = useRouter();
  const { groups, loadFeed } = useFamilyFeedStore();

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const preview = groups.slice(0, 3);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{t('familyFeed.title')}</Text>
        <TouchableOpacity onPress={() => router.push('/family-feed')}>
          <Text style={[styles.showAll, { color: theme.colors.primary }]}>{t('familyFeed.showAll')}</Text>
        </TouchableOpacity>
      </View>

      {preview.length === 0 ? (
        <Text style={[styles.empty, { color: theme.colors.textSecondary }]}>{t('familyFeed.noActivity')}</Text>
      ) : (
        preview.map((group) => <FeedGroupCard key={group.id} group={group} />)
      )}
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    title: { fontSize: 16, fontWeight: '700' },
    showAll: { fontSize: 14 },
    empty: { fontSize: 14, textAlign: 'center', paddingVertical: 12 },
  });
```

- [ ] **Step 3: Add 'familyFeed' to WIDGET_KEYS**

In `apps/mobile/src/stores/widgetVisibilityStore.ts`, find `WIDGET_KEYS` array and add `'familyFeed'` after `'safeToSpend'`:

```typescript
export const WIDGET_KEYS = [
  'safeToSpend',
  'familyFeed',       // ← add this
  'financialHealth',
  // ...rest unchanged
] as const;
```

- [ ] **Step 4: Register Stack screen in _layout.tsx**

In `apps/mobile/app/_layout.tsx`, find the section with other Stack.Screen registrations (e.g., near the purchase-requests ones) and add:

```tsx
<Stack.Screen
  name="family-feed/index"
  options={{ title: t('familyFeed.title'), headerBackTitle: '' }}
/>
```

(The `t` function is already imported and used in `_layout.tsx`.)

- [ ] **Step 5: Add FamilyFeedWidget to home screen**

In `apps/mobile/app/(tabs)/index.tsx`:

Add import:
```tsx
import { FamilyFeedWidget } from '@/components/widgets/FamilyFeedWidget';
```

Add import for `useAccountStore`:
```tsx
// If not already imported:
import { useAccountStore } from '@/stores/accountStore';
```

Inside the component, add:
```tsx
const currentAccountType = useAccountStore((s) => s.currentAccount()?.type);
```

In the widget switch (inside the `widgetOrder.map(...)` block), add a case:
```tsx
case 'familyFeed':
  return widgetVisibility.familyFeed && currentAccountType !== 'personal'
    ? <FamilyFeedWidget key="familyFeed" />
    : null;
```

- [ ] **Step 6: TypeScript check**

```bash
cd apps/mobile
npx tsc --noEmit 2>&1 | grep -E "family-feed|FamilyFeed|familyFeed"
```
Expected: no errors.

- [ ] **Step 7: Run full API test suite to confirm no regressions**

```bash
cd apps/api
npx jest --no-coverage 2>&1 | tail -10
```
Expected: all tests pass (new family-feed tests + existing tests).

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/app/family-feed/ apps/mobile/src/components/widgets/FamilyFeedWidget.tsx apps/mobile/src/stores/widgetVisibilityStore.ts apps/mobile/app/_layout.tsx apps/mobile/app/\(tabs\)/index.tsx
git commit -m "feat(mobile): Family Feed full screen, home widget, Stack registration"
```
