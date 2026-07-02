# Group Trip Wallet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new temporary shared-account type (`AccountType.trip`) where members split trip expenses (equal/exact/percentage/shares) and settle debts via a reusable settle-up module, with quick-invite auto-accept and a manual/cron-driven trip lifecycle.

**Architecture:** New Prisma models (`TripExpenseShare`, `SettleUpTransaction`) plus additive fields on `Account`/`AccountMember`/`Expense`. A new standalone `trip-settle-up` API module owns balance calculation and debt simplification as pure, independently-testable functions. Mobile follows the existing offline-first pattern for expenses/shares (mirrors `ExpenseCategorySplit`/`splitRepository.ts`) but keeps settle-up balances server-only (mirrors `purchaseRequestStore`/`familyFeedStore`), since balances require cross-member consistency.

**Tech Stack:** NestJS 10 + Prisma 5 + PostgreSQL (API), Expo 54 + React Native 0.81 + Zustand + SQLite/Drizzle (mobile), shared TypeScript types in `packages/shared-types`.

**Reference spec:** `docs/superpowers/specs/2026-07-01-group-trip-wallet-design.md` — read it before starting; this plan implements every section of it except the items explicitly marked "Out of Scope" there (Pro-tier limits, real PSP integration, BLIK deep-linking, anonymous guests, shared↔trip conversion, item-level receipt splitting).

## Global Constraints

- Every new Prisma model/field is **additive** — no destructive changes to existing columns (`paidByUserId` and `AccountMember.paymentMethod/paymentHandle` are nullable; existing rows need no backfill).
- Debts are computed and stored in `Account.currencyCode` (the trip's currency); per-viewer currency conversion happens **client-side only** via the existing `convertAmount`/`exchangeRateStore` — no new server-side per-user conversion endpoint.
- `TripExpenseShare` splitting is a **separate mechanism** from the existing category-based `ExpenseCategorySplit`/`SplitEditor` — do not conflate or reuse those files.
- `SettleUpTransaction` and the `trip-settle-up` module must not hard-depend on `AccountType.trip` in their Prisma relations or service logic — they operate on any `accountId`, so a future non-trip "Household Settle-Up" can reuse them unchanged.
- No Pro-tier gating, limits, or paywall checks anywhere in this feature (explicit spec decision — revisit later).
- Mobile domain API files follow the existing plain-object-literal + `httpClient.request<T>()` convention (see `userSubscriptions.api.ts`) — no new abstraction layer.
- All new user-facing strings go in `trip.*` (screens) and existing notification-i18n namespaces, across all 9 locales (`en, de, es, fr, pl, ru, ua, be, nl`) — never ship a key only in `en.ts`.
- Follow the repo's Dependency Order for Changes (shared-types → Prisma schema → API → mobile SQLite → mobile stores → mobile API client → mobile screens → i18n).

---

## Phase 1 — Data Model

### Task 1: Prisma schema changes + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create (generated): `apps/api/prisma/migrations/<timestamp>_add_trip_wallet/migration.sql`

**Interfaces:**
- Produces: `AccountType.trip`, `TripStatus`, `ShareType`, `SettleMethod`, `SettleStatus` enums; `Account.tripStartDate/tripEndDate/tripStatus`; `AccountMember.paymentMethod/paymentHandle`; `Expense.paidByUserId` + `Expense.shares` relation; `TripExpenseShare` model; `SettleUpTransaction` model. All later API tasks depend on these Prisma Client types.

- [ ] **Step 1: Edit `schema.prisma` — extend `AccountType` and add new enums**

Find the existing enum:
```prisma
enum AccountType {
  personal
  business
  shared
  investment
}
```
Replace with:
```prisma
enum AccountType {
  personal
  business
  shared
  investment
  trip
}

enum TripStatus {
  active
  settling
  archived
}

enum ShareType {
  equal
  exact
  percentage
  shares
}

enum SettleMethod {
  blik
  revolut
  paypal
  cash
  other
}

enum SettleStatus {
  pending
  confirmed
}
```

- [ ] **Step 2: Add fields to `Account`**

In `model Account { ... }`, add:
```prisma
  tripStartDate DateTime?   @db.Date
  tripEndDate   DateTime?   @db.Date
  tripStatus    TripStatus?
  settleUpTransactions SettleUpTransaction[]
```

- [ ] **Step 3: Add fields to `AccountMember`**

In `model AccountMember { ... }`, add:
```prisma
  paymentMethod SettleMethod?
  paymentHandle String?
```

- [ ] **Step 4: Add fields to `Expense`**

In `model Expense { ... }`, add:
```prisma
  paidByUserId String?
  shares       TripExpenseShare[]
```

- [ ] **Step 5: Add the two new models**

Add at the end of the relevant section of `schema.prisma`:
```prisma
model TripExpenseShare {
  id          String    @id @default(uuid())
  expenseId   String
  expense     Expense   @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  shareType   ShareType
  shareAmount Decimal   @db.Decimal(12, 2)
  createdAt   DateTime  @default(now())

  @@unique([expenseId, userId])
  @@index([userId])
  @@map("trip_expense_shares")
}

model SettleUpTransaction {
  id          String        @id @default(uuid())
  accountId   String
  account     Account       @relation(fields: [accountId], references: [id], onDelete: Cascade)
  fromUserId  String
  toUserId    String
  amount      Decimal       @db.Decimal(12, 2)
  method      SettleMethod?
  status      SettleStatus  @default(pending)
  confirmedAt DateTime?
  createdAt   DateTime      @default(now())

  @@index([accountId])
  @@map("settle_up_transactions")
}
```

- [ ] **Step 6: Add the reverse relation on `User`**

In `model User { ... }`, add:
```prisma
  tripExpenseShares TripExpenseShare[]
```

- [ ] **Step 7: Generate and run the migration**

Run (from `apps/api/`):
```bash
npx prisma migrate dev --name add_trip_wallet
```
Expected: prompts for the migration name if not passed inline, then prints `Your database is now in sync with your schema.` and creates `prisma/migrations/<timestamp>_add_trip_wallet/migration.sql`.

- [ ] **Step 8: Regenerate the Prisma client**

Run (from `apps/api/`):
```bash
npx prisma generate
```
Expected: `Generated Prisma Client ... in ...ms`.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): add trip wallet schema (AccountType.trip, TripExpenseShare, SettleUpTransaction)"
```

---

### Task 2: Shared-types — entities and DTOs

**Files:**
- Modify: `packages/shared-types/src/entities/index.ts`
- Modify: `packages/shared-types/src/dto/index.ts`

**Interfaces:**
- Consumes: none (pure type declarations).
- Produces: `AccountType` (extended), `TripStatus`, `ShareType`, `SettleMethod`, `SettleStatus`, `TripExpenseShare`, `SettleUpTransaction` entity types; `ExpenseShareDto`, extended `CreateExpenseDto`/`UpdateExpenseDto`, `SettleUpResponse`, `SettleUpPayDto`, `AccountMemberPaymentInfoDto`, extended `CreateAccountDto`. All API and mobile tasks import these.

- [ ] **Step 1: Extend `packages/shared-types/src/entities/index.ts`**

Find the existing `AccountType` union:
```typescript
export type AccountType = 'personal' | 'business' | 'shared' | 'investment';
```
Replace with:
```typescript
export type AccountType = 'personal' | 'business' | 'shared' | 'investment' | 'trip';

export type TripStatus = 'active' | 'settling' | 'archived';
export type ShareType = 'equal' | 'exact' | 'percentage' | 'shares';
export type SettleMethod = 'blik' | 'revolut' | 'paypal' | 'cash' | 'other';
export type SettleStatus = 'pending' | 'confirmed';

export interface TripExpenseShare {
  id: string;
  expenseId: string;
  userId: string;
  shareType: ShareType;
  shareAmount: number;
  createdAt: string;
}

export interface SettleUpTransaction {
  id: string;
  accountId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  method: SettleMethod | null;
  status: SettleStatus;
  confirmedAt: string | null;
  createdAt: string;
}
```

Also find the `Account` interface and add the trip fields:
```typescript
export interface Account {
  // ...existing fields...
  tripStartDate?: string;
  tripEndDate?: string;
  tripStatus?: TripStatus;
}
```

Find the `AccountMember` interface and add:
```typescript
export interface AccountMember {
  // ...existing fields...
  paymentMethod?: SettleMethod;
  paymentHandle?: string;
}
```

Find the `Expense` interface and add:
```typescript
export interface Expense {
  // ...existing fields...
  paidByUserId?: string | null;
}
```

- [ ] **Step 2: Extend `packages/shared-types/src/dto/index.ts`**

Add near the expense DTOs:
```typescript
export interface ExpenseShareDto {
  userId: string;
  value: number; // interpretation depends on the parent request's splitType
}
```

Find `CreateExpenseDto` and `UpdateExpenseDto` and add to both:
```typescript
  splitType?: ShareType;
  shares?: ExpenseShareDto[];
  paidByUserId?: string;
```

Add new DTOs:
```typescript
export interface SettleUpBalance {
  userId: string;
  userName: string;
  netAmount: number; // in Account.currencyCode; positive = is owed, negative = owes
}

export interface SuggestedTransfer {
  fromUserId: string;
  toUserId: string;
  amount: number; // in Account.currencyCode
}

export interface SettleUpResponse {
  balances: SettleUpBalance[];
  suggestedTransfers: SuggestedTransfer[];
  currencyCode: Currency;
  fxApproximate: boolean;
}

export interface SettleUpPayDto {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export interface SettleUpPayResponse {
  transactionId: string;
  paymentLink: string | null;
  manualInstructions: boolean;
  paymentHandle: string | null;
}

export interface AccountMemberPaymentInfoDto {
  paymentMethod: SettleMethod;
  paymentHandle: string;
}
```

Find `CreateAccountDto` and add:
```typescript
  tripStartDate?: string;
  tripEndDate?: string; // required by the API when type === 'trip'
```

- [ ] **Step 3: Typecheck**

Run (from repo root):
```bash
npm run typecheck
```
Expected: no new errors from `packages/shared-types` (downstream errors in `apps/api`/`apps/mobile` are expected and fixed in later tasks — confirm the failures listed are only in files this plan will touch next, e.g. `expenses.service.ts`, `accounts.service.ts`).

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types
git commit -m "feat(types): add trip wallet entities and DTOs"
```

---

### Task 3: Shared-types — sync DTO for `tripExpenseShare`

**Files:**
- Modify: `packages/shared-types/src/dto/sync.ts`

**Interfaces:**
- Consumes: `ShareType` from Task 2.
- Produces: `SyncTripExpenseSharePayload`, extended `SyncEntityType` and `SyncChange` union. Consumed by Task 15 (`sync.service.ts`) and Task 16 (mobile repository/sync push).

- [ ] **Step 1: Extend `SyncEntityType`**

Find:
```typescript
export type SyncEntityType = 'expense' | 'income' | 'budget' | /* ...existing... */;
```
Add `'tripExpenseShare'` to the union.

- [ ] **Step 2: Add the payload interface and union member**

```typescript
export interface SyncTripExpenseSharePayload {
  expenseId: string;
  userId: string;
  shareType: ShareType;
  shareAmount: number;
}
```

Find the `SyncChange` discriminated union and add a member following the existing style (e.g. mirroring the `'tag'` member):
```typescript
  | (SyncChangeBase & { entityType: 'tripExpenseShare'; payload: SyncTripExpenseSharePayload })
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```
Expected: same as Task 2 Step 3 — no new failures beyond files this plan still needs to touch.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types/src/dto/sync.ts
git commit -m "feat(types): add tripExpenseShare sync entity type"
```

---

## Phase 2 — API: Accounts (trip creation, lifecycle, payment info)

### Task 4: Extend account creation for `type: 'trip'`

**Files:**
- Modify: `apps/api/src/modules/accounts/dto/index.ts`
- Modify: `apps/api/src/modules/accounts/accounts.service.ts`
- Test: `apps/api/src/modules/accounts/accounts.service.spec.ts`

**Interfaces:**
- Consumes: `CreateAccountDto` (extended, Task 2).
- Produces: `AccountsService.create()` validates and persists `tripStartDate`/`tripEndDate`/`tripStatus: 'active'` when `type === 'trip'`.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/modules/accounts/accounts.service.spec.ts`:
```typescript
describe('create — trip accounts', () => {
  it('throws BadRequestException when type is trip and tripEndDate is missing', async () => {
    await expect(
      service.create(userId, { name: 'Bali trip', type: 'trip' } as CreateAccountDto),
    ).rejects.toThrow('tripEndDate is required for trip accounts');
  });

  it('defaults tripStartDate to today and sets tripStatus to active', async () => {
    const account = await service.create(userId, {
      name: 'Bali trip',
      type: 'trip',
      tripEndDate: '2026-08-10',
    } as CreateAccountDto);
    expect(account.tripStatus).toBe('active');
    expect(account.tripStartDate).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/api/`):
```bash
npx jest src/modules/accounts/accounts.service.spec.ts -t "trip accounts"
```
Expected: FAIL — `tripEndDate is required for trip accounts` error not thrown (current `create()` has no trip validation).

- [ ] **Step 3: Implement in `accounts.service.ts`**

At the top of `create()` (before the existing account-creation logic), add:
```typescript
if (dto.type === 'trip') {
  if (!dto.tripEndDate) {
    throw new BadRequestException('tripEndDate is required for trip accounts');
  }
}
```

Where the `data` object is built for `this.prisma.account.create(...)`, add:
```typescript
  ...(dto.type === 'trip'
    ? {
        tripStartDate: dto.tripStartDate ? new Date(dto.tripStartDate) : new Date(),
        tripEndDate: new Date(dto.tripEndDate),
        tripStatus: 'active' as const,
      }
    : {}),
```

Ensure `BadRequestException` is imported from `@nestjs/common` at the top of the file if not already present.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest src/modules/accounts/accounts.service.spec.ts -t "trip accounts"
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/accounts/dto/index.ts apps/api/src/modules/accounts/accounts.service.ts apps/api/src/modules/accounts/accounts.service.spec.ts
git commit -m "feat(accounts): validate and create trip-type accounts"
```

---

### Task 5: Archive-trip endpoint + `TripArchivedGuard`

**Files:**
- Create: `apps/api/src/modules/accounts/guards/trip-archived.guard.ts`
- Modify: `apps/api/src/modules/accounts/accounts.controller.ts`
- Modify: `apps/api/src/modules/accounts/accounts.service.ts`
- Test: `apps/api/src/modules/accounts/guards/trip-archived.guard.spec.ts`
- Test: `apps/api/src/modules/accounts/accounts.controller.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (existing), `req.accountId` (set by `AccountContextGuard`, existing).
- Produces: `TripArchivedGuard` (DI-based `CanActivate`, applied like `@UseGuards(TripArchivedGuard)` — not `new TripArchivedGuard()`, since it needs `PrismaService` injected). `AccountsService.archiveTrip(accountId, userId)`. `PATCH /accounts/:id/archive-trip`. This guard is reused in Task 7 (expenses) and Task 11 (settle-up pay).

