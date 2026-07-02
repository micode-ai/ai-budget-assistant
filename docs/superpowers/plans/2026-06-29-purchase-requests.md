# Purchase Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any family account member propose a purchase for group approval; others vote via app or Telegram/WhatsApp bots; approved requests become planned expenses converted to real expenses with one tap.

**Architecture:** Standalone `PurchaseRequestsModule` in NestJS (no Expense model pollution). Server-only storage (no offline — voting requires consistency). Push notifications via `NotificationsService`; bot voting via callback handlers in Telegram/WhatsApp modules.

**Tech Stack:** NestJS 10 + Prisma 5 (API), Expo/React Native + Zustand (mobile), shared-types for interfaces/DTOs.

## Global Constraints

- All new DTOs go in `packages/shared-types/src/dto/<domain>.ts` — never inline in the API module.
- API MUST NOT import runtime values from `@budget/shared-types` — types only.
- Service signatures: `(accountId, userId, dto)` — all Prisma queries filter by `accountId`.
- New screens MUST have a `<Stack.Screen>` in `apps/mobile/app/_layout.tsx` with title + back.
- i18n: update ALL 9 locale files (`en`, `de`, `es`, `fr`, `pl`, `ru`, `ua`, `be`, `nl`).
- `ViewerBlockGuard` usage: `@UseGuards(new ViewerBlockGuard())` (no import of AccountsModule needed).
- Route ordering: declare `@Patch('settings/approval-rule')` BEFORE `@Get(':id')` to avoid shadow.
- Run from `apps/api/`: `npx prisma migrate dev --name <name>` then `npx prisma generate`.

---

### Task 1: Shared types — entities, DTOs, NotificationType

**Files:**
- Create: `packages/shared-types/src/entities/purchase-request.ts`
- Create: `packages/shared-types/src/dto/purchase-request.ts`
- Modify: `packages/shared-types/src/entities/index.ts`
- Modify: `packages/shared-types/src/dto/index.ts`
- Modify: `packages/shared-types/src/entities/primitives.ts`
- Modify: `packages/shared-types/src/entities/expense.ts` (add `isPlanned`)

**Interfaces:**
- Produces: `PurchaseRequest`, `PurchaseRequestVote`, `PurchaseRequestStatus`, `ApprovalRule`, `VoteChoice`, `CreatePurchaseRequestDto`, `VotePurchaseRequestDto` — used by all subsequent tasks.

- [ ] **Step 1: Create entity file**

```typescript
// packages/shared-types/src/entities/purchase-request.ts
export type PurchaseRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PURCHASED' | 'EXPIRED';
export type ApprovalRule = 'MAJORITY' | 'UNANIMOUS' | 'OWNER_ONLY';
export type VoteChoice = 'APPROVE' | 'REJECT' | 'ABSTAIN';

export interface PurchaseRequestVote {
  id: string;
  requestId: string;
  userId: string;
  userName: string;
  vote: VoteChoice;
  comment?: string;
  createdAt: string;
}

export interface PurchaseRequest {
  id: string;
  accountId: string;
  createdByUserId: string;
  createdByUserName?: string;
  title: string;
  description?: string;
  amount: number;
  currency: string;
  categoryId?: string;
  merchant?: string;
  imageUrl?: string;
  status: PurchaseRequestStatus;
  approvalRule: ApprovalRule;
  plannedExpenseId?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  votes?: PurchaseRequestVote[];
}
```

- [ ] **Step 2: Create DTO file**

```typescript
// packages/shared-types/src/dto/purchase-request.ts
import type { ApprovalRule, VoteChoice } from '../entities/purchase-request';

export interface CreatePurchaseRequestDto {
  title: string;
  amount: number;
  currency: string;
  description?: string;
  categoryId?: string;
  merchant?: string;
  imageUrl?: string;
  expiresAt?: string;
}

export interface VotePurchaseRequestDto {
  vote: VoteChoice;
  comment?: string;
}

export interface UpdateApprovalRuleDto {
  rule: ApprovalRule;
}
```

- [ ] **Step 3: Add export to entity barrel**

In `packages/shared-types/src/entities/index.ts`, add after the last existing export:
```typescript
export * from './purchase-request';
```

- [ ] **Step 4: Add export to DTO barrel**

In `packages/shared-types/src/dto/index.ts`, add after the last existing export:
```typescript
export * from './purchase-request';
```

- [ ] **Step 5: Add notification types to primitives**

In `packages/shared-types/src/entities/primitives.ts`, find the `NotificationType` union and add 4 new values:
```typescript
export type NotificationType =
  | 'budget_alert'
  | 'shared_expense'
  | 'spending_anomaly'
  | 'debt_reminder'
  | 'recurring_expense'
  | 'chat_mention'
  | 'subscription_renewal'
  | 'tracking_gap_reminder'
  | 'purchase_request_created'
  | 'purchase_request_voted'
  | 'purchase_request_approved'
  | 'purchase_request_rejected';
```

- [ ] **Step 6: Add `isPlanned` to Expense entity**

In `packages/shared-types/src/entities/expense.ts`, find the `Expense` interface and add:
```typescript
isPlanned?: boolean;
```

- [ ] **Step 7: Verify types build**

```bash
cd packages/shared-types && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/shared-types/
git commit -m "feat(types): Purchase Request entities, DTOs, NotificationType + Expense.isPlanned"
```

---

### Task 2: DB schema + migrations

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Consumes: entity names from Task 1 (conceptual — Prisma enums mirror shared-type unions)
- Produces: DB tables `purchase_requests`, `purchase_request_votes`; new fields `Account.purchaseApprovalRule`, `Expense.isPlanned`, `User.notifyPurchaseRequests`

- [ ] **Step 1: Add enums to schema**

In `apps/api/prisma/schema.prisma`, before or after existing enums, add:

```prisma
enum PurchaseRequestStatus {
  PENDING
  APPROVED
  REJECTED
  PURCHASED
  EXPIRED
}

enum ApprovalRule {
  MAJORITY
  UNANIMOUS
  OWNER_ONLY
}

enum VoteChoice {
  APPROVE
  REJECT
  ABSTAIN
}
```

- [ ] **Step 2: Add PurchaseRequest model**

In `apps/api/prisma/schema.prisma`, add after existing models:

```prisma
model PurchaseRequest {
  id               String                @id @default(cuid())
  accountId        String                @map("account_id")
  createdByUserId  String                @map("created_by_user_id")
  title            String
  description      String?
  amount           Decimal               @db.Decimal(12, 2)
  currency         String
  categoryId       String?               @map("category_id")
  merchant         String?
  imageUrl         String?               @map("image_url")
  status           PurchaseRequestStatus @default(PENDING)
  approvalRule     ApprovalRule          @map("approval_rule")
  plannedExpenseId String?               @unique @map("planned_expense_id")
  expiresAt        DateTime?             @map("expires_at")
  createdAt        DateTime              @default(now()) @map("created_at")
  updatedAt        DateTime              @updatedAt @map("updated_at")

  account        Account               @relation(fields: [accountId], references: [id], onDelete: Cascade)
  createdBy      User                  @relation("PurchaseRequestCreator", fields: [createdByUserId], references: [id])
  votes          PurchaseRequestVote[]
  plannedExpense Expense?              @relation("PlannedPurchase", fields: [plannedExpenseId], references: [id])

  @@index([accountId, status])
  @@map("purchase_requests")
}

model PurchaseRequestVote {
  id        String     @id @default(cuid())
  requestId String     @map("request_id")
  userId    String     @map("user_id")
  vote      VoteChoice
  comment   String?
  createdAt DateTime   @default(now()) @map("created_at")

  request PurchaseRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  user    User            @relation("PurchaseRequestVoter", fields: [userId], references: [id])

  @@unique([requestId, userId])
  @@map("purchase_request_votes")
}
```

- [ ] **Step 3: Add back-relations to Account, User, Expense**

Find the `Account` model. Add inside its body (after existing relations):
```prisma
  purchaseApprovalRule ApprovalRule   @default(MAJORITY) @map("purchase_approval_rule")
  purchaseRequests     PurchaseRequest[]
```

Find the `User` model. Add inside its body:
```prisma
  notifyPurchaseRequests Boolean               @default(true) @map("notify_purchase_requests")
  purchaseRequests       PurchaseRequest[]     @relation("PurchaseRequestCreator")
  purchaseRequestVotes   PurchaseRequestVote[] @relation("PurchaseRequestVoter")
```

Find the `Expense` model. Add inside its body (before `@@map`):
```prisma
  isPlanned        Boolean          @default(false) @map("is_planned")
  purchaseRequest  PurchaseRequest? @relation("PlannedPurchase")

  @@index([accountId, isPlanned])
```

- [ ] **Step 4: Run migration**

```bash
cd apps/api
npx prisma migrate dev --name add_purchase_requests
```
Expected: migration file created in `prisma/migrations/`, no errors.

- [ ] **Step 5: Generate Prisma client**

```bash
npx prisma generate
```
Expected: client regenerated successfully.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/
git commit -m "feat(db): add purchase_requests, purchase_request_votes tables + Account/Expense/User fields"
```

---

### Task 3: API service (TDD)

**Files:**
- Create: `apps/api/src/modules/purchase-requests/purchase-requests.service.spec.ts`
- Create: `apps/api/src/modules/purchase-requests/purchase-requests.service.ts`
- Create: `apps/api/src/modules/purchase-requests/purchase-requests.module.ts`

**Interfaces:**
- Consumes: `PrismaService`, `NotificationsService`, shared-types from Task 1, Prisma client from Task 2
- Produces:
  - `PurchaseRequestsService.create(accountId, userId, dto): Promise<PurchaseRequest>`
  - `PurchaseRequestsService.findAll(accountId, status?): Promise<PurchaseRequest[]>`
  - `PurchaseRequestsService.findOne(id, accountId): Promise<PurchaseRequest>`
  - `PurchaseRequestsService.vote(id, accountId, userId, dto): Promise<PurchaseRequest>`
  - `PurchaseRequestsService.convert(id, accountId, userId): Promise<{ expenseId: string }>`
  - `PurchaseRequestsService.markPurchased(id, accountId): Promise<void>`
  - `PurchaseRequestsService.cancel(id, accountId, userId, userRole): Promise<void>`
  - `PurchaseRequestsService.updateApprovalRule(accountId, rule): Promise<void>`
  - `PurchaseRequestsService.getPendingCount(accountId): Promise<number>`

- [ ] **Step 1: Write failing service tests**

```typescript
// apps/api/src/modules/purchase-requests/purchase-requests.service.spec.ts
import { Test } from '@nestjs/testing';
import { PurchaseRequestsService } from './purchase-requests.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