**Scope note:** applied in this plan to the endpoints that matter for a trip's core purpose — expense/income mutation (Task 7 wires it into the expenses module) and the account's own settings endpoints. Extending it to every other account-scoped module follows the exact same `@UseGuards` pattern and can be added incrementally, same as the historical `ViewerBlockGuard` rollout.

- [ ] **Step 1: Write the failing guard test**

Create `apps/api/src/modules/accounts/guards/trip-archived.guard.spec.ts`:
```typescript
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { TripArchivedGuard } from './trip-archived.guard';
import { PrismaService } from '../../../prisma/prisma.service';

describe('TripArchivedGuard', () => {
  function mockContext(accountId: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ accountId, method: 'POST' }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows the request when the account is not archived', async () => {
    const prisma = {
      account: { findUnique: jest.fn().mockResolvedValue({ tripStatus: 'active' }) },
    } as unknown as PrismaService;
    const guard = new TripArchivedGuard(prisma);
    await expect(guard.canActivate(mockContext('acc-1'))).resolves.toBe(true);
  });

  it('throws ForbiddenException when the account is archived', async () => {
    const prisma = {
      account: { findUnique: jest.fn().mockResolvedValue({ tripStatus: 'archived' }) },
    } as unknown as PrismaService;
    const guard = new TripArchivedGuard(prisma);
    await expect(guard.canActivate(mockContext('acc-1'))).rejects.toThrow(ForbiddenException);
  });

  it('allows non-trip accounts (tripStatus is null)', async () => {
    const prisma = {
      account: { findUnique: jest.fn().mockResolvedValue({ tripStatus: null }) },
    } as unknown as PrismaService;
    const guard = new TripArchivedGuard(prisma);
    await expect(guard.canActivate(mockContext('acc-1'))).resolves.toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/modules/accounts/guards/trip-archived.guard.spec.ts
```
Expected: FAIL — `Cannot find module './trip-archived.guard'`.

- [ ] **Step 3: Implement the guard**

Create `apps/api/src/modules/accounts/guards/trip-archived.guard.ts`:
```typescript
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class TripArchivedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const account = await this.prisma.account.findUnique({
      where: { id: request.accountId },
      select: { tripStatus: true },
    });
    if (account?.tripStatus === 'archived') {
      throw new ForbiddenException('This trip is archived and can no longer be modified');
    }
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest src/modules/accounts/guards/trip-archived.guard.spec.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing controller/service test for archive-trip**

Add to `apps/api/src/modules/accounts/accounts.controller.spec.ts`:
```typescript
describe('archiveTrip', () => {
  it('archives the trip when all settle-up transactions are confirmed', async () => {
    accountsService.archiveTrip = jest.fn().mockResolvedValue({ id: 'acc-1', tripStatus: 'archived' });
    const result = await controller.archiveTrip({ user: { id: 'user-1' } } as any, 'acc-1', {});
    expect(result.tripStatus).toBe('archived');
    expect(accountsService.archiveTrip).toHaveBeenCalledWith('acc-1', 'user-1', undefined);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npx jest src/modules/accounts/accounts.controller.spec.ts -t "archiveTrip"
```
Expected: FAIL — `controller.archiveTrip is not a function`.

- [ ] **Step 7: Implement `archiveTrip` in service and controller**

In `accounts.service.ts`, add:
```typescript
async archiveTrip(accountId: string, userId: string, force?: boolean) {
  const account = await this.prisma.account.findFirst({ where: { id: accountId, ownerId: userId } });
  if (!account) {
    throw new ForbiddenException('Only the trip owner can archive it');
  }
  if (!force) {
    const unconfirmed = await this.prisma.settleUpTransaction.count({
      where: { accountId, status: 'pending' },
    });
    if (unconfirmed > 0) {
      throw new BadRequestException('There are unconfirmed settle-up transactions — pass force to archive anyway');
    }
  }
  return this.prisma.account.update({
    where: { id: accountId },
    data: { tripStatus: 'archived' },
  });
}
```

In `accounts.controller.ts`, add:
```typescript
@Patch(':id/archive-trip')
async archiveTrip(
  @Req() req: AuthenticatedRequest,
  @Param('id') id: string,
  @Body() body: { force?: boolean },
) {
  return this.accountsService.archiveTrip(id, req.user.id, body.force);
}
```
Ensure `Patch`, `Param`, `Body`, `Req` are already imported (they are, per existing controller methods).

- [ ] **Step 8: Run test to verify it passes**

```bash
npx jest src/modules/accounts/accounts.controller.spec.ts -t "archiveTrip"
```
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/accounts/guards/trip-archived.guard.ts apps/api/src/modules/accounts/guards/trip-archived.guard.spec.ts apps/api/src/modules/accounts/accounts.controller.ts apps/api/src/modules/accounts/accounts.controller.spec.ts apps/api/src/modules/accounts/accounts.service.ts
git commit -m "feat(accounts): add TripArchivedGuard and archive-trip endpoint"
```

---

### Task 6: `AccountMember` payment-info endpoint

**Files:**
- Modify: `apps/api/src/modules/accounts/accounts.controller.ts`
- Modify: `apps/api/src/modules/accounts/accounts.service.ts`
- Test: `apps/api/src/modules/accounts/accounts.service.spec.ts`

**Interfaces:**
- Consumes: `AccountMemberPaymentInfoDto` (Task 2).
- Produces: `AccountsService.updatePaymentInfo(accountId, userId, dto)`; `PATCH /accounts/:id/members/me/payment-info`. Consumed by Task 11's payment-link generation and Task 20 (mobile API client).

- [ ] **Step 1: Write the failing test**

```typescript
describe('updatePaymentInfo', () => {
  it('sets paymentMethod and paymentHandle on the caller\'s own membership', async () => {
    prisma.accountMember.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    await service.updatePaymentInfo('acc-1', 'user-1', { paymentMethod: 'revolut', paymentHandle: 'jdoe' });
    expect(prisma.accountMember.updateMany).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', userId: 'user-1' },
      data: { paymentMethod: 'revolut', paymentHandle: 'jdoe' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/modules/accounts/accounts.service.spec.ts -t "updatePaymentInfo"
```
Expected: FAIL — `service.updatePaymentInfo is not a function`.

- [ ] **Step 3: Implement**

In `accounts.service.ts`:
```typescript
async updatePaymentInfo(accountId: string, userId: string, dto: AccountMemberPaymentInfoDto) {
  await this.prisma.accountMember.updateMany({
    where: { accountId, userId },
    data: { paymentMethod: dto.paymentMethod, paymentHandle: dto.paymentHandle },
  });
  return { paymentMethod: dto.paymentMethod, paymentHandle: dto.paymentHandle };
}
```

In `accounts.controller.ts`:
```typescript
@Patch(':id/members/me/payment-info')
async updatePaymentInfo(
  @Req() req: AuthenticatedRequest,
  @Param('id') id: string,
  @Body() dto: AccountMemberPaymentInfoDto,
) {
  return this.accountsService.updatePaymentInfo(id, req.user.id, dto);
}
```
Add `AccountMemberPaymentInfoDto` to the controller's imports from `@budget/shared-types`.

**Route-order note:** declare `:id/members/me/payment-info` **before** the existing `:id/members/:memberId` route in the controller, so Express doesn't match `me` as a `:memberId` param (same class of bug documented for `expenses.controller.ts` bulk routes).

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest src/modules/accounts/accounts.service.spec.ts -t "updatePaymentInfo"
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/accounts/accounts.controller.ts apps/api/src/modules/accounts/accounts.service.ts apps/api/src/modules/accounts/accounts.service.spec.ts
git commit -m "feat(accounts): add member payment-info endpoint for settle-up"
```

---

## Phase 3 — API: Expenses (`paidByUserId` + shares)

### Task 7: Trip share calculator (pure function)

**Files:**
- Create: `apps/api/src/modules/expenses/trip-share-calculator.ts`
- Test: `apps/api/src/modules/expenses/trip-share-calculator.spec.ts`

**Interfaces:**
- Consumes: `ShareType`, `ExpenseShareDto` (Task 2).
- Produces: `resolveShares(totalAmount, splitType, rawShares): { userId, shareAmount }[]`. Consumed by Task 8 (`ExpensesService.create/update`).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/modules/expenses/trip-share-calculator.spec.ts`:
```typescript
import { resolveShares } from './trip-share-calculator';

describe('resolveShares', () => {
  it('splits equally, assigning the rounding remainder to the last participant', () => {
    const result = resolveShares(100, 'equal', [
      { userId: 'a', value: 0 },
      { userId: 'b', value: 0 },
      { userId: 'c', value: 0 },
    ]);
    expect(result).toEqual([
      { userId: 'a', shareAmount: 33.33 },
      { userId: 'b', shareAmount: 33.33 },
      { userId: 'c', shareAmount: 33.34 },
    ]);
  });

  it('uses exact values and validates they sum to the total', () => {
    const result = resolveShares(90, 'exact', [
      { userId: 'a', value: 60 },
      { userId: 'b', value: 30 },
    ]);
    expect(result).toEqual([
      { userId: 'a', shareAmount: 60 },
      { userId: 'b', shareAmount: 30 },
    ]);
  });

  it('throws when exact values do not sum to the total', () => {
    expect(() =>
      resolveShares(90, 'exact', [
        { userId: 'a', value: 60 },
        { userId: 'b', value: 20 },
      ]),
    ).toThrow('Exact shares must sum to 90, got 80');
  });

  it('splits by percentage', () => {
    const result = resolveShares(200, 'percentage', [
      { userId: 'a', value: 25 },
      { userId: 'b', value: 75 },
    ]);
    expect(result).toEqual([
      { userId: 'a', shareAmount: 50 },
      { userId: 'b', shareAmount: 150 },
    ]);
  });

  it('splits by shares (units)', () => {
    const result = resolveShares(90, 'shares', [
      { userId: 'a', value: 2 },
      { userId: 'b', value: 1 },
    ]);
    expect(result).toEqual([
      { userId: 'a', shareAmount: 60 },
      { userId: 'b', shareAmount: 30 },
    ]);
  });

  it('throws when total share units are zero', () => {
    expect(() =>
      resolveShares(90, 'shares', [
        { userId: 'a', value: 0 },
        { userId: 'b', value: 0 },
      ]),
    ).toThrow('Total share units must be greater than zero');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/modules/expenses/trip-share-calculator.spec.ts
```
Expected: FAIL — `Cannot find module './trip-share-calculator'`.

- [ ] **Step 3: Implement**

Create `apps/api/src/modules/expenses/trip-share-calculator.ts`:
```typescript
export type ShareType = 'equal' | 'exact' | 'percentage' | 'shares';

export interface RawShare {
  userId: string;
  value: number;
}

export interface ResolvedShare {
  userId: string;
  shareAmount: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function distributeWithRemainder(totalAmount: number, portions: number[]): number[] {
  const sum = round2(portions.reduce((a, b) => a + b, 0));
  const remainder = round2(totalAmount - sum);
  const result = [...portions];
  result[result.length - 1] = round2(result[result.length - 1] + remainder);
  return result;
}

export function resolveShares(
  totalAmount: number,
  splitType: ShareType,
  rawShares: RawShare[],
): ResolvedShare[] {
  if (rawShares.length === 0) return [];

  switch (splitType) {
    case 'exact': {
      const sum = round2(rawShares.reduce((a, s) => a + s.value, 0));
      if (Math.abs(sum - totalAmount) > 0.01) {
        throw new Error(`Exact shares must sum to ${totalAmount}, got ${sum}`);
      }
      return rawShares.map((s) => ({ userId: s.userId, shareAmount: round2(s.value) }));
    }
    case 'equal': {
      const equalShare = Math.floor((totalAmount / rawShares.length) * 100) / 100;
      const portions = distributeWithRemainder(
        totalAmount,
        rawShares.map(() => equalShare),
      );
      return rawShares.map((s, i) => ({ userId: s.userId, shareAmount: portions[i] }));
    }
    case 'percentage': {
      const portions = distributeWithRemainder(
        totalAmount,
        rawShares.map((s) => Math.floor(totalAmount * (s.value / 100) * 100) / 100),
      );
      return rawShares.map((s, i) => ({ userId: s.userId, shareAmount: portions[i] }));
    }
    case 'shares': {
      const totalUnits = rawShares.reduce((sum, s) => sum + s.value, 0);
      if (totalUnits <= 0) {
        throw new Error('Total share units must be greater than zero');
      }
      const portions = distributeWithRemainder(
        totalAmount,
        rawShares.map((s) => Math.floor(totalAmount * (s.value / totalUnits) * 100) / 100),
      );
      return rawShares.map((s, i) => ({ userId: s.userId, shareAmount: portions[i] }));
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest src/modules/expenses/trip-share-calculator.spec.ts
```
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/expenses/trip-share-calculator.ts apps/api/src/modules/expenses/trip-share-calculator.spec.ts
git commit -m "feat(expenses): add pure trip share resolution calculator"
```

---

### Task 8: Wire `paidByUserId` + shares into `ExpensesService`

**Files:**
- Modify: `apps/api/src/modules/expenses/dto/index.ts`
- Modify: `apps/api/src/modules/expenses/expenses.service.ts`
- Modify: `apps/api/src/modules/expenses/expenses.controller.ts`
- Test: `apps/api/src/modules/expenses/expenses.service.spec.ts`

**Interfaces:**
- Consumes: `resolveShares` (Task 7), `TripArchivedGuard` (Task 5).
- Produces: `ExpensesService.create()`/`update()` persist `paidByUserId` and `TripExpenseShare` rows; expense create/update endpoints reject mutations on archived trips.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/modules/expenses/expenses.service.spec.ts`:
```typescript
describe('create — trip expense shares', () => {
  it('defaults paidByUserId to the creator and persists resolved shares', async () => {
    const { expense } = await service.create('trip-acc-1', 'alice', {
      localId: 'client-1',
      amount: 90,
      currencyCode: 'USD',
      date: '2026-08-01',
      source: 'manual',
      splitType: 'equal',
      shares: [{ userId: 'alice', value: 0 }, { userId: 'bob', value: 0 }, { userId: 'carol', value: 0 }],
    } as CreateExpenseDto);

    expect(expense.paidByUserId).toBe('alice');
    const shares = await prisma.tripExpenseShare.findMany({ where: { expenseId: expense.id } });
    expect(shares).toHaveLength(3);
    expect(shares.find((s) => s.userId === 'carol')?.shareAmount.toNumber()).toBe(30.0);
  });

  it('uses an explicit paidByUserId when provided', async () => {
    const { expense } = await service.create('trip-acc-1', 'alice', {
      localId: 'client-2',
      amount: 40,
      currencyCode: 'USD',
      date: '2026-08-01',
      source: 'manual',
      paidByUserId: 'bob',
      splitType: 'exact',
      shares: [{ userId: 'bob', value: 40 }],
    } as CreateExpenseDto);
    expect(expense.paidByUserId).toBe('bob');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/modules/expenses/expenses.service.spec.ts -t "trip expense shares"
```
Expected: FAIL — `expense.paidByUserId` is `undefined`/`null`, no `TripExpenseShare` rows created.

- [ ] **Step 3: Implement**

In `apps/api/src/modules/expenses/expenses.service.ts`, inside the `create()` method's `$transaction`, where `expenseData`/the Prisma `create` call is built (same place `merchant`/`projectId` are handled), add:
```typescript
paidByUserId: dto.paidByUserId ?? userId,
```
into the object passed to `tx.expense.create`/`upsert`.

After the expense row (`full`) is created inside the transaction, and after the existing `projectId` association block, add:
```typescript
if (dto.shares && dto.shares.length > 0) {
  const resolved = resolveShares(Number(full.amount), dto.splitType ?? 'equal', dto.shares);
  await tx.tripExpenseShare.deleteMany({ where: { expenseId: full.id } });
  await tx.tripExpenseShare.createMany({
    data: resolved.map((r) => ({
      expenseId: full.id,
      userId: r.userId,
      shareType: dto.splitType ?? 'equal',
      shareAmount: r.shareAmount,
    })),
  });
}
```
Add `import { resolveShares } from './trip-share-calculator';` at the top of the file.

Apply the identical block inside `update()`'s transaction (same delete+recreate — shares are always fully replaced on edit, never partially patched, matching the spec's "Expense edited after split submitted" edge case).

In `expenses.controller.ts`, add `TripArchivedGuard` to the existing `@UseGuards(...)` list on the `create`/`update`/`remove`/bulk endpoints, alongside the existing `ViewerBlockGuard`:
```typescript
import { TripArchivedGuard } from '../accounts/guards/trip-archived.guard';
// ...
@Post()
@UseGuards(new ViewerBlockGuard(), TripArchivedGuard)
async create(...) { ... }
```
Note `TripArchivedGuard` is passed as the **class** (DI-resolved), not `new TripArchivedGuard()` (it needs `PrismaService` injected) — this differs from `ViewerBlockGuard`'s `new` pattern; both can be listed in the same `@UseGuards(...)` call.

In `apps/api/src/modules/expenses/dto/index.ts`, extend `CreateExpenseDto`/`UpdateExpenseDto` classes with:
```typescript
@IsOptional()
@IsIn(['equal', 'exact', 'percentage', 'shares'])
splitType?: ShareType;

@IsOptional()
@IsArray()
shares?: ExpenseShareDto[];

@IsOptional()
@IsUUID()
paidByUserId?: string;
```
Import `ShareType`, `ExpenseShareDto` from `@budget/shared-types`, and ensure `IsIn`/`IsArray` are imported from `class-validator` (already used elsewhere in this file).

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest src/modules/expenses/expenses.service.spec.ts -t "trip expense shares"
```
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full expenses test suite to check for regressions**

```bash
npx jest src/modules/expenses/expenses.service.spec.ts src/modules/expenses/expenses.controller.spec.ts
```
Expected: all PASS (no regressions in non-trip expense flows, since `shares`/`paidByUserId` are optional and no-op when absent).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/expenses/dto/index.ts apps/api/src/modules/expenses/expenses.service.ts apps/api/src/modules/expenses/expenses.controller.ts apps/api/src/modules/expenses/expenses.service.spec.ts
git commit -m "feat(expenses): persist paidByUserId and trip expense shares"
```

---

## Phase 4 — API: Trip Settle-Up Module

### Task 9: Settle-up calculator (pure functions)

**Files:**
- Create: `apps/api/src/modules/trip-settle-up/settle-up-calculator.ts`
- Test: `apps/api/src/modules/trip-settle-up/settle-up-calculator.spec.ts`

**Interfaces:**
- Consumes: none (pure functions, no Prisma/NestJS dependency — this is the algorithmic core, kept independently testable per the spec's debt-simplification requirement).
- Produces: `computeBalances(expenses): Balance[]`, `simplifyDebts(balances): SuggestedTransfer[]`. Consumed by Task 10 (`TripSettleUpService`).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/modules/trip-settle-up/settle-up-calculator.spec.ts`:
```typescript
import { computeBalances, simplifyDebts } from './settle-up-calculator';

describe('computeBalances', () => {
  it('nets a single expense paid by one person and split equally among three', () => {
    const balances = computeBalances([
      {
        expenseId: 'e1',
        paidByUserId: 'alice',
        amountInAccountCurrency: 90,
        shares: [
          { userId: 'alice', shareAmount: 30 },
          { userId: 'bob', shareAmount: 30 },
          { userId: 'carol', shareAmount: 30 },
        ],
      },
    ]);
    expect(balances.find((b) => b.userId === 'alice')?.netAmount).toBe(60);
    expect(balances.find((b) => b.userId === 'bob')?.netAmount).toBe(-30);
    expect(balances.find((b) => b.userId === 'carol')?.netAmount).toBe(-30);
  });

  it('nets multiple expenses across different payers', () => {
    const balances = computeBalances([
      {
        expenseId: 'e1',
        paidByUserId: 'alice',
        amountInAccountCurrency: 60,
        shares: [{ userId: 'alice', shareAmount: 30 }, { userId: 'bob', shareAmount: 30 }],
      },
      {
        expenseId: 'e2',
        paidByUserId: 'bob',
        amountInAccountCurrency: 20,
        shares: [{ userId: 'alice', shareAmount: 10 }, { userId: 'bob', shareAmount: 10 }],
      },
    ]);
    expect(balances.find((b) => b.userId === 'alice')?.netAmount).toBe(20);
    expect(balances.find((b) => b.userId === 'bob')?.netAmount).toBe(-20);
  });
});

describe('simplifyDebts', () => {
  it('produces a single transfer for a simple two-person debt', () => {
    const transfers = simplifyDebts([
      { userId: 'alice', netAmount: 60 },
      { userId: 'bob', netAmount: -60 },
    ]);
    expect(transfers).toEqual([{ fromUserId: 'bob', toUserId: 'alice', amount: 60 }]);
  });

  it('minimizes transfers for a 3-person cycle', () => {
    const transfers = simplifyDebts([
      { userId: 'alice', netAmount: 50 },
      { userId: 'bob', netAmount: 10 },
      { userId: 'carol', netAmount: -60 },
    ]);
    expect(transfers).toHaveLength(2);
    expect(transfers.reduce((sum, t) => sum + t.amount, 0)).toBe(60);
    expect(transfers.every((t) => t.fromUserId === 'carol')).toBe(true);
  });

  it('produces no transfers when everyone is already settled', () => {
    expect(simplifyDebts([{ userId: 'alice', netAmount: 0 }])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/modules/trip-settle-up/settle-up-calculator.spec.ts
```
Expected: FAIL — `Cannot find module './settle-up-calculator'`.

- [ ] **Step 3: Implement**

Create `apps/api/src/modules/trip-settle-up/settle-up-calculator.ts`:
```typescript
export interface ShareInput {
  expenseId: string;
  paidByUserId: string;
  amountInAccountCurrency: number;
  shares: { userId: string; shareAmount: number }[];
}

export interface Balance {
  userId: string;
  netAmount: number; // positive = is owed money, negative = owes money
}

export interface SuggestedTransfer {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeBalances(expenses: ShareInput[]): Balance[] {
  const net = new Map<string, number>();
  for (const exp of expenses) {
    net.set(exp.paidByUserId, round2((net.get(exp.paidByUserId) ?? 0) + exp.amountInAccountCurrency));
    for (const share of exp.shares) {
      net.set(share.userId, round2((net.get(share.userId) ?? 0) - share.shareAmount));
    }
  }
  return Array.from(net.entries()).map(([userId, netAmount]) => ({ userId, netAmount }));
}

export function simplifyDebts(balances: Balance[]): SuggestedTransfer[] {
  const creditors = balances
    .filter((b) => b.netAmount > 0.005)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.netAmount - a.netAmount);
  const debtors = balances
    .filter((b) => b.netAmount < -0.005)
    .map((b) => ({ userId: b.userId, netAmount: -b.netAmount }))
    .sort((a, b) => b.netAmount - a.netAmount);

  const transfers: SuggestedTransfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = round2(Math.min(debtor.netAmount, creditor.netAmount));
    if (amount > 0.005) {
      transfers.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amount });
    }
    debtor.netAmount = round2(debtor.netAmount - amount);
    creditor.netAmount = round2(creditor.netAmount - amount);
    if (debtor.netAmount <= 0.005) i++;
    if (creditor.netAmount <= 0.005) j++;
  }
  return transfers;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest src/modules/trip-settle-up/settle-up-calculator.spec.ts
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/trip-settle-up/settle-up-calculator.ts apps/api/src/modules/trip-settle-up/settle-up-calculator.spec.ts
git commit -m "feat(trip-settle-up): add pure balance and debt-simplification calculators"
```

---

### Task 10: `TripSettleUpModule` scaffold + `GET /accounts/:id/settle-up`

**Files:**
- Create: `apps/api/src/modules/trip-settle-up/trip-settle-up.module.ts`
- Create: `apps/api/src/modules/trip-settle-up/trip-settle-up.service.ts`
- Create: `apps/api/src/modules/trip-settle-up/trip-settle-up.controller.ts`
- Create: `apps/api/src/modules/trip-settle-up/dto/index.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/modules/trip-settle-up/trip-settle-up.service.spec.ts`

**Interfaces:**
- Consumes: `computeBalances`, `simplifyDebts` (Task 9); `ExchangeRateService.getRates()` (existing).
- Produces: `TripSettleUpService.getBalances(accountId): Promise<SettleUpResponse>`. Consumed by Task 12 (pay), Task 13 (confirm), mobile Task 18 (`trip.api.ts`).

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/trip-settle-up/trip-settle-up.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { TripSettleUpService } from './trip-settle-up.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';

describe('TripSettleUpService.getBalances', () => {
  let service: TripSettleUpService;
  let prisma: any;
  let exchangeRateService: any;

  beforeEach(async () => {
    prisma = {
      account: { findUnique: jest.fn().mockResolvedValue({ id: 'acc-1', currencyCode: 'USD' }) },
      expense: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'e1',
            amount: { toNumber: () => 90 },
            currencyCode: 'USD',
            paidByUserId: 'alice',
            userId: 'alice',
            shares: [
              { userId: 'alice', shareAmount: { toNumber: () => 30 } },
              { userId: 'bob', shareAmount: { toNumber: () => 30 } },
              { userId: 'carol', shareAmount: { toNumber: () => 30 } },
            ],
          },
        ]),
      },
      accountMember: {
        findMany: jest.fn().mockResolvedValue([
          { userId: 'alice', user: { name: 'Alice' } },
          { userId: 'bob', user: { name: 'Bob' } },
          { userId: 'carol', user: { name: 'Carol' } },
        ]),
      },
    };
    exchangeRateService = { getRates: jest.fn().mockResolvedValue({ base: 'USD', rates: { USD: 1 } }) };

    const module = await Test.createTestingModule({
      providers: [
        TripSettleUpService,
        { provide: PrismaService, useValue: prisma },
        { provide: ExchangeRateService, useValue: exchangeRateService },
      ],
    }).compile();
    service = module.get(TripSettleUpService);
  });

  it('returns balances and suggested transfers for the account', async () => {
    const result = await service.getBalances('acc-1');
    expect(result.currencyCode).toBe('USD');
    expect(result.balances.find((b) => b.userId === 'alice')?.netAmount).toBe(60);
    expect(result.suggestedTransfers).toHaveLength(2);
    expect(result.fxApproximate).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/modules/trip-settle-up/trip-settle-up.service.spec.ts
```
Expected: FAIL — `Cannot find module './trip-settle-up.service'`.

- [ ] **Step 3: Implement the service**

Create `apps/api/src/modules/trip-settle-up/trip-settle-up.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import { computeBalances, simplifyDebts, ShareInput } from './settle-up-calculator';
import { SettleUpResponse } from '@budget/shared-types';

@Injectable()
export class TripSettleUpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  private async getRatesSafe(base: string): Promise<Record<string, number> | null> {
    try {
      const { rates } = await this.exchangeRateService.getRates(base);
      return rates || null;
    } catch {
      return null;
    }
  }

  private convertAmount(amount: number, from: string, base: string, rates: Record<string, number>): number | null {
    if (from === base) return amount;
    const r = rates[from];
    if (!r || r <= 0) return null;
    return Math.round((amount / r) * 100) / 100;
  }

  async getBalances(accountId: string): Promise<SettleUpResponse> {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    const baseCurrency = account?.currencyCode ?? 'USD';
    const rates = await this.getRatesSafe(baseCurrency);
    let fxApproximate = false;

    const expenses = await this.prisma.expense.findMany({
      where: { accountId, isDeleted: false, paidByUserId: { not: null } },
      include: { shares: true },
    });

    const shareInputs: ShareInput[] = expenses
      .filter((e) => e.shares.length > 0)
      .map((e) => {
        const amount = Number(e.amount);
        const convertedAmount = rates ? this.convertAmount(amount, e.currencyCode, baseCurrency, rates) : amount;
        if (convertedAmount === null) fxApproximate = true;
        return {
          expenseId: e.id,
          paidByUserId: e.paidByUserId as string,
          amountInAccountCurrency: convertedAmount ?? amount,
          shares: e.shares.map((s) => {
            const shareAmount = Number(s.shareAmount);
            const converted = rates ? this.convertAmount(shareAmount, e.currencyCode, baseCurrency, rates) : shareAmount;
            if (converted === null) fxApproximate = true;
            return { userId: s.userId, shareAmount: converted ?? shareAmount };
          }),
        };
      });

    const balances = computeBalances(shareInputs);
    const members = await this.prisma.accountMember.findMany({
      where: { accountId },
      include: { user: { select: { name: true } } },
    });
    const nameByUserId = new Map(members.map((m) => [m.userId, m.user.name]));

    return {
      balances: balances.map((b) => ({
        userId: b.userId,
        userName: nameByUserId.get(b.userId) ?? 'Unknown',
        netAmount: b.netAmount,
      })),
      suggestedTransfers: simplifyDebts(balances),
      currencyCode: baseCurrency,
      fxApproximate,
    };
  }
}
```

Create `apps/api/src/modules/trip-settle-up/trip-settle-up.controller.ts`:
```typescript
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../accounts/guards/account-context.guard';
import { TripSettleUpService } from './trip-settle-up.service';

@Controller('accounts/:id/settle-up')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class TripSettleUpController {
  constructor(private readonly tripSettleUpService: TripSettleUpService) {}

  @Get()
  async getBalances(@Param('id') id: string) {
    return this.tripSettleUpService.getBalances(id);
  }
}
```

Create `apps/api/src/modules/trip-settle-up/dto/index.ts`:
```typescript
export { SettleUpPayDto, AccountMemberPaymentInfoDto } from '@budget/shared-types';
```

Create `apps/api/src/modules/trip-settle-up/trip-settle-up.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TripSettleUpController } from './trip-settle-up.controller';
import { TripSettleUpService } from './trip-settle-up.service';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';
import { AccountsModule } from '../accounts/accounts.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [CurrencyExchangeModule, AccountsModule, NotificationsModule],
  controllers: [TripSettleUpController],
  providers: [TripSettleUpService],
})
export class TripSettleUpModule {}
```

Register it in `apps/api/src/app.module.ts` — add `TripSettleUpModule` to the `imports` array (alongside the existing `PurchaseRequestsModule`/`FamilyFeedModule` entries).

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest src/modules/trip-settle-up/trip-settle-up.service.spec.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/trip-settle-up apps/api/src/app.module.ts
git commit -m "feat(trip-settle-up): add module scaffold and GET /accounts/:id/settle-up"
```

---

### Task 11: `POST /accounts/:id/settle-up/pay` — payment link generation

**Files:**
- Modify: `apps/api/src/modules/trip-settle-up/trip-settle-up.service.ts`
- Modify: `apps/api/src/modules/trip-settle-up/trip-settle-up.controller.ts`
- Test: `apps/api/src/modules/trip-settle-up/trip-settle-up.service.spec.ts`

**Interfaces:**
- Consumes: `SettleUpPayDto` (Task 2), `AccountMember.paymentMethod/paymentHandle` (Task 1/6).
- Produces: `TripSettleUpService.createPayment(accountId, dto): Promise<SettleUpPayResponse>`.

- [ ] **Step 1: Write the failing test**

Add to `trip-settle-up.service.spec.ts`:
```typescript
describe('createPayment', () => {
  it('generates a Revolut deep link when the creditor has one configured', async () => {
    prisma.settleUpTransaction = { create: jest.fn().mockResolvedValue({ id: 'txn-1' }) };
    prisma.accountMember.findFirst = jest.fn().mockResolvedValue({ paymentMethod: 'revolut', paymentHandle: 'jdoe' });

    const result = await service.createPayment('acc-1', { fromUserId: 'bob', toUserId: 'alice', amount: 30 });

    expect(result.paymentLink).toBe('https://revolut.me/jdoe?amount=30&currency=USD');
    expect(result.manualInstructions).toBe(false);
  });

  it('returns manual instructions for BLIK', async () => {
    prisma.settleUpTransaction = { create: jest.fn().mockResolvedValue({ id: 'txn-2' }) };
    prisma.accountMember.findFirst = jest.fn().mockResolvedValue({ paymentMethod: 'blik', paymentHandle: '+48123456789' });

    const result = await service.createPayment('acc-1', { fromUserId: 'bob', toUserId: 'alice', amount: 30 });

    expect(result.paymentLink).toBeNull();
    expect(result.manualInstructions).toBe(true);
    expect(result.paymentHandle).toBe('+48123456789');
  });

  it('returns no link when the creditor has no payment method set', async () => {
    prisma.settleUpTransaction = { create: jest.fn().mockResolvedValue({ id: 'txn-3' }) };
    prisma.accountMember.findFirst = jest.fn().mockResolvedValue({ paymentMethod: null, paymentHandle: null });

    const result = await service.createPayment('acc-1', { fromUserId: 'bob', toUserId: 'alice', amount: 30 });

    expect(result.paymentLink).toBeNull();
    expect(result.manualInstructions).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/modules/trip-settle-up/trip-settle-up.service.spec.ts -t "createPayment"
```
Expected: FAIL — `service.createPayment is not a function`.

- [ ] **Step 3: Implement**

Add to `trip-settle-up.service.ts`:
```typescript
async createPayment(accountId: string, dto: SettleUpPayDto): Promise<SettleUpPayResponse> {
  const account = await this.prisma.account.findUnique({ where: { id: accountId } });
  const currencyCode = account?.currencyCode ?? 'USD';

  const transaction = await this.prisma.settleUpTransaction.create({
    data: {
      accountId,
      fromUserId: dto.fromUserId,
      toUserId: dto.toUserId,
      amount: dto.amount,
      status: 'pending',
    },
  });

  const creditor = await this.prisma.accountMember.findFirst({
    where: { accountId, userId: dto.toUserId },
  });

  let paymentLink: string | null = null;
  let manualInstructions = false;

  if (creditor?.paymentMethod === 'revolut' && creditor.paymentHandle) {
    paymentLink = `https://revolut.me/${creditor.paymentHandle}?amount=${dto.amount}&currency=${currencyCode}`;
  } else if (creditor?.paymentMethod === 'paypal' && creditor.paymentHandle) {
    paymentLink = `https://paypal.me/${creditor.paymentHandle}/${dto.amount}${currencyCode}`;
  } else if (creditor?.paymentMethod === 'blik' && creditor.paymentHandle) {
    manualInstructions = true;
  }

  return {
    transactionId: transaction.id,
    paymentLink,
    manualInstructions,
    paymentHandle: creditor?.paymentHandle ?? null,
  };
}
```
Add `SettleUpPayDto`, `SettleUpPayResponse` to the imports from `@budget/shared-types`.

Add to `trip-settle-up.controller.ts`:
```typescript
@Post('pay')
async createPayment(@Param('id') id: string, @Body() dto: SettleUpPayDto) {
  return this.tripSettleUpService.createPayment(id, dto);
}
```
Add `Post`, `Body` to the `@nestjs/common` import; add `SettleUpPayDto` to imports.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest src/modules/trip-settle-up/trip-settle-up.service.spec.ts -t "createPayment"
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/trip-settle-up/trip-settle-up.service.ts apps/api/src/modules/trip-settle-up/trip-settle-up.controller.ts apps/api/src/modules/trip-settle-up/trip-settle-up.service.spec.ts
git commit -m "feat(trip-settle-up): generate payment links for revolut/paypal, manual instructions for blik"
```

---

### Task 12: `PATCH /accounts/:id/settle-up/:txnId/confirm`

**Files:**
- Modify: `apps/api/src/modules/trip-settle-up/trip-settle-up.service.ts`
- Modify: `apps/api/src/modules/trip-settle-up/trip-settle-up.controller.ts`
- Test: `apps/api/src/modules/trip-settle-up/trip-settle-up.service.spec.ts`

**Interfaces:**
- Produces: `TripSettleUpService.confirmPayment(accountId, transactionId, callerUserId)` — only the `toUserId` (receiver) may confirm.

- [ ] **Step 1: Write the failing test**

```typescript
describe('confirmPayment', () => {
  it('confirms when called by the receiver', async () => {
    prisma.settleUpTransaction.findFirst = jest.fn().mockResolvedValue({ id: 'txn-1', accountId: 'acc-1', toUserId: 'alice', status: 'pending' });
    prisma.settleUpTransaction.update = jest.fn().mockResolvedValue({ id: 'txn-1', status: 'confirmed' });

    const result = await service.confirmPayment('acc-1', 'txn-1', 'alice');
    expect(result.status).toBe('confirmed');
  });

  it('throws ForbiddenException when called by someone other than the receiver', async () => {
    prisma.settleUpTransaction.findFirst = jest.fn().mockResolvedValue({ id: 'txn-1', accountId: 'acc-1', toUserId: 'alice', status: 'pending' });

    await expect(service.confirmPayment('acc-1', 'txn-1', 'bob')).rejects.toThrow('Only the receiver can confirm this payment');
  });

  it('throws NotFoundException when the transaction does not belong to the account', async () => {
    prisma.settleUpTransaction.findFirst = jest.fn().mockResolvedValue(null);
    await expect(service.confirmPayment('acc-1', 'txn-missing', 'alice')).rejects.toThrow('Settle-up transaction not found');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/modules/trip-settle-up/trip-settle-up.service.spec.ts -t "confirmPayment"
```
Expected: FAIL — `service.confirmPayment is not a function`.

- [ ] **Step 3: Implement**

Add to `trip-settle-up.service.ts` (add `ForbiddenException`, `NotFoundException` to the `@nestjs/common` import):
```typescript
async confirmPayment(accountId: string, transactionId: string, callerUserId: string) {
  const transaction = await this.prisma.settleUpTransaction.findFirst({
    where: { id: transactionId, accountId },
  });
  if (!transaction) {
    throw new NotFoundException('Settle-up transaction not found');
  }
  if (transaction.toUserId !== callerUserId) {
    throw new ForbiddenException('Only the receiver can confirm this payment');
  }
  return this.prisma.settleUpTransaction.update({
    where: { id: transactionId },
    data: { status: 'confirmed', confirmedAt: new Date() },
  });
}
```

Add to `trip-settle-up.controller.ts`:
```typescript
@Patch(':txnId/confirm')
async confirmPayment(
  @Req() req: AuthenticatedRequest,
  @Param('id') id: string,
  @Param('txnId') txnId: string,
) {
  return this.tripSettleUpService.confirmPayment(id, txnId, req.user.id);
}
```
Add `Patch`, `Req` to imports; import `AuthenticatedRequest` from `../../common/types`.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest src/modules/trip-settle-up/trip-settle-up.service.spec.ts -t "confirmPayment"
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/trip-settle-up/trip-settle-up.service.ts apps/api/src/modules/trip-settle-up/trip-settle-up.controller.ts apps/api/src/modules/trip-settle-up/trip-settle-up.service.spec.ts
git commit -m "feat(trip-settle-up): add receiver-only payment confirmation"
```

---

### Task 13: `TripSettleUpReminderCron`

**Files:**
- Create: `apps/api/src/modules/trip-settle-up/trip-settle-up-reminder.cron.ts`
- Test: `apps/api/src/modules/trip-settle-up/trip-settle-up-reminder.cron.spec.ts`
- Modify: `apps/api/src/modules/trip-settle-up/trip-settle-up.module.ts`

**Interfaces:**
- Consumes: `PrismaService`, `NotificationsService` (existing), same shape as `DebtReminderCron`.
- Produces: daily transition `active` → `settling` + push notification.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/trip-settle-up/trip-settle-up-reminder.cron.spec.ts`:
```typescript
import { TripSettleUpReminderCron } from './trip-settle-up-reminder.cron';

describe('TripSettleUpReminderCron', () => {
  it('transitions ended trips to settling and notifies members with the preference enabled', async () => {
    const prisma: any = {
      account: {
        findMany: jest.fn().mockResolvedValue([{ id: 'acc-1', name: 'Bali trip' }]),
        update: jest.fn().mockResolvedValue({}),
      },
      accountMember: {
        findMany: jest.fn().mockResolvedValue([
          { userId: 'alice', user: { notifyTripSettleUp: true } },
          { userId: 'bob', user: { notifyTripSettleUp: false } },
        ]),
      },
    };
    const notificationsService: any = { sendToUser: jest.fn().mockResolvedValue(undefined) };

    const cron = new TripSettleUpReminderCron(prisma, notificationsService);
    await cron.handleTripEndings();

    expect(prisma.account.update).toHaveBeenCalledWith({ where: { id: 'acc-1' }, data: { tripStatus: 'settling' } });
    expect(notificationsService.sendToUser).toHaveBeenCalledTimes(1);
    expect(notificationsService.sendToUser.mock.calls[0][0]).toBe('alice');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/modules/trip-settle-up/trip-settle-up-reminder.cron.spec.ts
```
Expected: FAIL — `Cannot find module './trip-settle-up-reminder.cron'`.

- [ ] **Step 3: Implement**

Create `apps/api/src/modules/trip-settle-up/trip-settle-up-reminder.cron.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class TripSettleUpReminderCron {
  private readonly logger = new Logger(TripSettleUpReminderCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron('0 9 * * *')
  async handleTripEndings() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const endedTrips = await this.prisma.account.findMany({
      where: { type: 'trip', tripStatus: 'active', tripEndDate: { lt: today } },
      select: { id: true, name: true },
    });

    for (const trip of endedTrips) {
      await this.prisma.account.update({ where: { id: trip.id }, data: { tripStatus: 'settling' } });

      const members = await this.prisma.accountMember.findMany({
        where: { accountId: trip.id },
        include: { user: { select: { notifyTripSettleUp: true } } },
      });

      for (const member of members) {
        if (!member.user.notifyTripSettleUp) continue;
        await this.notificationsService
          .sendToUser(
            member.userId,
            () => `${trip.name} has ended`,
            () => 'Time to settle up with your trip group',
            { accountId: trip.id },
            'trip_settle_up',
          )
          .catch(() => {});
      }
    }
  }
}
```

Register it as a provider in `trip-settle-up.module.ts`:
```typescript
providers: [TripSettleUpService, TripSettleUpReminderCron],
```
(Import it and add `ScheduleModule` is already registered globally per existing cron modules — no new global setup needed.)

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest src/modules/trip-settle-up/trip-settle-up-reminder.cron.spec.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/trip-settle-up/trip-settle-up-reminder.cron.ts apps/api/src/modules/trip-settle-up/trip-settle-up-reminder.cron.spec.ts apps/api/src/modules/trip-settle-up/trip-settle-up.module.ts
git commit -m "feat(trip-settle-up): add daily cron to transition ended trips to settling"
```

---

### Task 14: `trip_settle_up` notification type + user preference

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `packages/shared-types/src/entities/index.ts`
- Modify: `apps/api/src/modules/users/users.service.ts`
- Test: `apps/api/src/modules/users/users.service.spec.ts`

**Interfaces:**
- Produces: `User.notifyTripSettleUp Boolean @default(true)`; `NotificationPreferencesResponse.tripSettleUp: boolean` (mirrors the existing `trackingGap`/`debtReminders` fields exactly).

- [ ] **Step 1: Add the column**

In `schema.prisma`, in `model User { ... }`, add near the other `notify*` booleans:
```prisma
  notifyTripSettleUp Boolean @default(true)
```

Run (from `apps/api/`):
```bash
npx prisma migrate dev --name add_trip_settle_up_notification_pref
npx prisma generate
```
Expected: migration created, client regenerated.

- [ ] **Step 2: Extend the entity type**

In `packages/shared-types/src/entities/index.ts`, add `'trip_settle_up'` to the `NotificationType` union, and add `tripSettleUp: boolean` to `NotificationPreferencesResponse`.

- [ ] **Step 3: Write the failing test**

Add to `apps/api/src/modules/users/users.service.spec.ts`, following the exact pattern of the existing `trackingGap` preference test in that file (locate it and copy its structure):
```typescript
describe('notification preferences — trip settle-up', () => {
  it('includes tripSettleUp in getNotificationPreferences', async () => {
    prisma.user.findUnique = jest.fn().mockResolvedValue({ notifyTripSettleUp: true /* ...other existing fields the test already mocks... */ });
    const prefs = await service.getNotificationPreferences('user-1');
    expect(prefs.tripSettleUp).toBe(true);
  });

  it('updates notifyTripSettleUp via updateNotificationPreferences', async () => {
    prisma.user.update = jest.fn().mockResolvedValue({ notifyTripSettleUp: false });
    await service.updateNotificationPreferences('user-1', { tripSettleUp: false });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ notifyTripSettleUp: false }) }),
    );
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npx jest src/modules/users/users.service.spec.ts -t "trip settle-up"
```
Expected: FAIL — `prefs.tripSettleUp` is `undefined`.

- [ ] **Step 5: Implement**

In `users.service.ts`, find `getNotificationPreferences()` and add `tripSettleUp: user.notifyTripSettleUp` to its returned object (same line style as the existing `trackingGap: user.notifyTrackingGap`). Find `updateNotificationPreferences()` and add the matching `notifyTripSettleUp: dto.tripSettleUp` mapping in its `data: {...}` object, guarded the same way the existing optional preference fields are (only included when present in `dto`).

- [ ] **Step 6: Run test to verify it passes**

```bash
npx jest src/modules/users/users.service.spec.ts -t "trip settle-up"
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations packages/shared-types/src/entities/index.ts apps/api/src/modules/users/users.service.ts apps/api/src/modules/users/users.service.spec.ts
git commit -m "feat(notifications): add trip_settle_up type and notifyTripSettleUp preference"
```

---

## Phase 5 — API: Sync

### Task 15: `sync.service.ts` — `tripExpenseShare` entity handler

**Files:**
- Modify: `apps/api/src/modules/sync/sync.service.ts`
- Test: `apps/api/src/modules/sync/sync.service.spec.ts`

**Interfaces:**
- Consumes: `SyncChange` extended with `'tripExpenseShare'` (Task 3).
- Produces: `processTripExpenseShareChange()`, wired into the `processChange()` switch. Consumed by mobile Task 17 (repository push).

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/modules/sync/sync.service.spec.ts`, mirroring the existing `processTagChange` test structure:
```typescript
describe('processChange — tripExpenseShare', () => {
  it('creates a TripExpenseShare row', async () => {
    prisma.tripExpenseShare.upsert = jest.fn().mockResolvedValue({ id: 'share-1' });
    const result = await service.processChange('acc-1', 'user-1', {
      entityType: 'tripExpenseShare',
      entityId: 'share-client-1',
      operation: 'create',
      clientVersion: 1,
      accountId: 'acc-1',
      payload: { expenseId: 'exp-1', userId: 'bob', shareType: 'equal', shareAmount: 30 },
    });
    expect(result.status).toBe('success');
    expect(prisma.tripExpenseShare.upsert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/modules/sync/sync.service.spec.ts -t "tripExpenseShare"
```
Expected: FAIL — `Unknown entity type: tripExpenseShare`.

- [ ] **Step 3: Implement**

In `sync.service.ts`, add a case to the `processChange()` switch:
```typescript
case 'tripExpenseShare':
  return this.processTripExpenseShareChange(accountId, change);
```

Add the handler method, following the exact three-branch style of `processTagChange`:
```typescript
private async processTripExpenseShareChange(
  accountId: string,
  change: Extract<SyncChange, { entityType: 'tripExpenseShare' }>,
): Promise<SyncResult> {
  try {
    if (change.operation === 'delete') {
      await this.prisma.tripExpenseShare.deleteMany({
        where: { expenseId: change.payload.expenseId, userId: change.payload.userId },
      });
      return { entityId: change.entityId, status: 'success' };
    }

    const row = await this.prisma.tripExpenseShare.upsert({
      where: { expenseId_userId: { expenseId: change.payload.expenseId, userId: change.payload.userId } },
      create: {
        expenseId: change.payload.expenseId,
        userId: change.payload.userId,
        shareType: change.payload.shareType,
        shareAmount: change.payload.shareAmount,
      },
      update: {
        shareType: change.payload.shareType,
        shareAmount: change.payload.shareAmount,
      },
    });
    return { entityId: change.entityId, status: 'success', serverId: row.id };
  } catch (error) {
    return { entityId: change.entityId, status: 'error', error: (error as Error).message };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest src/modules/sync/sync.service.spec.ts -t "tripExpenseShare"
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/sync/sync.service.ts apps/api/src/modules/sync/sync.service.spec.ts
git commit -m "feat(sync): handle tripExpenseShare entity in sync push"
```

---

## Phase 6 — Mobile: SQLite schema and repository

### Task 16: SQLite schema + migration

**Files:**
- Modify: `apps/mobile/src/db/schema/index.ts`
- Modify: `apps/mobile/src/db/client.native.ts`

**Interfaces:**
- Produces: `expenses.paid_by_user_id` column; new `trip_expense_shares` table. Consumed by Task 17 (repository).

- [ ] **Step 1: Add the column and table to the schema**

In `apps/mobile/src/db/schema/index.ts`, find the `expenses` table definition and add:
```typescript
paid_by_user_id: text('paid_by_user_id'),
```

Add a new table definition, mirroring the existing `expense_category_splits` table exactly in shape:
```typescript
export const tripExpenseShares = sqliteTable('trip_expense_shares', {
  id: text('id').primaryKey(),
  expense_id: text('expense_id').notNull(),
  user_id: text('user_id').notNull(),
  share_type: text('share_type').notNull(),
  share_amount: real('share_amount').notNull(),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
  is_deleted: integer('is_deleted').notNull().default(0),
  sync_version: integer('sync_version').notNull().default(0),
});
```

- [ ] **Step 2: Add the migration in `client.native.ts`**

In `apps/mobile/src/db/client.native.ts`, find the section that runs `ALTER TABLE`/`CREATE TABLE IF NOT EXISTS` migrations on startup (the pattern used for `Income.source`/`Expense.merchant`) and add:
```typescript
await db.execAsync(`
  ALTER TABLE expenses ADD COLUMN paid_by_user_id TEXT;
`).catch(() => { /* column already exists on upgraded devices */ });

await db.execAsync(`
  CREATE TABLE IF NOT EXISTS trip_expense_shares (
    id TEXT PRIMARY KEY,
    expense_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    share_type TEXT NOT NULL,
    share_amount REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    sync_version INTEGER NOT NULL DEFAULT 0
  );
`);
```
Place this alongside the existing migration statements, in the same try/catch-per-statement style already used there (an `ALTER TABLE ADD COLUMN` on an existing column throws — the `.catch()` swallow is the established idiom, not a new pattern).

- [ ] **Step 3: Manually verify on the running app**

Run (from `apps/mobile/`):
```bash
npx expo start --web
```
Open the app in the browser, sign in, and confirm no errors appear in the console related to `trip_expense_shares` or `paid_by_user_id` during startup (web uses the in-memory DB mock, so this mainly verifies the schema file itself has no TypeScript errors — full native verification happens once Task 25's screens exist).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/db/schema/index.ts apps/mobile/src/db/client.native.ts
git commit -m "feat(mobile-db): add paid_by_user_id column and trip_expense_shares table"
```

---

### Task 17: `tripExpenseShareRepository.ts`

**Files:**
- Create: `apps/mobile/src/db/tripExpenseShareRepository.ts`

**Interfaces:**
- Consumes: `executeSql` from `./client` (existing), `TripExpenseShare` entity (Task 2).
- Produces: `insertShare`, `getSharesForExpense`, `deleteAllSharesForExpense`, `bulkInsertShares` — used by Task 22 (`expenseStore.ts`).

- [ ] **Step 1: Implement, mirroring `splitRepository.ts` exactly**

Create `apps/mobile/src/db/tripExpenseShareRepository.ts`:
```typescript
import { executeSql } from './client';
import { TripExpenseShare } from '@budget/shared-types';

interface TripExpenseShareRow {
  id: string;
  expense_id: string;
  user_id: string;
  share_type: string;
  share_amount: number;
  created_at: string;
  updated_at: string;
  is_deleted: number;
  sync_version: number;
}

function rowToShare(row: TripExpenseShareRow): TripExpenseShare {
  return {
    id: row.id,
    expenseId: row.expense_id,
    userId: row.user_id,
    shareType: row.share_type as TripExpenseShare['shareType'],
    shareAmount: row.share_amount,
    createdAt: row.created_at,
  };
}

function shareToParams(share: TripExpenseShare, now: string): unknown[] {
  return [share.id, share.expenseId, share.userId, share.shareType, share.shareAmount, share.createdAt, now, 0, 0];
}

export async function insertShare(share: TripExpenseShare): Promise<void> {
  const now = new Date().toISOString();
  await executeSql(
    `INSERT INTO trip_expense_shares
      (id, expense_id, user_id, share_type, share_amount, created_at, updated_at, is_deleted, sync_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    shareToParams(share, now),
  );
}

export async function bulkInsertShares(shares: TripExpenseShare[]): Promise<void> {
  for (const share of shares) {
    await insertShare(share);
  }
}

export async function getSharesForExpense(expenseId: string): Promise<TripExpenseShare[]> {
  const rows = await executeSql<TripExpenseShareRow>(
    `SELECT * FROM trip_expense_shares WHERE expense_id = ? AND is_deleted = 0`,
    [expenseId],
  );
  return rows.map(rowToShare);
}

export async function deleteAllSharesForExpense(expenseId: string): Promise<void> {
  await executeSql(`DELETE FROM trip_expense_shares WHERE expense_id = ?`, [expenseId]);
}
```

- [ ] **Step 2: Typecheck**

Run (from `apps/mobile/`):
```bash
npx tsc --noEmit
```
Expected: no errors from this new file (verify `executeSql`'s exact generic signature in `./client.ts` matches this usage — adjust the call site if its signature differs, e.g. if it takes a mapper callback instead of a type parameter).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/db/tripExpenseShareRepository.ts
git commit -m "feat(mobile-db): add tripExpenseShareRepository"
```

---

## Phase 7 — Mobile: API clients

### Task 18: `trip.api.ts`

**Files:**
- Create: `apps/mobile/src/services/trip.api.ts`

**Interfaces:**
- Consumes: `httpClient` (existing), `SettleUpResponse`, `SettleUpPayDto`, `SettleUpPayResponse` (Task 2).
- Produces: `tripApi` object, consumed by Task 21 (`tripStore.ts`).

- [ ] **Step 1: Implement, following `userSubscriptions.api.ts`'s convention**

Create `apps/mobile/src/services/trip.api.ts`:
```typescript
import { httpClient } from './http-client';
import { SettleUpResponse, SettleUpPayDto, SettleUpPayResponse } from '@budget/shared-types';

export const tripApi = {
  getSettleUp(accountId: string) {
    return httpClient.request<SettleUpResponse>(`/accounts/${accountId}/settle-up`);
  },
  payDebt(accountId: string, dto: SettleUpPayDto) {
    return httpClient.request<SettleUpPayResponse>(`/accounts/${accountId}/settle-up/pay`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },
  confirmPayment(accountId: string, transactionId: string) {
    return httpClient.request<void>(`/accounts/${accountId}/settle-up/${transactionId}/confirm`, {
      method: 'PATCH',
    });
  },
  archiveTrip(accountId: string, force?: boolean) {
    return httpClient.request<void>(`/accounts/${accountId}/archive-trip`, {
      method: 'PATCH',
      body: JSON.stringify({ force }),
    });
  },
  updatePaymentInfo(accountId: string, paymentMethod: string, paymentHandle: string) {
    return httpClient.request<void>(`/accounts/${accountId}/members/me/payment-info`, {
      method: 'PATCH',
      body: JSON.stringify({ paymentMethod, paymentHandle }),
    });
  },
};
```

- [ ] **Step 2: Register the export in the API barrel**

In `apps/mobile/src/services/api.ts`, add:
```typescript
export { tripApi } from './trip.api';
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/services/trip.api.ts apps/mobile/src/services/api.ts
git commit -m "feat(mobile-api): add trip.api.ts client"
```

---

### Task 19: Extend `accounts.api.ts` for trip creation

**Files:**
- Modify: `apps/mobile/src/services/accounts.api.ts`

**Interfaces:**
- Produces: `accountsApi.createAccount()` accepts `tripStartDate?`/`tripEndDate?` when `type: 'trip'` (extends the existing method's parameter type — no new method needed since `CreateAccountDto` already carries the new optional fields from Task 2).

- [ ] **Step 1: Verify the existing `createAccount` method's parameter type**

Open `apps/mobile/src/services/accounts.api.ts` and confirm `createAccount(dto: CreateAccountDto)` already imports `CreateAccountDto` from `@budget/shared-types` (it does, per the existing convention) — since Task 2 already extended that interface, **no code change is required in this file**. Skip to Step 2.

- [ ] **Step 2: Typecheck to confirm**

```bash
npx tsc --noEmit
```
Expected: no errors — this confirms the shared-type extension flows through without a manual edit here.

- [ ] **Step 3: No commit needed for this task** (no file changes) — proceed to Task 20.

---

### Task 20: Extend `expenses.api.ts` payload types

**Files:**
- Modify: `apps/mobile/src/services/expenses.api.ts`

**Interfaces:**
- Same rationale as Task 19: `createExpense`/`updateExpense` already type their body as `CreateExpenseDto`/`UpdateExpenseDto` (extended in Task 2).

- [ ] **Step 1: Verify and typecheck**

Open `apps/mobile/src/services/expenses.api.ts` and confirm `createExpense`/`updateExpense` type their `dto` parameter from `@budget/shared-types`. Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 2: No commit needed** — proceed to Task 21.

---

## Phase 8 — Mobile: Stores

### Task 21: `tripStore.ts`

**Files:**
- Create: `apps/mobile/src/stores/tripStore.ts`
- Test: `apps/mobile/src/stores/__tests__/tripStore.test.ts`

**Interfaces:**
- Consumes: `tripApi` (Task 18).
- Produces: `useTripStore` — `balances`, `suggestedTransfers`, `isLoading`, `loadSettleUp`, `payDebt`, `confirmPayment`. Consumed by Task 26 (`settle-up.tsx`).

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/stores/__tests__/tripStore.test.ts`:
```typescript
import { useTripStore } from '../tripStore';
import { tripApi } from '../../services/trip.api';

jest.mock('../../services/trip.api', () => ({
  tripApi: {
    getSettleUp: jest.fn(),
    payDebt: jest.fn(),
    confirmPayment: jest.fn(),
  },
}));

describe('tripStore', () => {
  beforeEach(() => {
    useTripStore.setState({ balances: [], suggestedTransfers: [], isLoading: false });
    jest.clearAllMocks();
  });

  it('loadSettleUp populates balances and suggestedTransfers', async () => {
    (tripApi.getSettleUp as jest.Mock).mockResolvedValue({
      balances: [{ userId: 'alice', userName: 'Alice', netAmount: 60 }],
      suggestedTransfers: [{ fromUserId: 'bob', toUserId: 'alice', amount: 60 }],
      currencyCode: 'USD',
      fxApproximate: false,
    });

    await useTripStore.getState().loadSettleUp('acc-1');

    expect(useTripStore.getState().balances).toHaveLength(1);
    expect(useTripStore.getState().suggestedTransfers).toHaveLength(1);
    expect(useTripStore.getState().isLoading).toBe(false);
  });

  it('payDebt returns the payment response from the API', async () => {
    (tripApi.payDebt as jest.Mock).mockResolvedValue({
      transactionId: 'txn-1',
      paymentLink: 'https://revolut.me/jdoe?amount=60&currency=USD',
      manualInstructions: false,
      paymentHandle: 'jdoe',
    });

    const result = await useTripStore.getState().payDebt('acc-1', 'bob', 'alice', 60);
    expect(result.paymentLink).toContain('revolut.me');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/mobile/`):
```bash
npx jest src/stores/__tests__/tripStore.test.ts
```
Expected: FAIL — `Cannot find module '../tripStore'`.

- [ ] **Step 3: Implement**

Create `apps/mobile/src/stores/tripStore.ts`:
```typescript
import { create } from 'zustand';
import { tripApi } from '../services/trip.api';
import { SettleUpBalance, SuggestedTransfer, SettleUpPayResponse } from '@budget/shared-types';

interface TripStore {
  balances: SettleUpBalance[];
  suggestedTransfers: SuggestedTransfer[];
  isLoading: boolean;

  loadSettleUp: (accountId: string) => Promise<void>;
  payDebt: (accountId: string, fromUserId: string, toUserId: string, amount: number) => Promise<SettleUpPayResponse>;
  confirmPayment: (accountId: string, transactionId: string) => Promise<void>;
}

export const useTripStore = create<TripStore>((set, get) => ({
  balances: [],
  suggestedTransfers: [],
  isLoading: false,

  loadSettleUp: async (accountId: string) => {
    set({ isLoading: true });
    try {
      const response = await tripApi.getSettleUp(accountId);
      set({ balances: response.balances, suggestedTransfers: response.suggestedTransfers, isLoading: false });
    } catch (error) {
      console.warn('Failed to load settle-up balances', error);
      set({ isLoading: false });
    }
  },

  payDebt: async (accountId: string, fromUserId: string, toUserId: string, amount: number) => {
    return tripApi.payDebt(accountId, { fromUserId, toUserId, amount });
  },

  confirmPayment: async (accountId: string, transactionId: string) => {
    const previousTransfers = get().suggestedTransfers;
    await tripApi.confirmPayment(accountId, transactionId);
    await get().loadSettleUp(accountId);
    void previousTransfers; // rollback not needed — loadSettleUp refetches authoritative state
  },
}));
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest src/stores/__tests__/tripStore.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/stores/tripStore.ts apps/mobile/src/stores/__tests__/tripStore.test.ts
git commit -m "feat(mobile-store): add tripStore for settle-up balances"
```

---

### Task 22: `expenseStore.ts` — accept `shares`/`paidByUserId`

**Files:**
- Modify: `apps/mobile/src/stores/expenseStore.ts`
- Test: `apps/mobile/src/stores/__tests__/expenseStore.test.ts` (extend existing file — if it doesn't exist yet, create it following the `tripStore.test.ts` mocking convention from Task 21)

**Interfaces:**
- Consumes: `tripExpenseShareRepository` (Task 17).
- Produces: `expenseStore.addExpense`/`updateExpense` accept an optional `shares`/`splitType`/`paidByUserId` and persist shares locally via `bulkInsertShares`/`deleteAllSharesForExpense`, then include them in the server push payload.

- [ ] **Step 1: Write the failing test**

Add to `apps/mobile/src/stores/__tests__/expenseStore.test.ts`:
```typescript
import * as tripExpenseShareRepository from '../../db/tripExpenseShareRepository';

jest.mock('../../db/tripExpenseShareRepository');

describe('expenseStore — trip shares', () => {
  it('persists shares locally when addExpense is called with a splitType and shares', async () => {
    const bulkInsertSpy = jest.spyOn(tripExpenseShareRepository, 'bulkInsertShares').mockResolvedValue(undefined);

    await useExpenseStore.getState().addExpense({
      amount: 90,
      currencyCode: 'USD',
      date: '2026-08-01',
      source: 'manual',
      splitType: 'equal',
      shares: [{ userId: 'alice', value: 0 }, { userId: 'bob', value: 0 }],
    } as any);

    expect(bulkInsertSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/stores/__tests__/expenseStore.test.ts -t "trip shares"
```
Expected: FAIL — `bulkInsertSpy` not called (current `addExpense` doesn't know about `shares`).

- [ ] **Step 3: Implement**

In `expenseStore.ts`, find `addExpense` (and `updateExpense`). After the expense row itself is written to local SQLite and before/alongside the existing fire-and-forget `api.createExpense(...)` call, add:
```typescript
if (input.shares && input.shares.length > 0) {
  await tripExpenseShareRepository.deleteAllSharesForExpense(expense.id);
  await tripExpenseShareRepository.bulkInsertShares(
    input.shares.map((s) => ({
      id: `${expense.id}:${s.userId}`,
      expenseId: expense.id,
      userId: s.userId,
      shareType: input.splitType ?? 'equal',
      shareAmount: s.value, // exact resolution happens server-side; local copy is a best-effort mirror for offline display
      createdAt: new Date().toISOString(),
    })),
  );
}
```
Add `import * as tripExpenseShareRepository from '../db/tripExpenseShareRepository';` at the top of the file. Ensure `input.shares`/`input.splitType`/`input.paidByUserId` are passed through unchanged into the existing `api.createExpense(input)`/`api.updateExpense(id, input)` calls (they already are, since those calls forward the whole `input` object per the existing pattern — verify by reading the surrounding code and confirm no destructuring drops these new fields).

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest src/stores/__tests__/expenseStore.test.ts -t "trip shares"
```
Expected: PASS.

- [ ] **Step 5: Run the full expense store suite for regressions**

```bash
npx jest src/stores/__tests__/expenseStore.test.ts
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/stores/expenseStore.ts apps/mobile/src/stores/__tests__/expenseStore.test.ts
git commit -m "feat(mobile-store): persist trip expense shares in expenseStore"
```

---

### Task 23: `accountStore.ts` — trip helpers

**Files:**
- Modify: `apps/mobile/src/stores/accountStore.ts`
- Test: `apps/mobile/src/stores/__tests__/accountStore.test.ts` (extend existing)

**Interfaces:**
- Produces: `accountStore.createTripAccount(name, tripEndDate, currencyCode, tripStartDate?)`, `accountStore.archiveTrip(accountId, force?)`, `accountStore.updatePaymentInfo(accountId, method, handle)`, pure helper `getTripDaysLeft(account): number | null`.

- [ ] **Step 1: Write the failing test**

```typescript
import { getTripDaysLeft } from '../accountStore';

describe('getTripDaysLeft', () => {
  it('returns null for non-trip accounts', () => {
    expect(getTripDaysLeft({ type: 'shared' } as any)).toBeNull();
  });

  it('computes days remaining for an active trip', () => {
    const tripEndDate = new Date();
    tripEndDate.setDate(tripEndDate.getDate() + 5);
    expect(
      getTripDaysLeft({ type: 'trip', tripStatus: 'active', tripEndDate: tripEndDate.toISOString() } as any),
    ).toBe(5);
  });

  it('returns 0 when the trip ends today', () => {
    expect(
      getTripDaysLeft({ type: 'trip', tripStatus: 'active', tripEndDate: new Date().toISOString() } as any),
    ).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/stores/__tests__/accountStore.test.ts -t "getTripDaysLeft"
```
Expected: FAIL — `getTripDaysLeft` is not exported.

- [ ] **Step 3: Implement**

In `accountStore.ts`, add the pure export (outside the Zustand `create()` call, alongside any other exported pure helpers in the file):
```typescript
export function getTripDaysLeft(account: { type: string; tripStatus?: string; tripEndDate?: string }): number | null {
  if (account.type !== 'trip' || account.tripStatus !== 'active' || !account.tripEndDate) return null;
  const end = new Date(account.tripEndDate);
  end.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = end.getTime() - today.getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}
```

Inside the store's `create<AccountStore>((set, get) => ({ ... }))`, add three actions:
```typescript
createTripAccount: async (name: string, tripEndDate: string, currencyCode: string, tripStartDate?: string) => {
  const account = await api.createAccount({ name, type: 'trip', currencyCode, tripEndDate, tripStartDate });
  set((state) => ({ accounts: [...state.accounts, account] }));
  return account;
},

archiveTrip: async (accountId: string, force?: boolean) => {
  await tripApi.archiveTrip(accountId, force);
  set((state) => ({
    accounts: state.accounts.map((a) => (a.id === accountId ? { ...a, tripStatus: 'archived' } : a)),
  }));
},

updatePaymentInfo: async (accountId: string, paymentMethod: string, paymentHandle: string) => {
  await tripApi.updatePaymentInfo(accountId, paymentMethod, paymentHandle);
},
```
Add `import { tripApi } from '../services/trip.api';` at the top. Add the three new method signatures to the `AccountStore` interface in this file.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest src/stores/__tests__/accountStore.test.ts -t "getTripDaysLeft"
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/stores/accountStore.ts apps/mobile/src/stores/__tests__/accountStore.test.ts
git commit -m "feat(mobile-store): add trip creation, archive, and payment-info actions to accountStore"
```

---

## Phase 9 — Mobile: Screens

### Task 24: `TripExpenseSplitPicker` component

**Files:**
- Create: `apps/mobile/src/components/expenses/TripExpenseSplitPicker.tsx`

**Interfaces:**
- Consumes: `ShareType` (Task 2), current trip members (passed as a prop from the parent screen).
- Produces: `<TripExpenseSplitPicker members={...} totalAmount={...} onChange={(splitType, shares) => void} />`. Consumed by Task 28 (`expense/new.tsx`/`[id].tsx`).

- [ ] **Step 1: Implement**

Create `apps/mobile/src/components/expenses/TripExpenseSplitPicker.tsx`:
```tsx
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ShareType } from '@budget/shared-types';
import { useTheme } from '../../hooks/useTheme';

interface Member {
  userId: string;
  name: string;
}

interface Props {
  members: Member[];
  totalAmount: number;
  onChange: (splitType: ShareType, shares: { userId: string; value: number }[]) => void;
}

const SPLIT_TYPES: ShareType[] = ['equal', 'exact', 'percentage', 'shares'];

export function TripExpenseSplitPicker({ members, totalAmount, onChange }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [splitType, setSplitType] = useState<ShareType>('equal');
  const [selectedIds, setSelectedIds] = useState<string[]>(members.map((m) => m.userId));
  const [values, setValues] = useState<Record<string, string>>({});

  const shares = useMemo(
    () => selectedIds.map((userId) => ({ userId, value: Number(values[userId] ?? 0) })),
    [selectedIds, values],
  );

  function commit(nextSplitType: ShareType, nextSelectedIds: string[], nextValues: Record<string, string>) {
    onChange(
      nextSplitType,
      nextSelectedIds.map((userId) => ({ userId, value: Number(nextValues[userId] ?? 0) })),
    );
  }

  function toggleMember(userId: string) {
    const next = selectedIds.includes(userId) ? selectedIds.filter((id) => id !== userId) : [...selectedIds, userId];
    setSelectedIds(next);
    commit(splitType, next, values);
  }

  function setSplitTypeAndCommit(next: ShareType) {
    setSplitType(next);
    commit(next, selectedIds, values);
  }

  function setValueAndCommit(userId: string, raw: string) {
    const nextValues = { ...values, [userId]: raw };
    setValues(nextValues);
    commit(splitType, selectedIds, nextValues);
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.textPrimary }]}>{t('trip.splitBetween')}</Text>
      <View style={styles.memberRow}>
        {members.map((member) => (
          <TouchableOpacity
            key={member.userId}
            onPress={() => toggleMember(member.userId)}
            style={[
              styles.memberChip,
              { borderColor: theme.primary, backgroundColor: selectedIds.includes(member.userId) ? theme.primary : 'transparent' },
            ]}
          >
            <Text style={{ color: selectedIds.includes(member.userId) ? theme.onPrimary : theme.textPrimary }}>
              {member.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.splitTypeRow}>
        {SPLIT_TYPES.map((type) => (
          <TouchableOpacity
            key={type}
            onPress={() => setSplitTypeAndCommit(type)}
            style={[styles.splitTypeChip, splitType === type && { backgroundColor: theme.primary }]}
          >
            <Text style={{ color: splitType === type ? theme.onPrimary : theme.textSecondary }}>
              {t(`trip.split${type.charAt(0).toUpperCase() + type.slice(1)}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {splitType !== 'equal' &&
        selectedIds.map((userId) => (
          <View key={userId} style={styles.valueRow}>
            <Text style={{ color: theme.textPrimary }}>{members.find((m) => m.userId === userId)?.name}</Text>
            <TextInput
              keyboardType="numeric"
              value={values[userId] ?? ''}
              onChangeText={(text) => setValueAndCommit(userId, text)}
              style={[styles.valueInput, { borderColor: theme.border, color: theme.textPrimary }]}
            />
          </View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  memberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  memberChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  splitTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  splitTypeChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  valueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  valueInput: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, width: 80, textAlign: 'right' },
});
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors (adjust the `useTheme()` import path if the actual hook lives elsewhere — check `src/hooks/useTheme.ts` or the equivalent theme context used by `SplitEditor.tsx` and match it exactly).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/expenses/TripExpenseSplitPicker.tsx
git commit -m "feat(mobile): add TripExpenseSplitPicker component"
```

---

### Task 25: `app/trip/new.tsx` — create trip screen

**Files:**
- Create: `apps/mobile/app/trip/new.tsx`
- Modify: `apps/mobile/app/_layout.tsx`

**Interfaces:**
- Consumes: `accountStore.createTripAccount` (Task 23).

- [ ] **Step 1: Implement**

Create `apps/mobile/app/trip/new.tsx`:
```tsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAccountStore } from '../../src/stores/accountStore';
import { useTheme } from '../../src/hooks/useTheme';
import { CURRENCY_OPTIONS } from '../../src/constants/currency';

export default function NewTripScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const createTripAccount = useAccountStore((s) => s.createTripAccount);

  const [name, setName] = useState('');
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [tripEndDate, setTripEndDate] = useState<Date>(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const [isSaving, setIsSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim()) {
      Alert.alert(t('trip.tripName'), t('errors.required'));
      return;
    }
    setIsSaving(true);
    try {
      const account = await createTripAccount(name.trim(), tripEndDate.toISOString().slice(0, 10), currencyCode);
      router.replace(`/account/${account.id}`);
    } catch (error) {
      Alert.alert(t('errors.genericTitle'), t('errors.genericBody'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.label, { color: theme.textPrimary }]}>{t('trip.tripName')}</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t('trip.tripNamePlaceholder')}
        style={[styles.input, { borderColor: theme.border, color: theme.textPrimary }]}
      />

      <Text style={[styles.label, { color: theme.textPrimary }]}>{t('trip.endDate')}</Text>
      <DateTimePicker value={tripEndDate} mode="date" minimumDate={new Date()} onChange={(_, date) => date && setTripEndDate(date)} />

      <Text style={[styles.label, { color: theme.textPrimary }]}>{t('trip.currency')}</Text>
      <View style={styles.currencyRow}>
        {CURRENCY_OPTIONS.map((code) => (
          <TouchableOpacity
            key={code}
            onPress={() => setCurrencyCode(code)}
            style={[styles.currencyChip, currencyCode === code && { backgroundColor: theme.primary }]}
          >
            <Text style={{ color: currencyCode === code ? theme.onPrimary : theme.textSecondary }}>{code}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        disabled={isSaving}
        onPress={handleCreate}
        style={[styles.createButton, { backgroundColor: theme.primary }]}
      >
        <Text style={{ color: theme.onPrimary, fontWeight: '600' }}>{t('trip.createTrip')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  currencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  currencyChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  createButton: { marginTop: 32, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
});
```

Register the route in `apps/mobile/app/_layout.tsx`, in the `<Stack>` alongside other modal-style screens:
```tsx
<Stack.Screen name="trip/new" options={{ title: t('trip.createTrip'), headerBackTitle: '' }} />
```
(Per the recurring "new screens need a header" rule — this route MUST have a title and back button, matching every other screen registration in this file.)

- [ ] **Step 2: Manually verify**

Run (from `apps/mobile/`):
```bash
npx expo start --web
```
Navigate to `/trip/new` in the browser, fill the form, tap "Create trip", and confirm it navigates to the new account without a console error.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/trip/new.tsx apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): add trip creation screen"
```

---

### Task 26: `app/trip/[id]/settle-up.tsx`

**Files:**
- Create: `apps/mobile/app/trip/[id]/settle-up.tsx`
- Modify: `apps/mobile/app/_layout.tsx`

**Interfaces:**
- Consumes: `tripStore` (Task 21), `exchangeRateStore`'s `convertAmount` (existing, for per-viewer currency display).

- [ ] **Step 1: Implement**

Create `apps/mobile/app/trip/[id]/settle-up.tsx`:
```tsx
import React, { useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Linking, Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTripStore } from '../../../src/stores/tripStore';
import { useAuthStore } from '../../../src/stores/authStore';
import { useExchangeRateStore } from '../../../src/stores/exchangeRateStore';
import { useTheme } from '../../../src/hooks/useTheme';

export default function SettleUpScreen() {
  const { id: accountId } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const { balances, suggestedTransfers, isLoading, loadSettleUp, payDebt, confirmPayment } = useTripStore();
  const currentUser = useAuthStore((s) => s.user);
  const convertAmount = useExchangeRateStore((s) => s.convertAmount);

  useEffect(() => {
    if (accountId) loadSettleUp(accountId);
  }, [accountId, loadSettleUp]);

  const handlePay = useCallback(
    async (fromUserId: string, toUserId: string, amount: number) => {
      const response = await payDebt(accountId, fromUserId, toUserId, amount);
      if (response.paymentLink) {
        await Linking.openURL(response.paymentLink);
      } else if (response.manualInstructions) {
        Alert.alert(t('trip.payVia'), `${t('trip.manualBlikInstructions')} ${response.paymentHandle}`);
      } else {
        Alert.alert(t('trip.markAsPaid'), t('trip.markAsPaidBody'));
      }
    },
    [accountId, payDebt, t],
  );

  if (!isLoading && suggestedTransfers.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textPrimary }}>{t('trip.allSettled')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={suggestedTransfers}
        keyExtractor={(item) => `${item.fromUserId}-${item.toUserId}`}
        renderItem={({ item }) => {
          const fromName = balances.find((b) => b.userId === item.fromUserId)?.userName ?? '';
          const toName = balances.find((b) => b.userId === item.toUserId)?.userName ?? '';
          const displayAmount = convertAmount(item.amount, 'USD') ?? item.amount;
          const isMeReceiving = item.toUserId === currentUser?.id;
          const isMeOwing = item.fromUserId === currentUser?.id;

          return (
            <View style={[styles.row, { borderColor: theme.border }]}>
              <Text style={{ color: theme.textPrimary }}>
                {fromName} → {toName}: {displayAmount.toFixed(2)}
              </Text>
              {isMeOwing && (
                <TouchableOpacity onPress={() => handlePay(item.fromUserId, item.toUserId, item.amount)} style={styles.actionButton}>
                  <Text style={{ color: theme.primary }}>{t('trip.payVia')}</Text>
                </TouchableOpacity>
              )}
              {isMeReceiving && (
                <TouchableOpacity onPress={() => confirmPayment(accountId, item.fromUserId)} style={styles.actionButton}>
                  <Text style={{ color: theme.primary }}>{t('trip.confirmReceived')}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  actionButton: { paddingHorizontal: 10, paddingVertical: 6 },
});
```

Register the route in `apps/mobile/app/_layout.tsx`:
```tsx
<Stack.Screen name="trip/[id]/settle-up" options={{ title: t('trip.settleUp'), headerBackTitle: '' }} />
```

**Note for the implementer:** `confirmPayment` in the store takes a `transactionId`, but this screen only has `suggestedTransfers` (not yet materialized `SettleUpTransaction` rows) — before `confirmPayment` can be wired to a specific transfer, `payDebt`'s response `transactionId` must be tracked per-transfer in local screen state. Adjust this task to store `{ [transferKey]: transactionId }` in a `useState` after each `handlePay` call, and pass that `transactionId` into `confirmPayment` instead of `item.fromUserId`. Write a component test asserting this mapping before considering the task done.

- [ ] **Step 2: Manually verify**

```bash
npx expo start --web
```
Create a trip with 2+ members (use a second test account or seed data), add a split expense, navigate to the settle-up screen, and confirm balances render.

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/app/trip/[id]/settle-up.tsx" apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): add trip settle-up screen"
```

---

### Task 27: `app/trip/payment-settings.tsx`

**Files:**
- Create: `apps/mobile/app/trip/payment-settings.tsx`
- Modify: `apps/mobile/app/_layout.tsx`

**Interfaces:**
- Consumes: `accountStore.updatePaymentInfo` (Task 23).

- [ ] **Step 1: Implement**

Create `apps/mobile/app/trip/payment-settings.tsx`:
```tsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccountStore } from '../../src/stores/accountStore';
import { useTheme } from '../../src/hooks/useTheme';
import { SettleMethod } from '@budget/shared-types';

const METHODS: SettleMethod[] = ['revolut', 'paypal', 'blik', 'cash', 'other'];

export default function PaymentSettingsScreen() {
  const { id: accountId } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const updatePaymentInfo = useAccountStore((s) => s.updatePaymentInfo);

  const [method, setMethod] = useState<SettleMethod>('revolut');
  const [handle, setHandle] = useState('');

  async function handleSave() {
    try {
      await updatePaymentInfo(accountId, method, handle.trim());
      Alert.alert(t('trip.addPaymentInfo'), t('common.saved'));
    } catch {
      Alert.alert(t('errors.genericTitle'), t('errors.genericBody'));
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.label, { color: theme.textPrimary }]}>{t('trip.addPaymentInfo')}</Text>
      <View style={styles.methodRow}>
        {METHODS.map((m) => (
          <TouchableOpacity
            key={m}
            onPress={() => setMethod(m)}
            style={[styles.methodChip, method === m && { backgroundColor: theme.primary }]}
          >
            <Text style={{ color: method === m ? theme.onPrimary : theme.textSecondary }}>{t(`trip.method${m}`)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        value={handle}
        onChangeText={setHandle}
        placeholder={t('trip.paymentHandlePlaceholder')}
        style={[styles.input, { borderColor: theme.border, color: theme.textPrimary }]}
      />
      <TouchableOpacity onPress={handleSave} style={[styles.saveButton, { backgroundColor: theme.primary }]}>
        <Text style={{ color: theme.onPrimary, fontWeight: '600' }}>{t('common.save')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  methodChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 24 },
  saveButton: { paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
});
```

Register in `apps/mobile/app/_layout.tsx`:
```tsx
<Stack.Screen name="trip/payment-settings" options={{ title: t('trip.addPaymentInfo'), headerBackTitle: '' }} />
```

- [ ] **Step 2: Manually verify**

```bash
npx expo start --web
```
Navigate to `/trip/payment-settings?id=<accountId>`, set a method + handle, save, confirm no console error.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/trip/payment-settings.tsx apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): add trip payment settings screen"
```

---

### Task 28: Wire `TripExpenseSplitPicker` into expense screens

**Files:**
- Modify: `apps/mobile/app/expense/new.tsx`
- Modify: `apps/mobile/app/expense/[id].tsx`

**Interfaces:**
- Consumes: `TripExpenseSplitPicker` (Task 24), `useAccountStore` (existing, for `currentAccountType`/members).

- [ ] **Step 1: Implement in `expense/new.tsx`**

Import the component and the account store's current-account/type selectors (already used elsewhere in this file):
```tsx
import { TripExpenseSplitPicker } from '../../src/components/expenses/TripExpenseSplitPicker';
```

In the render body, below the amount field and above the submit button, add:
```tsx
{currentAccount?.type === 'trip' && (
  <TripExpenseSplitPicker
    members={accountMembers.map((m) => ({ userId: m.userId, name: m.name }))}
    totalAmount={Number(amount) || 0}
    onChange={(splitType, shares) => {
      setSplitType(splitType);
      setShares(shares);
    }}
  />
)}
```
Add `splitType`/`shares` to the component's local state (`useState<ShareType>('equal')`, `useState<{ userId: string; value: number }[]>([])`), and include them in the `addExpense({ ...existingFields, splitType, shares })` call at submit time. `accountMembers` should be sourced from the existing account-members list already loaded elsewhere in the app for the invite screen (`useAccountStore((s) => s.members)` or equivalent — match whatever selector the codebase already uses for member lists).

- [ ] **Step 2: Implement in `expense/[id].tsx`**

Apply the identical block, additionally pre-populating `shares`/`splitType` state from the loaded expense's existing shares (fetch via `tripExpenseShareRepository.getSharesForExpense(expense.id)` on screen mount when `currentAccount?.type === 'trip'`).

- [ ] **Step 3: Manually verify**

```bash
npx expo start --web
```
Open a trip account, create a new expense, confirm the split picker appears and the equal-split default renders member chips; edit the expense and confirm the previously-selected split is shown.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/expense/new.tsx "apps/mobile/app/expense/[id].tsx"
git commit -m "feat(mobile): wire TripExpenseSplitPicker into expense create/edit screens"
```

---

### Task 29: `AccountSwitcher` — trip badge + past trips section

**Files:**
- Modify: `apps/mobile/src/components/AccountSwitcher.tsx`

**Interfaces:**
- Consumes: `getTripDaysLeft` (Task 23).

- [ ] **Step 1: Implement**

In `AccountSwitcher.tsx`, in the account list rendering, add a badge for trip-type accounts:
```tsx
{account.type === 'trip' && account.tripStatus === 'active' && (
  <Text style={styles.tripBadge}>{t('trip.daysLeft', { count: getTripDaysLeft(account) })}</Text>
)}
{account.type === 'trip' && account.tripStatus === 'settling' && (
  <Text style={[styles.tripBadge, styles.tripBadgeUrgent]}>{t('trip.tripEnded')}</Text>
)}
```

Split the account list into two sections: filter `account.tripStatus !== 'archived'` for the main list, and render a collapsible section below it for `account.tripStatus === 'archived'` accounts titled `t('trip.pastTrips')`, using the same collapsible-section pattern already used elsewhere in this file (or a simple `useState` boolean toggle if no existing pattern applies) — tapping an archived trip opens it in the same account-switch flow but the account context becomes read-only (no new gating code needed here; `TripArchivedGuard` already blocks writes server-side, and mobile write buttons should be hidden via the existing `canEdit`-style checks, extended with `account.tripStatus !== 'archived'` wherever `canEdit` is computed in `accountStore.ts`).

Add `import { getTripDaysLeft } from '../stores/accountStore';` and a suitcase icon (reuse an existing icon library already imported in this file, e.g. `Ionicons name="briefcase-outline"`) next to the account name for `type === 'trip'`.

Add to `styles`:
```typescript
tripBadge: { fontSize: 11, color: theme.textSecondary },
tripBadgeUrgent: { color: theme.error, fontWeight: '600' },
```

- [ ] **Step 2: Manually verify**

```bash
npx expo start --web
```
Confirm active trips show "N days left", a settling trip shows "Trip ended — settle up", and an archived trip appears under "Past trips".

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/AccountSwitcher.tsx
git commit -m "feat(mobile): show trip status badges and past-trips section in AccountSwitcher"
```

---

### Task 30: Notification preference toggle

**Files:**
- Modify: `apps/mobile/app/settings/notifications.tsx`

**Interfaces:**
- Consumes: `tripSettleUp` field on `NotificationPreferencesResponse` (Task 14).

- [ ] **Step 1: Implement**

In `apps/mobile/app/settings/notifications.tsx`, find the existing toggle row list (e.g. the `Tracking Reminder` row) and add one following the identical pattern:
```tsx
<NotificationToggleRow
  label={t('trip.notifyTripSettleUp')}
  description={t('trip.notifyTripSettleUpDesc')}
  value={preferences.tripSettleUp}
  onValueChange={(value) => updatePreferences({ tripSettleUp: value })}
/>
```
(Match the exact component/prop names already used by the surrounding rows in this file — `NotificationToggleRow` is a placeholder name here; use whatever the file's existing rows are actually built from.)

- [ ] **Step 2: Manually verify**

```bash
npx expo start --web
```
Open Settings → Notifications, confirm the new toggle appears and persists after toggling + reload.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/settings/notifications.tsx
git commit -m "feat(mobile): add trip settle-up notification preference toggle"
```

---

### Task 31: Trip-invite deep-link auto-accept

**Files:**
- Create: `apps/mobile/src/utils/deepLink.ts`
- Test: `apps/mobile/src/utils/__tests__/deepLink.test.ts`
- Modify: `apps/mobile/app/_layout.tsx`

**Interfaces:**
- Consumes: `useAccountStore().acceptInvitation(inviteCode)` (existing method, currently called from `account/join.tsx`).
- Produces: `extractTripInviteCode(url): string | null`; a new effect in `_layout.tsx` that auto-accepts a pending invite once auth completes, following the exact same "cold-start gate" pattern already used for the `chat_mention` deep link and the `getLastNotificationResponseAsync()` flush (gated on `!isInitializing && isAuthenticated && fontsLoaded`).

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/utils/__tests__/deepLink.test.ts`:
```typescript
import { extractTripInviteCode } from '../deepLink';

describe('extractTripInviteCode', () => {
  it('extracts the code from a trip-invite URL', () => {
    expect(extractTripInviteCode('https://ai-budget.pl/trip-invite/a1b2c3d4')).toBe('a1b2c3d4');
  });

  it('is case-insensitive on hex characters', () => {
    expect(extractTripInviteCode('https://ai-budget.pl/trip-invite/A1B2C3D4')).toBe('A1B2C3D4');
  });

  it('returns null for unrelated URLs', () => {
    expect(extractTripInviteCode('https://ai-budget.pl/blog/pl/budzet-domowy/')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/mobile/`):
```bash
npx jest src/utils/__tests__/deepLink.test.ts
```
Expected: FAIL — `Cannot find module '../deepLink'`.

- [ ] **Step 3: Implement the helper**

Create `apps/mobile/src/utils/deepLink.ts`:
```typescript
export function extractTripInviteCode(url: string): string | null {
  const match = url.match(/trip-invite\/([a-f0-9]{8})/i);
  return match ? match[1] : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest src/utils/__tests__/deepLink.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the auto-accept effect into `_layout.tsx`**

In `apps/mobile/app/_layout.tsx`, alongside the existing `Linking`-based deep-link handling and the documented cold-start gate for `chat_mention`, add:
```tsx
import { extractTripInviteCode } from '../src/utils/deepLink';
import * as Linking from 'expo-linking';
// ...
const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(null);

useEffect(() => {
  const subscription = Linking.addEventListener('url', ({ url }) => {
    const code = extractTripInviteCode(url);
    if (code) setPendingInviteCode(code);
  });
  Linking.getInitialURL().then((url) => {
    if (url) {
      const code = extractTripInviteCode(url);
      if (code) setPendingInviteCode(code);
    }
  });
  return () => subscription.remove();
}, []);

useEffect(() => {
  if (!isInitializing && isAuthenticated && fontsLoaded && pendingInviteCode) {
    useAccountStore
      .getState()
      .acceptInvitation(pendingInviteCode)
      .then((account) => {
        setPendingInviteCode(null);
        router.push(`/account/${account.id}`);
      })
      .catch(() => {
        setPendingInviteCode(null);
      });
  }
}, [isInitializing, isAuthenticated, fontsLoaded, pendingInviteCode]);
```
Place this **alongside** (not replacing) the existing `chat_mention`/notification cold-start gate effect — both must stay gated on the identical `!isInitializing && isAuthenticated && fontsLoaded` condition, per the documented "keep the two deep-link paths gated symmetrically" rule already in this file for the notification path.

**Universal link registration:** confirm `https://ai-budget.pl/trip-invite/*` is added to the app's associated-domains / Android App Links config (wherever `https://ai-budget.pl/*` is already registered for other in-app links, e.g. the password-reset or blog links) — this is an app.json/native-config change, not a JS change; locate the existing entry and extend its path pattern rather than adding a new one.

- [ ] **Step 6: Manually verify**

Run (from `apps/mobile/`):
```bash
npx expo start --web
```
Simulate opening the app via `https://ai-budget.pl/trip-invite/<realCode>` (on web, paste the URL directly in the browser address bar pointed at the dev server's equivalent route), complete registration, and confirm the app navigates directly into the trip account without showing the manual "enter code" screen.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/utils/deepLink.ts apps/mobile/src/utils/__tests__/deepLink.test.ts apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): auto-accept trip invitations via deep link after registration"
```

---

## Phase 10 — i18n

### Task 32: Add `trip.*` keys to all 9 locales

**Files:**
- Modify: `apps/mobile/src/i18n/locales/en.ts`
- Modify: `apps/mobile/src/i18n/locales/de.ts`
- Modify: `apps/mobile/src/i18n/locales/es.ts`
- Modify: `apps/mobile/src/i18n/locales/fr.ts`
- Modify: `apps/mobile/src/i18n/locales/pl.ts`
- Modify: `apps/mobile/src/i18n/locales/ru.ts`
- Modify: `apps/mobile/src/i18n/locales/ua.ts`
- Modify: `apps/mobile/src/i18n/locales/be.ts`
- Modify: `apps/mobile/src/i18n/locales/nl.ts`

**Interfaces:**
- Produces: `trip.*` namespace consumed by every screen/component in Tasks 24–30.

- [ ] **Step 1: Add to `en.ts`** (source of truth), inside a new `trip: { ... }` top-level key:
```typescript
trip: {
  createTrip: 'Create trip',
  tripName: 'Trip name',
  tripNamePlaceholder: 'e.g. Bali 2026',
  startDate: 'Start date',
  endDate: 'End date',
  currency: 'Trip currency',
  daysLeft: '{{count}} days left',
  tripEnded: 'Trip ended — settle up',
  pastTrips: 'Past trips',
  settleUp: 'Settle up',
  splitBetween: 'Split between',
  splitEqual: 'Equally',
  splitExact: 'Exact amounts',
  splitPercentage: 'Percentage',
  splitShares: 'Shares',
  paidBy: 'Paid by',
  youOwe: 'You owe',
  owesYou: 'Owes you',
  allSettled: 'Everyone is settled up',
  payVia: 'Pay',
  markAsPaid: 'Mark as paid',
  markAsPaidBody: 'This person has no payment method set — settle up outside the app and mark it as paid.',
  manualBlikInstructions: 'Send a BLIK transfer manually to',
  confirmReceived: 'Confirm received',
  archiveTrip: 'Archive trip',
  archiveTripConfirm: 'All debts are settled. Archive this trip? It will become read-only.',
  addPaymentInfo: 'Payment info',
  paymentHandlePlaceholder: 'Username, link, or phone number',
  methodrevolut: 'Revolut',
  methodpaypal: 'PayPal',
  methodblik: 'BLIK',
  methodcash: 'Cash',
  methodother: 'Other',
  notifyTripSettleUp: 'Trip settle-up reminders',
  notifyTripSettleUpDesc: 'Get notified when a trip ends and it is time to settle up',
},
```

- [ ] **Step 2: Add to `pl.ts`**:
```typescript
trip: {
  createTrip: 'Utwórz podróż',
  tripName: 'Nazwa podróży',
  tripNamePlaceholder: 'np. Bali 2026',
  startDate: 'Data rozpoczęcia',
  endDate: 'Data zakończenia',
  currency: 'Waluta podróży',
  daysLeft: 'Pozostało dni: {{count}}',
  tripEnded: 'Podróż zakończona — rozliczcie się',
  pastTrips: 'Poprzednie podróże',
  settleUp: 'Rozliczenie',
  splitBetween: 'Podziel między',
  splitEqual: 'Po równo',
  splitExact: 'Dokładne kwoty',
  splitPercentage: 'Procentowo',
  splitShares: 'Udziały',
  paidBy: 'Zapłacił(a)',
  youOwe: 'Jesteś winien(na)',
  owesYou: 'Jest ci winien(na)',
  allSettled: 'Wszyscy się rozliczyli',
  payVia: 'Zapłać',
  markAsPaid: 'Oznacz jako opłacone',
  markAsPaidBody: 'Ta osoba nie ustawiła metody płatności — rozliczcie się poza aplikacją i oznaczcie jako opłacone.',
  manualBlikInstructions: 'Wyślij przelew BLIK ręcznie na',
  confirmReceived: 'Potwierdź otrzymanie',
  archiveTrip: 'Zarchiwizuj podróż',
  archiveTripConfirm: 'Wszystkie długi są rozliczone. Zarchiwizować tę podróż? Stanie się tylko do odczytu.',
  addPaymentInfo: 'Dane do płatności',
  paymentHandlePlaceholder: 'Nazwa użytkownika, link lub numer telefonu',
  methodrevolut: 'Revolut',
  methodpaypal: 'PayPal',
  methodblik: 'BLIK',
  methodcash: 'Gotówka',
  methodother: 'Inne',
  notifyTripSettleUp: 'Przypomnienia o rozliczeniu podróży',
  notifyTripSettleUpDesc: 'Powiadomienie, gdy podróż się kończy i czas się rozliczyć',
},
```

- [ ] **Step 3: Add to `ru.ts`**:
```typescript
trip: {
  createTrip: 'Создать поездку',
  tripName: 'Название поездки',
  tripNamePlaceholder: 'напр. Бали 2026',
  startDate: 'Дата начала',
  endDate: 'Дата окончания',
  currency: 'Валюта поездки',
  daysLeft: 'Осталось дней: {{count}}',
  tripEnded: 'Поездка окончена — рассчитайтесь',
  pastTrips: 'Прошлые поездки',
  settleUp: 'Рассчитаться',
  splitBetween: 'Разделить между',
  splitEqual: 'Поровну',
  splitExact: 'Точные суммы',
  splitPercentage: 'Проценты',
  splitShares: 'Доли',
  paidBy: 'Заплатил(а)',
  youOwe: 'Вы должны',
  owesYou: 'Вам должны',
  allSettled: 'Все рассчитались',
  payVia: 'Оплатить',
  markAsPaid: 'Отметить как оплачено',
  markAsPaidBody: 'У этого человека не указан способ оплаты — рассчитайтесь вне приложения и отметьте как оплачено.',
  manualBlikInstructions: 'Отправьте перевод BLIK вручную на',
  confirmReceived: 'Подтвердить получение',
  archiveTrip: 'Завершить поездку',
  archiveTripConfirm: 'Все долги закрыты. Завершить поездку? Она станет доступна только для чтения.',
  addPaymentInfo: 'Платёжные данные',
  paymentHandlePlaceholder: 'Имя пользователя, ссылка или номер телефона',
  methodrevolut: 'Revolut',
  methodpaypal: 'PayPal',
  methodblik: 'BLIK',
  methodcash: 'Наличные',
  methodother: 'Другое',
  notifyTripSettleUp: 'Напоминания о расчёте по поездке',
  notifyTripSettleUpDesc: 'Уведомление, когда поездка закончилась и пора рассчитаться',
},
```

- [ ] **Step 4: Add to `de.ts`, `es.ts`, `fr.ts`, `ua.ts`, `be.ts`, `nl.ts`**, translating the same 26 keys (structure identical to `en.ts`, values translated to German, Spanish, French, Ukrainian, Belarusian, and Dutch respectively). Use the same key names and interpolation syntax (`{{count}}`) in every file — do not change key names per locale.

- [ ] **Step 5: Run the i18n completeness check**

If the repo has a script for this (check `package.json` for an `i18n:check`/`lint:i18n` script); otherwise run:
```bash
npx tsc --noEmit
```
from `apps/mobile/` and confirm no type errors — the locale files are typed against the `en.ts` shape (via `typeof en`), so a missing key in any locale file surfaces as a compile error.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/i18n/locales
git commit -m "feat(i18n): add trip.* keys to all 9 locales"
```

---

## Final Verification

- [ ] **Run the full test suite**

```bash
npm run test
```
Expected: all tests pass, including every new `*.spec.ts`/`*.test.ts` file added in this plan.

- [ ] **Run the full typecheck**

```bash
npm run typecheck
```
Expected: no errors across `apps/api`, `apps/mobile`, `apps/admin`, `packages/shared-types`, `packages/shared-utils`.

- [ ] **Run the full lint**

```bash
npm run lint
```
Expected: no new lint errors.

- [ ] **Manual end-to-end smoke test** (per `verification-before-completion` — do this before declaring the feature done)

1. Create a trip account with a 7-day-out end date.
2. Invite a second test user via the trip-invite link; confirm they land directly in the trip account after registering (no manual code-entry screen).
3. Add 2–3 expenses in different currencies, splitting via each of the four split types across the two members.
4. Open the settle-up screen, confirm the suggested transfer amount matches manual arithmetic.
5. Set a Revolut handle for the creditor, tap "Pay", confirm the generated `revolut.me` link opens.
6. Confirm the payment as the receiver; confirm the settle-up screen updates to "Everyone is settled up".
7. Archive the trip; confirm write actions (add expense) are blocked with a clear error, and the trip appears in "Past trips".

## Out of Scope (unchanged from spec)

Pro-tier limits, real PSP payment processing, BLIK cross-bank deep-linking, anonymous/guest participation, shared↔trip account conversion, item-level receipt splitting.