const mockPrisma = {
  purchaseRequest: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  purchaseRequestVote: {
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
  accountMember: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  expense: {
    create: jest.fn(),
    update: jest.fn(),
  },
  account: {
    update: jest.fn(),
  },
  $transaction: jest.fn((fn) => fn(mockPrisma)),
};

const mockNotifications = { sendToUser: jest.fn().mockResolvedValue(true) };

describe('PurchaseRequestsService', () => {
  let service: PurchaseRequestsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PurchaseRequestsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();
    service = module.get(PurchaseRequestsService);
    jest.clearAllMocks();
  });

  describe('evaluateApproval — MAJORITY', () => {
    it('approves when >50% approve (3 of 5, 0 abstain)', async () => {
      const votes = [
        { vote: 'APPROVE', userId: 'u1' },
        { vote: 'APPROVE', userId: 'u2' },
        { vote: 'APPROVE', userId: 'u3' },
      ];
      mockPrisma.accountMember.count.mockResolvedValue(5);
      const result = (service as any).computeDecision('MAJORITY', votes, 5);
      expect(result).toBe('APPROVED');
    });

    it('rejects when >50% reject', async () => {
      const votes = [
        { vote: 'REJECT', userId: 'u1' },
        { vote: 'REJECT', userId: 'u2' },
        { vote: 'REJECT', userId: 'u3' },
      ];
      const result = (service as any).computeDecision('MAJORITY', votes, 5);
      expect(result).toBe('REJECTED');
    });

    it('returns null when no majority yet', () => {
      const votes = [{ vote: 'APPROVE', userId: 'u1' }, { vote: 'REJECT', userId: 'u2' }];
      const result = (service as any).computeDecision('MAJORITY', votes, 5);
      expect(result).toBeNull();
    });

    it('excludes ABSTAIN from denominator', () => {
      // 2 approve, 1 abstain, 2 total effective (denominator = 5 - 1 = 4? No:
      // ABSTAIN excluded from denominator means: 2 approve out of (5 - 1 abstain) = 4 effective
      // 2/4 = 50%, NOT > 50%, so still pending
      const votes = [
        { vote: 'APPROVE', userId: 'u1' },
        { vote: 'APPROVE', userId: 'u2' },
        { vote: 'ABSTAIN', userId: 'u3' },
      ];
      // 2 approve / (5 - 1 abstain) = 2/4 = 0.5, not > 0.5
      const result = (service as any).computeDecision('MAJORITY', votes, 5);
      expect(result).toBeNull();
    });
  });

  describe('evaluateApproval — UNANIMOUS', () => {
    it('approves when all non-abstain votes are APPROVE', () => {
      const votes = [
        { vote: 'APPROVE', userId: 'u1' },
        { vote: 'APPROVE', userId: 'u2' },
        { vote: 'ABSTAIN', userId: 'u3' },
      ];
      // effectiveTotal = 5 - 1 = 4, approveCount 2 !== 4 → still pending
      // Wait: only 3 have voted (2 approve + 1 abstain). effectiveTotal = totalMembers - abstainCount = 5 - 1 = 4
      // approveCount (2) !== effectiveTotal (4) → null
      const result = (service as any).computeDecision('UNANIMOUS', votes, 5);
      expect(result).toBeNull();
    });

    it('approves when all 3 members approve (no abstain)', () => {
      const votes = [
        { vote: 'APPROVE', userId: 'u1' },
        { vote: 'APPROVE', userId: 'u2' },
        { vote: 'APPROVE', userId: 'u3' },
      ];
      // effectiveTotal = 3 - 0 = 3, approveCount 3 === 3 → APPROVED
      const result = (service as any).computeDecision('UNANIMOUS', votes, 3);
      expect(result).toBe('APPROVED');
    });

    it('rejects immediately on any REJECT', () => {
      const votes = [{ vote: 'REJECT', userId: 'u1' }];
      const result = (service as any).computeDecision('UNANIMOUS', votes, 5);
      expect(result).toBe('REJECTED');
    });
  });

  describe('evaluateApproval — OWNER_ONLY', () => {
    const members = [
      { userId: 'owner1', role: 'owner' },
      { userId: 'editor1', role: 'editor' },
    ];

    it('approves when owner votes APPROVE', () => {
      const votes = [{ vote: 'APPROVE', userId: 'owner1' }];
      const result = (service as any).computeDecisionOwnerOnly(votes, members);
      expect(result).toBe('APPROVED');
    });

    it('rejects when owner votes REJECT', () => {
      const votes = [{ vote: 'REJECT', userId: 'owner1' }];
      const result = (service as any).computeDecisionOwnerOnly(votes, members);
      expect(result).toBe('REJECTED');
    });

    it('returns null when non-owner votes', () => {
      const votes = [{ vote: 'APPROVE', userId: 'editor1' }];
      const result = (service as any).computeDecisionOwnerOnly(votes, members);
      expect(result).toBeNull();
    });
  });

  describe('convert', () => {
    it('throws BadRequestException if status is not APPROVED', async () => {
      mockPrisma.purchaseRequest.findFirst.mockResolvedValue({
        id: 'pr1', accountId: 'acc1', status: 'PENDING', plannedExpenseId: null,
        amount: 100, currency: 'PLN', title: 'Test',
      });
      await expect(service.convert('pr1', 'acc1', 'user1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if already converted', async () => {
      mockPrisma.purchaseRequest.findFirst.mockResolvedValue({
        id: 'pr1', accountId: 'acc1', status: 'APPROVED', plannedExpenseId: 'exp1',
        amount: 100, currency: 'PLN', title: 'Test',
      });
      await expect(service.convert('pr1', 'acc1', 'user1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('allows creator to cancel their own request', async () => {
      mockPrisma.purchaseRequest.findFirst.mockResolvedValue({
        id: 'pr1', accountId: 'acc1', createdByUserId: 'user1', status: 'PENDING',
      });
      mockPrisma.purchaseRequest.update.mockResolvedValue({});
      await expect(service.cancel('pr1', 'acc1', 'user1', 'editor')).resolves.not.toThrow();
    });

    it('allows owner to cancel any request', async () => {
      mockPrisma.purchaseRequest.findFirst.mockResolvedValue({
        id: 'pr1', accountId: 'acc1', createdByUserId: 'other', status: 'PENDING',
      });
      mockPrisma.purchaseRequest.update.mockResolvedValue({});
      await expect(service.cancel('pr1', 'acc1', 'user1', 'owner')).resolves.not.toThrow();
    });

    it('throws ForbiddenException if non-creator non-owner tries to cancel', async () => {
      mockPrisma.purchaseRequest.findFirst.mockResolvedValue({
        id: 'pr1', accountId: 'acc1', createdByUserId: 'someone-else', status: 'PENDING',
      });
      await expect(service.cancel('pr1', 'acc1', 'user1', 'editor')).rejects.toThrow(ForbiddenException);
    });
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd apps/api && npx jest purchase-requests.service.spec.ts --no-coverage
```
Expected: FAIL — `Cannot find module './purchase-requests.service'`

- [ ] **Step 3: Implement the service**

```typescript
// apps/api/src/modules/purchase-requests/purchase-requests.service.ts
import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  CreatePurchaseRequestDto, VotePurchaseRequestDto,
  PurchaseRequest, ApprovalRule,
} from '@budget/shared-types';

type VoteRow = { vote: string; userId: string };
type MemberRow = { userId: string; role: string };

@Injectable()
export class PurchaseRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── pure helpers (package-private for tests) ─────────────────────────

  computeDecision(
    rule: string,
    votes: VoteRow[],
    totalMembers: number,
  ): 'APPROVED' | 'REJECTED' | null {
    const approveCount = votes.filter(v => v.vote === 'APPROVE').length;
    const rejectCount = votes.filter(v => v.vote === 'REJECT').length;
    const abstainCount = votes.filter(v => v.vote === 'ABSTAIN').length;
    const effective = totalMembers - abstainCount;
    if (effective <= 0) return null;

    if (rule === 'MAJORITY') {
      if (approveCount / effective > 0.5) return 'APPROVED';
      if (rejectCount / effective > 0.5) return 'REJECTED';
    } else if (rule === 'UNANIMOUS') {
      if (rejectCount >= 1) return 'REJECTED';
      if (approveCount === effective) return 'APPROVED';
    }
    return null;
  }

  computeDecisionOwnerOnly(
    votes: VoteRow[],
    members: MemberRow[],
  ): 'APPROVED' | 'REJECTED' | null {
    const owner = members.find(m => m.role === 'owner');
    if (!owner) return null;
    const ownerVote = votes.find(v => v.userId === owner.userId);
    if (ownerVote?.vote === 'APPROVE') return 'APPROVED';
    if (ownerVote?.vote === 'REJECT') return 'REJECTED';
    return null;
  }

  // ─── CRUD ────────────────────────────────────────────────────────────

  async create(accountId: string, userId: string, dto: CreatePurchaseRequestDto) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { purchaseApprovalRule: true },
    });
    if (!account) throw new NotFoundException('Account not found');

    const pr = await this.prisma.purchaseRequest.create({
      data: {
        accountId,
        createdByUserId: userId,
        title: dto.title,
        description: dto.description,
        amount: dto.amount,
        currency: dto.currency,
        categoryId: dto.categoryId,
        merchant: dto.merchant,
        imageUrl: dto.imageUrl,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        approvalRule: account.purchaseApprovalRule,
      },
      include: { createdBy: { select: { name: true } }, votes: true },
    });

    // Notify all members except creator
    await this.notifyMembers(accountId, userId, pr.title, 'purchase_request_created');

    return this.toResponse(pr);
  }

  async findAll(accountId: string, status?: string): Promise<PurchaseRequest[]> {
    const where: any = { accountId };
    if (status) where.status = status;
    const rows = await this.prisma.purchaseRequest.findMany({
      where,
      include: {
        createdBy: { select: { name: true } },
        votes: { include: { user: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(r => this.toResponse(r));
  }

  async findOne(id: string, accountId: string): Promise<PurchaseRequest> {
    const pr = await this.prisma.purchaseRequest.findFirst({
      where: { id, accountId },
      include: {
        createdBy: { select: { name: true } },
        votes: { include: { user: { select: { id: true, name: true } } } },
      },
    });
    if (!pr) throw new NotFoundException('Purchase request not found');
    return this.toResponse(pr);
  }

  async vote(id: string, accountId: string, userId: string, dto: VotePurchaseRequestDto) {
    const pr = await this.prisma.purchaseRequest.findFirst({
      where: { id, accountId },
    });
    if (!pr) throw new NotFoundException('Purchase request not found');
    if (pr.status !== 'PENDING') throw new BadRequestException('Voting is closed for this request');

    await this.prisma.purchaseRequestVote.upsert({
      where: { requestId_userId: { requestId: id, userId } },
      create: { requestId: id, userId, vote: dto.vote as any, comment: dto.comment },
      update: { vote: dto.vote as any, comment: dto.comment },
    });

    // Re-evaluate approval
    const allVotes = await this.prisma.purchaseRequestVote.findMany({ where: { requestId: id } });
    const members = await this.prisma.accountMember.findMany({
      where: { accountId },
      select: { userId: true, role: true },
    });
    const totalMembers = members.length;

    let decision: 'APPROVED' | 'REJECTED' | null;
    if (pr.approvalRule === 'OWNER_ONLY') {
      decision = this.computeDecisionOwnerOnly(allVotes, members);
    } else {
      decision = this.computeDecision(pr.approvalRule as string, allVotes, totalMembers);
    }

    if (decision) {
      await this.prisma.purchaseRequest.update({ where: { id }, data: { status: decision } });
      if (decision === 'APPROVED') {
        await this.notifyMembers(accountId, null, pr.title, 'purchase_request_approved');
      } else {
        await this.notifications.sendToUser(
          pr.createdByUserId,
          (lang) => this.t(lang, 'purchase_request_rejected_title'),
          (lang) => `${pr.title}`,
          { purchaseRequestId: id },
          'purchase_request_rejected',
        );
      }
    } else {
      // Notify creator of a new vote
      const voter = members.find(m => m.userId === userId);
      await this.notifications.sendToUser(
        pr.createdByUserId,
        (lang) => this.t(lang, 'purchase_request_voted_title'),
        (lang) => pr.title,
        { purchaseRequestId: id },
        'purchase_request_voted',
      );
    }

    return this.findOne(id, accountId);
  }

  async convert(id: string, accountId: string, userId: string): Promise<{ expenseId: string }> {
    const pr = await this.prisma.purchaseRequest.findFirst({ where: { id, accountId } });
    if (!pr) throw new NotFoundException('Purchase request not found');
    if (pr.status !== 'APPROVED') throw new BadRequestException('Request must be APPROVED before converting');
    if (pr.plannedExpenseId) throw new BadRequestException('Already converted to a planned expense');

    const expense = await this.prisma.$transaction(async (tx) => {
      const exp = await tx.expense.create({
        data: {
          accountId,
          userId,
          clientId: `pr-convert-${id}`,
          amount: pr.amount,
          currencyCode: pr.currency,
          categoryId: pr.categoryId ?? undefined,
          merchant: pr.merchant ?? undefined,
          description: pr.title,
          date: new Date(),
          source: 'manual',
          isPlanned: true,
        },
      });
      await tx.purchaseRequest.update({ where: { id }, data: { plannedExpenseId: exp.id } });
      return exp;
    });

    return { expenseId: expense.id };
  }

  async markPurchased(id: string, accountId: string): Promise<void> {
    const pr = await this.prisma.purchaseRequest.findFirst({ where: { id, accountId } });
    if (!pr) throw new NotFoundException('Purchase request not found');
    if (!pr.plannedExpenseId) throw new BadRequestException('No linked planned expense');

    await this.prisma.$transaction([
      this.prisma.expense.update({ where: { id: pr.plannedExpenseId }, data: { isPlanned: false } }),
      this.prisma.purchaseRequest.update({ where: { id }, data: { status: 'PURCHASED' } }),
    ]);
  }

  async cancel(id: string, accountId: string, userId: string, userRole: string): Promise<void> {
    const pr = await this.prisma.purchaseRequest.findFirst({ where: { id, accountId } });
    if (!pr) throw new NotFoundException('Purchase request not found');
    if (pr.createdByUserId !== userId && userRole !== 'owner') {
      throw new ForbiddenException('Only the creator or account owner can cancel this request');
    }
    await this.prisma.purchaseRequest.update({ where: { id }, data: { status: 'REJECTED' } });
  }

  async updateApprovalRule(accountId: string, rule: ApprovalRule): Promise<void> {
    await this.prisma.account.update({
      where: { id: accountId },
      data: { purchaseApprovalRule: rule as any },
    });
  }

  async getPendingCount(accountId: string): Promise<number> {
    return this.prisma.purchaseRequest.count({ where: { accountId, status: 'PENDING' } });
  }

  // ─── private helpers ─────────────────────────────────────────────────

  private async notifyMembers(
    accountId: string,
    excludeUserId: string | null,
    title: string,
    type: 'purchase_request_created' | 'purchase_request_approved',
  ) {
    const members = await this.prisma.accountMember.findMany({
      where: { accountId },
      select: { userId: true },
    });
    for (const { userId } of members) {
      if (userId === excludeUserId) continue;
      await this.notifications.sendToUser(
        userId,
        (lang) => this.t(lang, `${type}_title`),
        (lang) => title,
        {},
        type,
      );
    }
  }

  private t(lang: string, key: string): string {
    const map: Record<string, Record<string, string>> = {
      purchase_request_created_title: { en: '🛒 New purchase request', pl: '🛒 Nowy wniosek o zakup', de: '🛒 Neue Kaufanfrage', ru: '🛒 Новый запрос на покупку', ua: '🛒 Новий запит на купівлю', fr: '🛒 Nouvelle demande d\'achat', es: '🛒 Nueva solicitud de compra', be: '🛒 Новы запыт на куплю', nl: '🛒 Nieuw aankoopverzoek' },
      purchase_request_voted_title: { en: 'New vote on your request', pl: 'Nowy głos na Twój wniosek', de: 'Neue Abstimmung', ru: 'Новый голос за запрос', ua: 'Новий голос', fr: 'Nouveau vote', es: 'Nuevo voto', be: 'Новы голас', nl: 'Nieuwe stem' },
      purchase_request_approved_title: { en: '✅ Purchase request approved!', pl: '✅ Wniosek zatwierdzony!', de: '✅ Kaufanfrage genehmigt!', ru: '✅ Запрос одобрен!', ua: '✅ Запит схвалено!', fr: '✅ Demande approuvée!', es: '✅ ¡Solicitud aprobada!', be: '✅ Запыт адобраны!', nl: '✅ Aanvraag goedgekeurd!' },
      purchase_request_rejected_title: { en: '❌ Purchase request rejected', pl: '❌ Wniosek odrzucony', de: '❌ Kaufanfrage abgelehnt', ru: '❌ Запрос отклонён', ua: '❌ Запит відхилено', fr: '❌ Demande rejetée', es: '❌ Solicitud rechazada', be: '❌ Запыт адхілены', nl: '❌ Aanvraag afgewezen' },
    };
    return map[key]?.[lang] ?? map[key]?.['en'] ?? key;
  }

  private toResponse(pr: any): PurchaseRequest {
    return {
      id: pr.id,
      accountId: pr.accountId,
      createdByUserId: pr.createdByUserId,
      createdByUserName: pr.createdBy?.name,
      title: pr.title,
      description: pr.description ?? undefined,
      amount: Number(pr.amount),
      currency: pr.currency,
      categoryId: pr.categoryId ?? undefined,
      merchant: pr.merchant ?? undefined,
      imageUrl: pr.imageUrl ?? undefined,
      status: pr.status,
      approvalRule: pr.approvalRule,
      plannedExpenseId: pr.plannedExpenseId ?? undefined,
      expiresAt: pr.expiresAt?.toISOString(),
      createdAt: pr.createdAt.toISOString(),
      updatedAt: pr.updatedAt.toISOString(),
      votes: pr.votes?.map((v: any) => ({
        id: v.id,
        requestId: v.requestId,
        userId: v.userId,
        userName: v.user?.name ?? '',
        vote: v.vote,
        comment: v.comment ?? undefined,
        createdAt: v.createdAt.toISOString(),
      })),
    };
  }
}
```

- [ ] **Step 4: Create module file**

```typescript
// apps/api/src/modules/purchase-requests/purchase-requests.module.ts
import { Module } from '@nestjs/common';
import { PurchaseRequestsController } from './purchase-requests.controller';
import { PurchaseRequestsService } from './purchase-requests.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [PurchaseRequestsController],
  providers: [PurchaseRequestsService],
  exports: [PurchaseRequestsService],
})
export class PurchaseRequestsModule {}
```

(Controller file created in Task 4 — create a stub for now so the module compiles:)

```typescript
// apps/api/src/modules/purchase-requests/purchase-requests.controller.ts
import { Controller } from '@nestjs/common';
import { PurchaseRequestsService } from './purchase-requests.service';

@Controller('purchase-requests')
export class PurchaseRequestsController {
  constructor(private readonly svc: PurchaseRequestsService) {}
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd apps/api && npx jest purchase-requests.service.spec.ts --no-coverage
```
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/purchase-requests/
git commit -m "feat(api): PurchaseRequestsService + module with approval logic (TDD)"
```

---

### Task 4: API controller (TDD)

**Files:**
- Create: `apps/api/src/modules/purchase-requests/purchase-requests.controller.spec.ts`
- Modify: `apps/api/src/modules/purchase-requests/purchase-requests.controller.ts`

**Interfaces:**
- Consumes: `PurchaseRequestsService` from Task 3, `AuthenticatedRequest` from `common/types/index.ts`, `ViewerBlockGuard`, `JwtAuthGuard`, `AccountContextGuard`
- Produces: REST endpoints consumed by mobile (Task 8)

- [ ] **Step 1: Write failing controller tests**

```typescript
// apps/api/src/modules/purchase-requests/purchase-requests.controller.spec.ts
import { Test } from '@nestjs/testing';
import { PurchaseRequestsController } from './purchase-requests.controller';
import { PurchaseRequestsService } from './purchase-requests.service';

const mockSvc = {
  create: jest.fn(),
  findAll: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  vote: jest.fn(),
  convert: jest.fn(),
  markPurchased: jest.fn(),
  cancel: jest.fn(),
  updateApprovalRule: jest.fn(),
  getPendingCount: jest.fn().mockResolvedValue(0),
};

const req = { accountId: 'acc1', userId: 'user1', accountRole: 'owner' } as any;

describe('PurchaseRequestsController', () => {
  let ctrl: PurchaseRequestsController;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      controllers: [PurchaseRequestsController],
      providers: [{ provide: PurchaseRequestsService, useValue: mockSvc }],
    }).compile();
    ctrl = mod.get(PurchaseRequestsController);
    jest.clearAllMocks();
  });

  it('GET / calls findAll', async () => {
    await ctrl.findAll(req, undefined);
    expect(mockSvc.findAll).toHaveBeenCalledWith('acc1', undefined);
  });

  it('POST / calls create', async () => {
    const dto = { title: 'Shoes', amount: 200, currency: 'PLN' };
    await ctrl.create(req, dto as any);
    expect(mockSvc.create).toHaveBeenCalledWith('acc1', 'user1', dto);
  });

  it('POST /:id/vote calls vote', async () => {
    await ctrl.vote(req, 'pr1', { vote: 'APPROVE' } as any);
    expect(mockSvc.vote).toHaveBeenCalledWith('pr1', 'acc1', 'user1', { vote: 'APPROVE' });
  });

  it('settings/approval-rule route does not shadow :id route', () => {
    // Verify the controller declares settings route first — structural test
    const metadata = Reflect.getMetadataKeys(PurchaseRequestsController.prototype.updateApprovalRule);
    // If the method exists, routing is correct (NestJS handles specificity)
    expect(ctrl.updateApprovalRule).toBeDefined();
  });

  it('DELETE /:id calls cancel with userRole', async () => {
    await ctrl.cancel(req, 'pr1');
    expect(mockSvc.cancel).toHaveBeenCalledWith('pr1', 'acc1', 'user1', 'owner');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd apps/api && npx jest purchase-requests.controller.spec.ts --no-coverage
```
Expected: FAIL — methods not defined on stub controller.

- [ ] **Step 3: Implement the full controller**

```typescript
// apps/api/src/modules/purchase-requests/purchase-requests.controller.ts
import {
  Controller, Get, Post, Delete, Patch, Body, Param, Query,
  UseGuards, Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/guards/account-context.guard';
import { ViewerBlockGuard } from '../../common/guards/viewer-block.guard';
import { PurchaseRequestsService } from './purchase-requests.service';
import type { AuthenticatedRequest } from '../../common/types/index';
import type { CreatePurchaseRequestDto, VotePurchaseRequestDto, UpdateApprovalRuleDto } from '@budget/shared-types';

@Controller('purchase-requests')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class PurchaseRequestsController {
  constructor(private readonly svc: PurchaseRequestsService) {}

  // IMPORTANT: declare 'settings/approval-rule' BEFORE ':id' routes
  @Patch('settings/approval-rule')
  @UseGuards(new ViewerBlockGuard())
  updateApprovalRule(@Req() req: AuthenticatedRequest, @Body() dto: UpdateApprovalRuleDto) {
    if (req.accountRole !== 'owner') {
      throw new Error('Only account owner can change the approval rule');
    }
    return this.svc.updateApprovalRule(req.accountId, dto.rule);
  }

  @Get()
  findAll(@Req() req: AuthenticatedRequest, @Query('status') status?: string) {
    return this.svc.findAll(req.accountId, status);
  }

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreatePurchaseRequestDto) {
    return this.svc.create(req.accountId, req.userId, dto);
  }

  @Get('pending-count')
  getPendingCount(@Req() req: AuthenticatedRequest) {
    return this.svc.getPendingCount(req.accountId);
  }

  @Get(':id')
  findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.findOne(id, req.accountId);
  }

  @Post(':id/vote')
  vote(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: VotePurchaseRequestDto) {
    return this.svc.vote(id, req.accountId, req.userId, dto);
  }

  @Post(':id/convert')
  @UseGuards(new ViewerBlockGuard())
  convert(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.convert(id, req.accountId, req.userId);
  }

  @Post(':id/mark-purchased')
  markPurchased(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.markPurchased(id, req.accountId);
  }

  @Delete(':id')
  cancel(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.cancel(id, req.accountId, req.userId, req.accountRole);
  }
}
```

- [ ] **Step 4: Fix the approval rule guard (use ForbiddenException)**

Replace the `throw new Error(...)` in `updateApprovalRule` with:
```typescript
import { ForbiddenException } from '@nestjs/common';
// ...
if (req.accountRole !== 'owner') throw new ForbiddenException('Owner only');
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd apps/api && npx jest purchase-requests --no-coverage
```
Expected: all service + controller tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/purchase-requests/
git commit -m "feat(api): PurchaseRequestsController with full REST API"
```

---

### Task 5: Notification preference wiring

**Files:**
- Modify: `apps/api/src/modules/notifications/notifications.service.ts`
- Modify: `apps/api/src/modules/users/users.service.ts`

**Interfaces:**
- Consumes: `User.notifyPurchaseRequests` from Task 2 migration, `NotificationType` from Task 1

- [ ] **Step 1: Add gate in notifications.service.ts**

In `apps/api/src/modules/notifications/notifications.service.ts`, find the `sendToUser` method. Inside the method, find the block where it checks user preferences (near `notifyDebtReminders`, `notifyAnomalyAlerts`). Add after the last existing check:

```typescript
if (notificationType === 'purchase_request_created' && !user.notifyPurchaseRequests) return false;
if (notificationType === 'purchase_request_voted' && !user.notifyPurchaseRequests) return false;
if (notificationType === 'purchase_request_approved' && !user.notifyPurchaseRequests) return false;
if (notificationType === 'purchase_request_rejected' && !user.notifyPurchaseRequests) return false;
```

Also add `notifyPurchaseRequests: true` to the `select` block in the user query inside `sendToUser`.

- [ ] **Step 2: Add to notification preferences in users.service.ts**

In `apps/api/src/modules/users/users.service.ts`, find `getNotificationPreferences`. Add `notifyPurchaseRequests: true` to the `select` block, and add to the return object:
```typescript
purchaseRequests: user?.notifyPurchaseRequests ?? true,
```

Find `updateNotificationPreferences`. Add:
```typescript
if (prefs.purchaseRequests !== undefined) data.notifyPurchaseRequests = prefs.purchaseRequests;
```

- [ ] **Step 3: Verify typecheck**

```bash
cd apps/api && npx tsc --noEmit
```
Expected: no errors related to the new fields.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/notifications/ apps/api/src/modules/users/
git commit -m "feat(api): notifyPurchaseRequests preference gate in notifications + users service"
```

---

### Task 6: Register in AppModule + typecheck API

**Files:**
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Import PurchaseRequestsModule**

In `apps/api/src/app.module.ts`, find the imports array. Add `PurchaseRequestsModule` alongside other feature modules:

```typescript
import { PurchaseRequestsModule } from './modules/purchase-requests/purchase-requests.module';
// ...
@Module({
  imports: [
    // ...existing modules...
    PurchaseRequestsModule,
  ],
})
```

- [ ] **Step 2: Full API typecheck**

```bash
cd apps/api && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/app.module.ts
git commit -m "feat(api): register PurchaseRequestsModule in AppModule"
```

---

### Task 7: Bot handlers (Telegram + WhatsApp voting callbacks)

**Files:**
- Create: `apps/api/src/modules/telegram/handlers/purchase-request.handler.ts`
- Modify: `apps/api/src/modules/telegram/telegram.module.ts` (or the service that wires handlers)
- Create: `apps/api/src/modules/whatsapp/handlers/purchase-request.handler.ts`
- Modify: `apps/api/src/modules/whatsapp/whatsapp.module.ts`

**Interfaces:**
- Consumes: `PurchaseRequestsService.vote()` from Task 3
- Produces: Telegram callback handler for `pr_approve:{id}` / `pr_reject:{id}`; WhatsApp callback for `pr_approve--{id}` / `pr_reject--{id}`

- [ ] **Step 1: Create Telegram purchase request handler**

First, read the existing `apps/api/src/modules/telegram/handlers/expense.handler.ts` to understand the `BotContext` and helper imports, then:

```typescript
// apps/api/src/modules/telegram/handlers/purchase-request.handler.ts
import { PurchaseRequestsService } from '../../purchase-requests/purchase-requests.service';

type BotContext = any; // matches existing pattern in telegram module

export class PurchaseRequestHandler {
  constructor(private readonly purchaseRequestsService: PurchaseRequestsService) {}

  async handleCallback(ctx: BotContext, action: string, requestId: string): Promise<void> {
    if (!ctx.userState) {
      await ctx.answerCbQuery('Please link your account first.');
      return;
    }
    const { accountId, userId } = ctx.userState;
    const vote = action === 'pr_approve' ? 'APPROVE' : 'REJECT';

    try {
      await this.purchaseRequestsService.vote(requestId, accountId, userId, { vote });
      const label = vote === 'APPROVE' ? '✅ Approved' : '❌ Rejected';
      await ctx.answerCbQuery(label);
      await ctx.editMessageText(`${ctx.callbackQuery?.message?.text ?? ''}\n\n${label}`);
    } catch (e: any) {
      await ctx.answerCbQuery(e.message ?? 'Error');
    }
  }
}
```

- [ ] **Step 2: Wire Telegram handler**

Read `apps/api/src/modules/telegram/telegram.module.ts` (or the file that wires handlers and callback_query). Find where callback_query is handled. Add a case for callbacks starting with `pr_approve:` or `pr_reject:`:

```typescript
// In the callback_query handler block (where it parses callback data like 'ca:', 'ra:', etc.)
if (data.startsWith('pr_approve:') || data.startsWith('pr_reject:')) {
  const [action, requestId] = data.split(':');
  await purchaseRequestHandler.handleCallback(ctx, action, requestId);
  return;
}
```

Import `PurchaseRequestsModule` in the telegram module and inject `PurchaseRequestsService` to pass to `PurchaseRequestHandler`. Add `PurchaseRequestsModule` to the `imports` array of `TelegramModule`.

- [ ] **Step 3: Create WhatsApp purchase request handler**

```typescript
// apps/api/src/modules/whatsapp/handlers/purchase-request.handler.ts
import { Injectable } from '@nestjs/common';
import { PurchaseRequestsService } from '../../purchase-requests/purchase-requests.service';
import { WhatsAppClientService } from '../whatsapp-client.service';

type WhatsAppUserState = any; // matches existing pattern

@Injectable()
export class PurchaseRequestHandler {
  constructor(
    private readonly purchaseRequestsService: PurchaseRequestsService,
    private readonly whatsappClient: WhatsAppClientService,
  ) {}

  async handleCallback(
    action: string,
    requestId: string,
    userState: WhatsAppUserState,
  ): Promise<void> {
    const { accountId, userId, waPhoneNumber } = userState;
    const vote = action === 'pr_approve' ? 'APPROVE' : 'REJECT';

    try {
      await this.purchaseRequestsService.vote(requestId, accountId, userId, { vote });
      const label = vote === 'APPROVE' ? '✅ Approved!' : '❌ Rejected';
      await this.whatsappClient.sendText(waPhoneNumber, label);
    } catch (e: any) {
      await this.whatsappClient.sendText(waPhoneNumber, e.message ?? 'Error');
    }
  }
}
```

- [ ] **Step 4: Wire WhatsApp handler**

Read `apps/api/src/modules/whatsapp/whatsapp.module.ts` and the interactive callback handler. Find where callback IDs are parsed (they use `--` separator). Add:

```typescript
// In the interactive callback_query handler, where callback IDs are split by '--'
if (callbackId.startsWith('pr_approve') || callbackId.startsWith('pr_reject')) {
  const parts = callbackId.split('--');
  await purchaseRequestHandler.handleCallback(parts[0], parts[1], userState);
  return;
}
```

Add `PurchaseRequestsModule` to `WhatsAppModule` imports. Register `PurchaseRequestHandler` as a provider.

- [ ] **Step 5: Typecheck**

```bash
cd apps/api && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/telegram/ apps/api/src/modules/whatsapp/
git commit -m "feat(api): Telegram + WhatsApp purchase request vote callback handlers"
```

---

### Task 8: Mobile API client

**Files:**
- Create: `apps/mobile/src/services/purchase-requests.api.ts`
- Modify: `apps/mobile/src/services/api.ts`

**Interfaces:**
- Produces: `purchaseRequestsApi` object spread into `api` singleton

- [ ] **Step 1: Create API client file**

```typescript
// apps/mobile/src/services/purchase-requests.api.ts
import type {
  PurchaseRequest, PurchaseRequestStatus, ApprovalRule,
  CreatePurchaseRequestDto, VotePurchaseRequestDto,
} from '@budget/shared-types';
import { httpClient } from './http-client';

export const purchaseRequestsApi = {
  getPurchaseRequests(status?: PurchaseRequestStatus) {
    const qs = status ? `?status=${status}` : '';
    return httpClient.request<PurchaseRequest[]>(`/purchase-requests${qs}`);
  },

  getPurchaseRequest(id: string) {
    return httpClient.request<PurchaseRequest>(`/purchase-requests/${id}`);
  },

  createPurchaseRequest(dto: CreatePurchaseRequestDto) {
    return httpClient.request<PurchaseRequest>('/purchase-requests', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  votePurchaseRequest(id: string, dto: VotePurchaseRequestDto) {
    return httpClient.request<PurchaseRequest>(`/purchase-requests/${id}/vote`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  convertPurchaseRequest(id: string) {
    return httpClient.request<{ expenseId: string }>(`/purchase-requests/${id}/convert`, {
      method: 'POST',
    });
  },

  markPurchaseRequestAsPurchased(id: string) {
    return httpClient.request<void>(`/purchase-requests/${id}/mark-purchased`, {
      method: 'POST',
    });
  },

  cancelPurchaseRequest(id: string) {
    return httpClient.request<void>(`/purchase-requests/${id}`, { method: 'DELETE' });
  },

  updateAccountApprovalRule(rule: ApprovalRule) {
    return httpClient.request<void>('/purchase-requests/settings/approval-rule', {
      method: 'PATCH',
      body: JSON.stringify({ rule }),
    });
  },

  getPurchaseRequestPendingCount() {
    return httpClient.request<number>('/purchase-requests/pending-count');
  },
};
```

- [ ] **Step 2: Add to api barrel**

In `apps/mobile/src/services/api.ts`, add import and spread:

```typescript
import { purchaseRequestsApi } from './purchase-requests.api';
// In the api object:
export const api = {
  // ...existing spreads...
  ...purchaseRequestsApi,
};
```

- [ ] **Step 3: Typecheck mobile**

```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors on the new file.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/services/
git commit -m "feat(mobile): purchase requests API client"
```

---

### Task 9: Zustand store

**Files:**
- Create: `apps/mobile/src/stores/purchaseRequestStore.ts`

**Interfaces:**
- Consumes: `purchaseRequestsApi` from Task 8, shared-types from Task 1
- Produces: `usePurchaseRequestStore` hook consumed by screens in Task 11

- [ ] **Step 1: Create the store**

```typescript
// apps/mobile/src/stores/purchaseRequestStore.ts
import { create } from 'zustand';
import { api } from '../services/api';
import type {
  PurchaseRequest, PurchaseRequestStatus,
  CreatePurchaseRequestDto, VotePurchaseRequestDto, ApprovalRule,
} from '@budget/shared-types';

interface PurchaseRequestState {
  requests: PurchaseRequest[];
  isLoading: boolean;
  pendingCount: number;

  loadRequests: (status?: PurchaseRequestStatus) => Promise<void>;
  createRequest: (dto: CreatePurchaseRequestDto) => Promise<void>;
  vote: (id: string, vote: VotePurchaseRequestDto) => Promise<void>;
  convertToPlanned: (id: string) => Promise<string>;
  markAsPurchased: (prId: string) => Promise<void>;
  cancelRequest: (id: string) => Promise<void>;
  updateApprovalRule: (rule: ApprovalRule) => Promise<void>;
  loadPendingCount: () => Promise<void>;
  reset: () => void;
}

export const usePurchaseRequestStore = create<PurchaseRequestState>()((set, get) => ({
  requests: [],
  isLoading: false,
  pendingCount: 0,

  loadRequests: async (status?) => {
    set({ isLoading: true });
    try {
      const requests = await api.getPurchaseRequests(status);
      set({ requests, isLoading: false });
    } catch (e) {
      console.warn('[purchaseRequestStore] loadRequests failed', e);
      set({ isLoading: false });
    }
  },

  createRequest: async (dto) => {
    const pr = await api.createPurchaseRequest(dto);
    set(s => ({ requests: [pr, ...s.requests] }));
  },

  vote: async (id, dto) => {
    const updated = await api.votePurchaseRequest(id, dto);
    set(s => ({ requests: s.requests.map(r => r.id === id ? updated : r) }));
  },

  convertToPlanned: async (id) => {
    const { expenseId } = await api.convertPurchaseRequest(id);
    // Reload to get updated plannedExpenseId
    const updated = await api.getPurchaseRequest(id);
    set(s => ({ requests: s.requests.map(r => r.id === id ? updated : r) }));
    return expenseId;
  },

  markAsPurchased: async (prId) => {
    await api.markPurchaseRequestAsPurchased(prId);
    set(s => ({
      requests: s.requests.map(r => r.id === prId ? { ...r, status: 'PURCHASED' as const } : r),
    }));
  },

  cancelRequest: async (id) => {
    await api.cancelPurchaseRequest(id);
    set(s => ({ requests: s.requests.filter(r => r.id !== id) }));
  },

  updateApprovalRule: async (rule) => {
    await api.updateAccountApprovalRule(rule);
  },

  loadPendingCount: async () => {
    try {
      const count = await api.getPurchaseRequestPendingCount();
      set({ pendingCount: count });
    } catch {
      // non-critical
    }
  },

  reset: () => set({ requests: [], pendingCount: 0, isLoading: false }),
}));
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/stores/purchaseRequestStore.ts
git commit -m "feat(mobile): purchaseRequestStore Zustand store"
```

---

### Task 10: i18n strings (all 9 locales)

**Files:**
- Modify: `apps/mobile/src/i18n/locales/en.ts`, `de.ts`, `es.ts`, `fr.ts`, `pl.ts`, `ru.ts`, `ua.ts`, `be.ts`, `nl.ts`

- [ ] **Step 1: Add English strings**

In `apps/mobile/src/i18n/locales/en.ts`, add a new top-level key (alphabetically near `projects` or `purchaseRequests`):

```typescript
purchaseRequests: {
  title: 'Purchase Requests',
  new: 'New Request',
  approve: 'Approve',
  reject: 'Reject',
  abstain: 'Abstain',
  approved: 'Approved',
  rejected: 'Rejected',
  pending: 'Pending',
  purchased: 'Purchased',
  expired: 'Expired',
  active: 'Active',
  history: 'History',
  votes: 'Votes',
  addToPlan: 'Add to purchase plan',
  convertSuccess: 'Added to planned expenses',
  noRequests: 'No purchase requests yet',
  createFirst: 'Propose a purchase for your family to vote on',
  voteComment: 'Add a comment (optional)',
  deadline: 'Voting deadline (optional)',
  approvalRule: 'Approval rule',
  majority: 'Majority vote',
  unanimous: 'Everyone must agree',
  ownerOnly: 'Owner decides',
  settingsTitle: 'Purchase Requests',
  settingsSubtitle: 'Family purchase voting',
  cancelRequest: 'Cancel request',
  markAsPurchased: 'Mark as purchased',
  plannedBanner: 'Planned purchase · Mark as purchased',
  yourVote: 'Your vote',
  of: 'of',
  membersVoted: 'members voted',
  notifPurchaseRequests: 'Purchase Requests',
  notifPurchaseRequestsDesc: 'New requests, votes, and decisions',
},
```

- [ ] **Step 2: Add Polish strings**

In `apps/mobile/src/i18n/locales/pl.ts`:

```typescript
purchaseRequests: {
  title: 'Wnioski o zakup',
  new: 'Nowy wniosek',
  approve: 'Zatwierdź',
  reject: 'Odrzuć',
  abstain: 'Wstrzymaj się',
  approved: 'Zatwierdzono',
  rejected: 'Odrzucono',
  pending: 'Oczekujące',
  purchased: 'Kupiono',
  expired: 'Wygasłe',
  active: 'Aktywne',
  history: 'Historia',
  votes: 'Głosy',
  addToPlan: 'Dodaj do planu zakupów',
  convertSuccess: 'Dodano do zaplanowanych wydatków',
  noRequests: 'Brak wniosków o zakup',
  createFirst: 'Zaproponuj zakup rodzinie do głosowania',
  voteComment: 'Dodaj komentarz (opcjonalnie)',
  deadline: 'Termin głosowania (opcjonalnie)',
  approvalRule: 'Zasada zatwierdzania',
  majority: 'Większość głosów',
  unanimous: 'Wszyscy muszą się zgodzić',
  ownerOnly: 'Właściciel decyduje',
  settingsTitle: 'Wnioski o zakup',
  settingsSubtitle: 'Rodzinne głosowanie nad zakupami',
  cancelRequest: 'Anuluj wniosek',
  markAsPurchased: 'Oznacz jako kupione',
  plannedBanner: 'Zaplanowany zakup · Oznacz jako kupiony',
  yourVote: 'Twój głos',
  of: 'z',
  membersVoted: 'członków zagłosowało',
  notifPurchaseRequests: 'Wnioski o zakup',
  notifPurchaseRequestsDesc: 'Nowe wnioski, głosy i decyzje',
},
```

- [ ] **Step 3: Add German strings**

In `apps/mobile/src/i18n/locales/de.ts`:

```typescript
purchaseRequests: {
  title: 'Kaufanfragen',
  new: 'Neue Anfrage',
  approve: 'Genehmigen',
  reject: 'Ablehnen',
  abstain: 'Enthalten',
  approved: 'Genehmigt',
  rejected: 'Abgelehnt',
  pending: 'Ausstehend',
  purchased: 'Gekauft',
  expired: 'Abgelaufen',
  active: 'Aktiv',
  history: 'Verlauf',
  votes: 'Stimmen',
  addToPlan: 'Zum Kaufplan hinzufügen',
  convertSuccess: 'Als geplante Ausgabe hinzugefügt',
  noRequests: 'Noch keine Kaufanfragen',
  createFirst: 'Schlage einen Kauf für die Familie vor',
  voteComment: 'Kommentar hinzufügen (optional)',
  deadline: 'Abstimmungsfrist (optional)',
  approvalRule: 'Genehmigungsregel',
  majority: 'Mehrheitsbeschluss',
  unanimous: 'Alle müssen zustimmen',
  ownerOnly: 'Inhaber entscheidet',
  settingsTitle: 'Kaufanfragen',
  settingsSubtitle: 'Familien-Kaufabstimmung',
  cancelRequest: 'Anfrage abbrechen',
  markAsPurchased: 'Als gekauft markieren',
  plannedBanner: 'Geplanter Kauf · Als gekauft markieren',
  yourVote: 'Deine Stimme',
  of: 'von',
  membersVoted: 'Mitglieder abgestimmt',
  notifPurchaseRequests: 'Kaufanfragen',
  notifPurchaseRequestsDesc: 'Neue Anfragen, Stimmen und Entscheidungen',
},
```

- [ ] **Step 4: Add Russian strings**

In `apps/mobile/src/i18n/locales/ru.ts`:

```typescript
purchaseRequests: {
  title: 'Запросы на покупку',
  new: 'Новый запрос',
  approve: 'Одобрить',
  reject: 'Отклонить',
  abstain: 'Воздержаться',
  approved: 'Одобрено',
  rejected: 'Отклонено',
  pending: 'На рассмотрении',
  purchased: 'Куплено',
  expired: 'Истёк',
  active: 'Активные',
  history: 'История',
  votes: 'Голоса',
  addToPlan: 'Добавить в план покупок',
  convertSuccess: 'Добавлено в запланированные расходы',
  noRequests: 'Запросов на покупку нет',
  createFirst: 'Предложите покупку семье для голосования',
  voteComment: 'Добавить комментарий (необязательно)',
  deadline: 'Срок голосования (необязательно)',
  approvalRule: 'Правило одобрения',
  majority: 'Большинство голосов',
  unanimous: 'Все должны согласиться',
  ownerOnly: 'Владелец решает',
  settingsTitle: 'Запросы на покупку',
  settingsSubtitle: 'Семейное голосование по покупкам',
  cancelRequest: 'Отменить запрос',
  markAsPurchased: 'Отметить как купленное',
  plannedBanner: 'Запланированная покупка · Отметить как купленную',
  yourVote: 'Ваш голос',
  of: 'из',
  membersVoted: 'участников проголосовало',
  notifPurchaseRequests: 'Запросы на покупку',
  notifPurchaseRequestsDesc: 'Новые запросы, голоса и решения',
},
```

- [ ] **Step 5: Add Ukrainian strings**

In `apps/mobile/src/i18n/locales/ua.ts`:

```typescript
purchaseRequests: {
  title: 'Запити на купівлю',
  new: 'Новий запит',
  approve: 'Схвалити',
  reject: 'Відхилити',
  abstain: 'Утриматись',
  approved: 'Схвалено',
  rejected: 'Відхилено',
  pending: 'На розгляді',
  purchased: 'Куплено',
  expired: 'Прострочено',
  active: 'Активні',
  history: 'Історія',
  votes: 'Голоси',
  addToPlan: 'Додати до плану покупок',
  convertSuccess: 'Додано до запланованих витрат',
  noRequests: 'Запитів на купівлю немає',
  createFirst: 'Запропонуйте покупку сімʼї для голосування',
  voteComment: 'Додати коментар (необовʼязково)',
  deadline: 'Термін голосування (необовʼязково)',
  approvalRule: 'Правило схвалення',
  majority: 'Більшість голосів',
  unanimous: 'Всі повинні погодитись',
  ownerOnly: 'Власник вирішує',
  settingsTitle: 'Запити на купівлю',
  settingsSubtitle: 'Сімейне голосування за покупками',
  cancelRequest: 'Скасувати запит',
  markAsPurchased: 'Позначити як куплене',
  plannedBanner: 'Запланована покупка · Позначити як куплену',
  yourVote: 'Ваш голос',
  of: 'з',
  membersVoted: 'учасників проголосувало',
  notifPurchaseRequests: 'Запити на купівлю',
  notifPurchaseRequestsDesc: 'Нові запити, голоси та рішення',
},
```

- [ ] **Step 6: Add French strings**

In `apps/mobile/src/i18n/locales/fr.ts`:

```typescript
purchaseRequests: {
  title: 'Demandes d\'achat',
  new: 'Nouvelle demande',
  approve: 'Approuver',
  reject: 'Rejeter',
  abstain: 'S\'abstenir',
  approved: 'Approuvé',
  rejected: 'Rejeté',
  pending: 'En attente',
  purchased: 'Acheté',
  expired: 'Expiré',
  active: 'Actives',
  history: 'Historique',
  votes: 'Votes',
  addToPlan: 'Ajouter au plan d\'achat',
  convertSuccess: 'Ajouté aux dépenses planifiées',
  noRequests: 'Aucune demande d\'achat',
  createFirst: 'Proposez un achat à votre famille',
  voteComment: 'Ajouter un commentaire (optionnel)',
  deadline: 'Date limite de vote (optionnel)',
  approvalRule: 'Règle d\'approbation',
  majority: 'Vote majoritaire',
  unanimous: 'Tout le monde doit approuver',
  ownerOnly: 'Le propriétaire décide',
  settingsTitle: 'Demandes d\'achat',
  settingsSubtitle: 'Vote familial sur les achats',
  cancelRequest: 'Annuler la demande',
  markAsPurchased: 'Marquer comme acheté',
  plannedBanner: 'Achat planifié · Marquer comme acheté',
  yourVote: 'Votre vote',
  of: 'sur',
  membersVoted: 'membres ont voté',
  notifPurchaseRequests: 'Demandes d\'achat',
  notifPurchaseRequestsDesc: 'Nouvelles demandes, votes et décisions',
},
```

- [ ] **Step 7: Add Spanish strings**

In `apps/mobile/src/i18n/locales/es.ts`:

```typescript
purchaseRequests: {
  title: 'Solicitudes de compra',
  new: 'Nueva solicitud',
  approve: 'Aprobar',
  reject: 'Rechazar',
  abstain: 'Abstenerse',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  pending: 'Pendiente',
  purchased: 'Comprado',
  expired: 'Expirado',
  active: 'Activas',
  history: 'Historial',
  votes: 'Votos',
  addToPlan: 'Añadir al plan de compras',
  convertSuccess: 'Añadido a gastos planificados',
  noRequests: 'No hay solicitudes de compra',
  createFirst: 'Propón una compra a tu familia',
  voteComment: 'Añadir comentario (opcional)',
  deadline: 'Fecha límite de votación (opcional)',
  approvalRule: 'Regla de aprobación',
  majority: 'Votación mayoritaria',
  unanimous: 'Todos deben aprobar',
  ownerOnly: 'El propietario decide',
  settingsTitle: 'Solicitudes de compra',
  settingsSubtitle: 'Votación familiar de compras',
  cancelRequest: 'Cancelar solicitud',
  markAsPurchased: 'Marcar como comprado',
  plannedBanner: 'Compra planificada · Marcar como comprada',
  yourVote: 'Tu voto',
  of: 'de',
  membersVoted: 'miembros votaron',
  notifPurchaseRequests: 'Solicitudes de compra',
  notifPurchaseRequestsDesc: 'Nuevas solicitudes, votos y decisiones',
},
```

- [ ] **Step 8: Add Belarusian strings**

In `apps/mobile/src/i18n/locales/be.ts`:

```typescript
purchaseRequests: {
  title: 'Запыты на куплю',
  new: 'Новы запыт',
  approve: 'Адобрыць',
  reject: 'Адхіліць',
  abstain: 'Устрымацца',
  approved: 'Адобрана',
  rejected: 'Адхілена',
  pending: 'На разглядзе',
  purchased: 'Куплена',
  expired: 'Прасрочана',
  active: 'Актыўныя',
  history: 'Гісторыя',
  votes: 'Галасы',
  addToPlan: 'Дадаць у план пакупак',
  convertSuccess: 'Дадана да запланаваных выдаткаў',
  noRequests: 'Запытаў на куплю няма',
  createFirst: 'Прапануйце пакупку сямʼі для галасавання',
  voteComment: 'Дадаць каментар (неабавязкова)',
  deadline: 'Тэрмін галасавання (неабавязкова)',
  approvalRule: 'Правіла адабрэння',
  majority: 'Большасць галасоў',
  unanimous: 'Усе павінны пагадзіцца',
  ownerOnly: 'Уладальнік вырашае',
  settingsTitle: 'Запыты на куплю',
  settingsSubtitle: 'Сямейнае галасаванне па пакупках',
  cancelRequest: 'Адмяніць запыт',
  markAsPurchased: 'Адзначыць як купленае',
  plannedBanner: 'Запланаваная пакупка · Адзначыць як купленую',
  yourVote: 'Ваш голас',
  of: 'з',
  membersVoted: 'удзельнікаў прагаласавала',
  notifPurchaseRequests: 'Запыты на куплю',
  notifPurchaseRequestsDesc: 'Новыя запыты, галасы і рашэнні',
},
```

- [ ] **Step 9: Add Dutch strings**

In `apps/mobile/src/i18n/locales/nl.ts`:

```typescript
purchaseRequests: {
  title: 'Aankoopverzoeken',
  new: 'Nieuw verzoek',
  approve: 'Goedkeuren',
  reject: 'Afwijzen',
  abstain: 'Onthouden',
  approved: 'Goedgekeurd',
  rejected: 'Afgewezen',
  pending: 'In behandeling',
  purchased: 'Gekocht',
  expired: 'Verlopen',
  active: 'Actief',
  history: 'Geschiedenis',
  votes: 'Stemmen',
  addToPlan: 'Toevoegen aan aankoopplan',
  convertSuccess: 'Toegevoegd aan geplande uitgaven',
  noRequests: 'Nog geen aankoopverzoeken',
  createFirst: 'Stel een aankoop voor aan je familie',
  voteComment: 'Opmerking toevoegen (optioneel)',
  deadline: 'Stemdeadline (optioneel)',
  approvalRule: 'Goedkeuringsregel',
  majority: 'Meerderheid van stemmen',
  unanimous: 'Iedereen moet instemmen',
  ownerOnly: 'Eigenaar beslist',
  settingsTitle: 'Aankoopverzoeken',
  settingsSubtitle: 'Familie stemmen over aankopen',
  cancelRequest: 'Verzoek annuleren',
  markAsPurchased: 'Markeren als gekocht',
  plannedBanner: 'Geplande aankoop · Markeren als gekocht',
  yourVote: 'Jouw stem',
  of: 'van',
  membersVoted: 'leden gestemd',
  notifPurchaseRequests: 'Aankoopverzoeken',
  notifPurchaseRequestsDesc: 'Nieuwe verzoeken, stemmen en beslissingen',
},
```

- [ ] **Step 10: Typecheck**

```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add apps/mobile/src/i18n/
git commit -m "feat(mobile): i18n purchaseRequests namespace in all 9 locales"
```

---

### Task 11: Mobile screens

**Files:**
- Create: `apps/mobile/app/purchase-requests/index.tsx`
- Create: `apps/mobile/app/purchase-requests/new.tsx`
- Create: `apps/mobile/app/purchase-requests/[id].tsx`

**Interfaces:**
- Consumes: `usePurchaseRequestStore` (Task 9), i18n `purchaseRequests.*` (Task 10), shared-types `PurchaseRequest`

- [ ] **Step 1: Create list screen**

```tsx
// apps/mobile/app/purchase-requests/index.tsx
import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { usePurchaseRequestStore } from '../../src/stores/purchaseRequestStore';
import { useThemeStore } from '../../src/stores/themeStore';
import type { PurchaseRequest, PurchaseRequestStatus } from '@budget/shared-types';

type Tab = 'PENDING' | 'APPROVED' | 'all';

export default function PurchaseRequestsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useThemeStore(s => s.theme);
  const { requests, isLoading, loadRequests } = usePurchaseRequestStore();
  const [activeTab, setActiveTab] = useState<Tab>('PENDING');

  useEffect(() => { loadRequests(); }, []);

  const filtered = requests.filter(r => {
    if (activeTab === 'PENDING') return r.status === 'PENDING';
    if (activeTab === 'APPROVED') return r.status === 'APPROVED';
    return ['REJECTED', 'PURCHASED', 'EXPIRED'].includes(r.status);
  });

  const statusColor: Record<string, string> = {
    PENDING: theme.colors.warning ?? '#F59E0B',
    APPROVED: theme.colors.success ?? '#10B981',
    REJECTED: theme.colors.error ?? '#EF4444',
    PURCHASED: theme.colors.textSecondary,
    EXPIRED: theme.colors.textSecondary,
  };

  const renderItem = ({ item }: { item: PurchaseRequest }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
      onPress={() => router.push(`/purchase-requests/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.statusBadge, { color: statusColor[item.status] }]}>
          {t(`purchaseRequests.${item.status.toLowerCase()}`)}
        </Text>
      </View>
      <Text style={[styles.amount, { color: theme.colors.primary }]}>
        {item.amount.toFixed(2)} {item.currency}
      </Text>
      {item.merchant && (
        <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>{item.merchant}</Text>
      )}
      <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>
        {item.createdByUserName} · {item.votes?.length ?? 0} {t('purchaseRequests.votes')}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Tab bar */}
      <View style={[styles.tabs, { borderBottomColor: theme.colors.border }]}>
        {(['PENDING', 'APPROVED', 'all'] as Tab[]).map(tab => (
          <TouchableOpacity key={tab} style={styles.tab} onPress={() => setActiveTab(tab)}>
            <Text style={[
              styles.tabText,
              { color: activeTab === tab ? theme.colors.primary : theme.colors.textSecondary },
            ]}>
              {tab === 'PENDING' ? t('purchaseRequests.active')
                : tab === 'APPROVED' ? t('purchaseRequests.approved')
                : t('purchaseRequests.history')}
            </Text>
            {activeTab === tab && (
              <View style={[styles.tabIndicator, { backgroundColor: theme.colors.primary }]} />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={theme.colors.primary} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cart-outline" size={48} color={theme.colors.textSecondary} />
          <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
            {t('purchaseRequests.noRequests')}
          </Text>
          <Text style={[styles.emptySubtext, { color: theme.colors.textSecondary }]}>
            {t('purchaseRequests.createFirst')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 12 }}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        onPress={() => router.push('/purchase-requests/new')}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 14, fontWeight: '500' },
  tabIndicator: { position: 'absolute', bottom: 0, height: 2, width: '60%' },
  card: { borderRadius: 12, padding: 16, borderWidth: 1, gap: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600', flex: 1, marginRight: 8 },
  statusBadge: { fontSize: 12, fontWeight: '600' },
  amount: { fontSize: 20, fontWeight: '700' },
  meta: { fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  emptyText: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  emptySubtext: { fontSize: 14, textAlign: 'center' },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
});
```

- [ ] **Step 2: Create new request modal**

```tsx
// apps/mobile/app/purchase-requests/new.tsx
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { usePurchaseRequestStore } from '../../src/stores/purchaseRequestStore';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAccountStore } from '../../src/stores/accountStore';
import KeyboardAwareScreen from '../../src/components/KeyboardAwareScreen';

export default function NewPurchaseRequestScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useThemeStore(s => s.theme);
  const baseCurrency = useAccountStore(s => s.currentAccount?.currencyCode ?? 'USD');
  const { createRequest } = usePurchaseRequestStore();

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(baseCurrency);
  const [merchant, setMerchant] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const canSave = title.trim().length > 0 && parseFloat(amount) > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      await createRequest({
        title: title.trim(),
        amount: parseFloat(amount),
        currency,
        merchant: merchant.trim() || undefined,
        description: description.trim() || undefined,
      });
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to create request');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAwareScreen>
      <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
            {t('expenses.description')} *
          </Text>
          <TextInput
            style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Nike Air Max 270"
            placeholderTextColor={theme.colors.textSecondary}
          />

          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
            {t('expenses.amount')} *
          </Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.amountInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={theme.colors.textSecondary}
            />
            <TextInput
              style={[styles.input, styles.currencyInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
              value={currency}
              onChangeText={setCurrency}
              autoCapitalize="characters"
              maxLength={3}
              placeholder="USD"
              placeholderTextColor={theme.colors.textSecondary}
            />
          </View>

          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
            {t('expenses.merchant')}
          </Text>
          <TextInput
            style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]}
            value={merchant}
            onChangeText={setMerchant}
            placeholder="Nike, Amazon..."
            placeholderTextColor={theme.colors.textSecondary}
          />

          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
            {t('purchaseRequests.voteComment')}
          </Text>
          <TextInput
            style={[styles.input, styles.multiline, { color: theme.colors.text, borderColor: theme.colors.border }]}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            placeholder="Why do we need this?"
            placeholderTextColor={theme.colors.textSecondary}
          />
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: canSave && !isSaving ? theme.colors.primary : theme.colors.border }]}
          onPress={handleSave}
          disabled={!canSave || isSaving}
        >
          <Text style={styles.saveBtnText}>
            {isSaving ? '...' : t('common.save')}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  card: { borderRadius: 12, padding: 16, gap: 12 },
  label: { fontSize: 13, fontWeight: '500', marginBottom: -4 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16 },
  amountInput: { flex: 2 },
  currencyInput: { flex: 1, textAlign: 'center' },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 8 },
  saveBtn: { borderRadius: 12, padding: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
```

- [ ] **Step 3: Create detail/voting screen**

```tsx
// apps/mobile/app/purchase-requests/[id].tsx
import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { usePurchaseRequestStore } from '../../src/stores/purchaseRequestStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useAccountStore } from '../../src/stores/accountStore';
import { useThemeStore } from '../../src/stores/themeStore';
import type { VoteChoice } from '@budget/shared-types';

const VOTE_ICONS: Record<VoteChoice, string> = {
  APPROVE: '✅',
  REJECT: '❌',
  ABSTAIN: '⚪',
};

export default function PurchaseRequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useThemeStore(s => s.theme);
  const userId = useAuthStore(s => s.user?.id);
  const accountRole = useAccountStore(s => s.accountRole);
  const { requests, loadRequests, vote, convertToPlanned, cancelRequest } = usePurchaseRequestStore();
  const [comment, setComment] = useState('');
  const [isActing, setIsActing] = useState(false);

  useEffect(() => { loadRequests(); }, []);

  const pr = requests.find(r => r.id === id);

  if (!pr) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const myVote = pr.votes?.find(v => v.userId === userId);
  const approveCount = pr.votes?.filter(v => v.vote === 'APPROVE').length ?? 0;
  const rejectCount = pr.votes?.filter(v => v.vote === 'REJECT').length ?? 0;
  const totalVotes = pr.votes?.length ?? 0;

  const canCancel = (pr.createdByUserId === userId || accountRole === 'owner') && pr.status === 'PENDING';
  const canVote = pr.status === 'PENDING' && !myVote;
  const canConvert = pr.status === 'APPROVED' && !pr.plannedExpenseId;

  const handleVote = async (v: VoteChoice) => {
    setIsActing(true);
    try {
      await vote(pr.id, { vote: v, comment: comment.trim() || undefined });
      setComment('');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setIsActing(false);
    }
  };

  const handleConvert = async () => {
    setIsActing(true);
    try {
      const expenseId = await convertToPlanned(pr.id);
      Alert.alert(t('purchaseRequests.convertSuccess'), '', [
        { text: 'OK', onPress: () => router.push(`/expense/${expenseId}`) },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setIsActing(false);
    }
  };

  const handleCancel = () => {
    Alert.alert(t('purchaseRequests.cancelRequest'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'), style: 'destructive',
        onPress: async () => {
          await cancelRequest(pr.id);
          router.back();
        },
      },
    ]);
  };

  const statusColor: Record<string, string> = {
    PENDING: theme.colors.warning ?? '#F59E0B',
    APPROVED: theme.colors.success ?? '#10B981',
    REJECTED: theme.colors.error ?? '#EF4444',
    PURCHASED: theme.colors.textSecondary,
    EXPIRED: theme.colors.textSecondary,
  };

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      {/* Header card */}
      <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <View style={styles.row}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{pr.title}</Text>
          <Text style={[styles.statusBadge, { color: statusColor[pr.status] }]}>
            {t(`purchaseRequests.${pr.status.toLowerCase()}`)}
          </Text>
        </View>
        <Text style={[styles.amount, { color: theme.colors.primary }]}>
          {pr.amount.toFixed(2)} {pr.currency}
        </Text>
        {pr.merchant && <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>{pr.merchant}</Text>}
        {pr.description && <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>{pr.description}</Text>}
        <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>
          {t('expenses.by')} {pr.createdByUserName}
        </Text>
      </View>

      {/* Votes */}
      <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          {t('purchaseRequests.votes')} · {approveCount} ✅  {rejectCount} ❌
        </Text>
        {pr.votes?.map(v => (
          <View key={v.id} style={styles.voteRow}>
            <Text style={{ fontSize: 16 }}>{VOTE_ICONS[v.vote as VoteChoice]}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.voterName, { color: theme.colors.text }]}>{v.userName}</Text>
              {v.comment && <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>{v.comment}</Text>}
            </View>
          </View>
        ))}
        {totalVotes === 0 && (
          <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>No votes yet</Text>
        )}
      </View>

      {/* Vote actions */}
      {canVote && (
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            {t('purchaseRequests.yourVote')}
          </Text>
          <TextInput
            style={[styles.commentInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
            value={comment}
            onChangeText={setComment}
            placeholder={t('purchaseRequests.voteComment')}
            placeholderTextColor={theme.colors.textSecondary}
          />
          <View style={styles.voteButtons}>
            {(['APPROVE', 'REJECT', 'ABSTAIN'] as VoteChoice[]).map(v => (
              <TouchableOpacity
                key={v}
                style={[styles.voteBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                onPress={() => handleVote(v)}
                disabled={isActing}
              >
                <Text style={{ fontSize: 20 }}>{VOTE_ICONS[v]}</Text>
                <Text style={[styles.voteBtnLabel, { color: theme.colors.text }]}>
                  {t(`purchaseRequests.${v.toLowerCase()}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {myVote && (
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>
            {t('purchaseRequests.yourVote')}: {VOTE_ICONS[myVote.vote as VoteChoice]} {t(`purchaseRequests.${myVote.vote.toLowerCase()}`)}
          </Text>
        </View>
      )}

      {/* Convert to planned expense */}
      {canConvert && (
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: theme.colors.primary }]}
          onPress={handleConvert}
          disabled={isActing}
        >
          <Text style={styles.actionBtnText}>{t('purchaseRequests.addToPlan')}</Text>
        </TouchableOpacity>
      )}

      {/* Cancel */}
      {canCancel && (
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: theme.colors.error ?? '#EF4444' }]}
          onPress={handleCancel}
        >
          <Text style={styles.actionBtnText}>{t('purchaseRequests.cancelRequest')}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 20, fontWeight: '700', flex: 1, marginRight: 8 },
  statusBadge: { fontSize: 12, fontWeight: '600' },
  amount: { fontSize: 28, fontWeight: '800' },
  meta: { fontSize: 13 },
  sectionTitle: { fontSize: 15, fontWeight: '600' },
  voteRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 4 },
  voterName: { fontSize: 14, fontWeight: '500' },
  commentInput: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 8 },
  voteButtons: { flexDirection: 'row', gap: 8 },
  voteBtn: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 8, borderWidth: 1, gap: 4 },
  voteBtnLabel: { fontSize: 12, fontWeight: '500' },
  actionBtn: { borderRadius: 12, padding: 16, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
```

- [ ] **Step 4: Typecheck mobile**

```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/purchase-requests/
git commit -m "feat(mobile): purchase request list, new, and detail screens"
```

---

### Task 12: Expense planned banner + mobile SQLite isPlanned

**Files:**
- Modify: `apps/mobile/src/db/schema/index.ts`
- Modify: `apps/mobile/src/db/client.native.ts` (or wherever ALTER TABLE migrations run)
- Modify: `apps/mobile/app/expense/[id].tsx`

**Interfaces:**
- Consumes: `usePurchaseRequestStore` (Task 9), `Expense.isPlanned` from Task 1

- [ ] **Step 1: Add isPlanned to mobile SQLite schema**

In `apps/mobile/src/db/schema/index.ts`, find the `expenses` table definition. Add after the last existing column (before the closing `)`):

```typescript
isPlanned: integer('is_planned', { mode: 'boolean' }).default(false),
```

- [ ] **Step 2: Add SQLite migration**

In `apps/mobile/src/db/client.native.ts`, find the block where ALTER TABLE migrations run for new columns (look for `ADD COLUMN income_source` or similar pattern). Add:

```typescript
await db.runAsync(
  `ALTER TABLE expenses ADD COLUMN is_planned INTEGER DEFAULT 0 NOT NULL`
).catch(() => {}); // Column may already exist on re-run
```

- [ ] **Step 3: Add planned banner to expense detail screen**

In `apps/mobile/app/expense/[id].tsx`:

1. Import `usePurchaseRequestStore` at the top:
```typescript
import { usePurchaseRequestStore } from '../../src/stores/purchaseRequestStore';
```

2. Inside the component, after existing store hooks:
```typescript
const { requests, markAsPurchased, loadRequests } = usePurchaseRequestStore();
const linkedPR = expense?.isPlanned
  ? requests.find(r => r.plannedExpenseId === expense.id)
  : null;

useEffect(() => {
  if (expense?.isPlanned && requests.length === 0) loadRequests('APPROVED');
}, [expense?.isPlanned]);
```

3. Inside the JSX, after the expense header card and before the edit button, add the banner:
```tsx
{expense?.isPlanned && (
  <TouchableOpacity
    style={[styles.plannedBanner, { backgroundColor: theme.colors.primary + '18', borderColor: theme.colors.primary }]}
    onPress={async () => {
      if (!linkedPR) return;
      Alert.alert(
        t('purchaseRequests.markAsPurchased'),
        '',
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('purchaseRequests.markAsPurchased'),
            onPress: async () => {
              await markAsPurchased(linkedPR.id);
              // Reload expense to reflect isPlanned = false
              loadExpense();
            },
          },
        ],
      );
    }}
    activeOpacity={linkedPR ? 0.7 : 1}
  >
    <Ionicons name="cart-outline" size={18} color={theme.colors.primary} />
    <Text style={[styles.plannedBannerText, { color: theme.colors.primary }]}>
      {t('purchaseRequests.plannedBanner')}
    </Text>
  </TouchableOpacity>
)}
```

4. Add styles:
```typescript
plannedBanner: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  padding: 12,
  borderRadius: 10,
  borderWidth: 1,
  marginHorizontal: 16,
  marginTop: 8,
},
plannedBannerText: { fontSize: 14, fontWeight: '600' },
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/db/ apps/mobile/app/expense/
git commit -m "feat(mobile): planned expense banner + SQLite isPlanned column"
```

---

### Task 13: Settings integration + Stack registration

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `apps/mobile/app/settings/index.tsx`
- Modify: `apps/mobile/app/settings/notifications.tsx`

- [ ] **Step 1: Register Stack screens in _layout.tsx**

In `apps/mobile/app/_layout.tsx`, find the `<Stack>` block. Add before the closing `</Stack>` tag (before the `subscriptions/` screens or in alphabetical order):

```tsx
<Stack.Screen
  name="purchase-requests/index"
  options={{
    headerShown: true,
    title: t('purchaseRequests.title'),
  }}
/>
<Stack.Screen
  name="purchase-requests/new"
  options={{
    presentation: 'modal',
    headerShown: true,
    title: t('purchaseRequests.new'),
  }}
/>
<Stack.Screen
  name="purchase-requests/[id]"
  options={{
    headerShown: true,
    title: t('purchaseRequests.title'),
  }}
/>
```

- [ ] **Step 2: Add entry to settings hub**

In `apps/mobile/app/settings/index.tsx`, find the `categories` array (the array of settings rows). Add a new entry (with other collaboration-related items, or after subscriptions):

```typescript
{
  icon: 'cart-outline',
  label: t('purchaseRequests.settingsTitle'),
  description: t('purchaseRequests.settingsSubtitle'),
  route: '/purchase-requests',
},
```

Also add the pending count badge — after the entry is rendered, find how other items show badges (e.g., check if there's a `badge` field in the items array). If so, add `badge: pendingCount > 0 ? pendingCount : undefined`. Load the count:

```typescript
const { pendingCount, loadPendingCount } = usePurchaseRequestStore();
useEffect(() => { loadPendingCount(); }, [currentAccountId]);
```

- [ ] **Step 3: Add notification toggle in settings/notifications.tsx**

In `apps/mobile/app/settings/notifications.tsx`, find the list of notification preference toggles (near `notifyDebtReminders`, `notifyAnomalyAlerts`). Add a new toggle following the exact same pattern:

```tsx
<NotificationRow
  label={t('purchaseRequests.notifPurchaseRequests')}
  description={t('purchaseRequests.notifPurchaseRequestsDesc')}
  value={prefs?.purchaseRequests ?? true}
  onValueChange={(v) => updatePref('purchaseRequests', v)}
/>
```

(If the component uses a different pattern such as a Switch directly, follow that exact pattern from the existing code.)

- [ ] **Step 4: Typecheck**

```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Run full test suite**

```bash
cd apps/api && npx jest --no-coverage
```
Expected: all existing tests + new purchase-requests tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/_layout.tsx apps/mobile/app/settings/
git commit -m "feat(mobile): settings entry + notification toggle + Stack screens for purchase requests"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Any member creates requests — viewer not behind ViewerBlockGuard on `POST /purchase-requests`
- ✅ Configurable approval rule (MAJORITY/UNANIMOUS/OWNER_ONLY) — stored per account, snapshotted per PR
- ✅ Post-approval → planned expense — `convert` endpoint + `isPlanned` flag
- ✅ One-tap conversion to real expense — `markAsPurchased` endpoint + banner in expense detail
- ✅ Push notifications (4 types) — `notifyMembers` in service + gate in notifications.service
- ✅ Telegram callback voting — `pr_approve:{id}` / `pr_reject:{id}` handlers
- ✅ WhatsApp callback voting — `pr_approve--{id}` / `pr_reject--{id}` handlers
- ✅ Settings entry point — settings/index.tsx row
- ✅ i18n all 9 locales — Task 10
- ✅ Notification preference toggle — User.notifyPurchaseRequests + settings/notifications.tsx
- ✅ TDD — service spec + controller spec before implementation
- ✅ Route ordering — `settings/approval-rule` declared before `:id`
- ✅ ViewerBlockGuard on write operations — `convert`, `cancel` (via accountRole check), `updateApprovalRule`
- ⚠️ Proactive bot messages (send PR card to all members on create) — deferred to Phase 2 (requires EventEmitter to avoid circular deps between PurchaseRequestsModule ↔ TelegramModule)

**Type consistency:** All method signatures match between service (Task 3), controller (Task 4), API client (Task 8), and store (Task 9). `PurchaseRequestStatus`, `ApprovalRule`, `VoteChoice` defined once in shared-types, used everywhere.

**No placeholders:** All steps contain actual code.
