# Invite Existing User by Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an account owner search for an already-registered user by name/email and invite them directly; the invitee gets a push notification and can accept/decline from a new "My Invitations" tab on the existing Alerts screen.

**Architecture:** `AccountInvitation` gains an optional `invitedUserId` FK (parallel to the existing `invitedEmail`), set when an invitation is created via the new `GET /users/search` endpoint instead of by typing an email. A new user-scoped read (`GET /accounts/invitations/mine`) and write (`PATCH /accounts/invitations/:id/respond`) pair lets the invitee list and act on their pending invitations without needing the account's `X-Account-Id` context (they aren't a member yet). Mobile reuses the existing Alerts screen's shell (bell icon, badge, screen) by adding a second tab backed by a new `invitationStore`, and reuses `account/invite.tsx`'s existing role-picker UI behind a new third "Find user" mode.

**Tech Stack:** NestJS 10 + Prisma 5 (API), Expo 54 + React Native + Zustand (mobile), `@nestjs/throttler` v5 for rate limiting.

## Global Constraints

- `GET /users/search` requires `q` to be at least 2 characters (shorter queries return `[]` without querying the DB) and returns at most 20 results, each `{id, name, email}` only, excluding the requester and deactivated (`isActive: false`) users.
- `GET /users/search` is rate-limited via `@nestjs/throttler`'s `ThrottlerGuard` (this is the *first* route in the codebase to actually apply the guard — `ThrottlerModule` is already configured globally in `app.module.ts` but no route consumes it yet).
- Creating an invitation via `invitedUserId` still requires the caller to hold `owner` role on the target account (same `validateAccess(accountId, userId, 'owner')` check the email path already uses).
- `PATCH /accounts/invitations/:id/respond` must verify the invitation is actually addressed to the responder (`invitedUserId === callerId` OR `invitedEmail === caller's email`) before doing anything.
- The `account_invitation` push notification is **always sent** (no `notifyX` preference gate, unlike every other notification type) — do not add a gating `if` for it in `NotificationsService.sendToUser`.
- All 9 mobile locales (`en`, `de`, `es`, `fr`, `pl`, `ru`, `ua`, `be`, `nl`) must get new i18n keys — never edit only `en.ts`.
- `docs/superpowers/specs/2026-07-03-invite-by-search-design.md` is the approved source of truth for scope; do not add features beyond it (e.g. no notifying the inviter on decline, no preference toggle for this notification type).

---

### Task 1: Shared-types — `invitedUserId` field and `account_invitation` notification type

**Files:**
- Modify: `packages/shared-types/src/entities/account.ts` (the `AccountInvitation` interface, currently lines 30-41)
- Modify: `packages/shared-types/src/dto/account.ts` (the `CreateInvitationDto` interface, currently lines 18-22)
- Modify: `packages/shared-types/src/entities/primitives.ts` (the `NotificationType` union, currently line 27)

**Interfaces:**
- Produces: `AccountInvitation.invitedUserId?: string`, `CreateInvitationDto.invitedUserId?: string`, `NotificationType` including `'account_invitation'` — every later task in this plan reads or writes these exact names.

- [ ] **Step 1: Add `invitedUserId` to the `AccountInvitation` entity**

In `packages/shared-types/src/entities/account.ts`, the interface currently reads:

```typescript
export interface AccountInvitation {
  id: string;
  accountId: string;
  invitedBy: string;
  invitedEmail?: string;
  inviteCode: string;
  role: AccountRole;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedBy?: string;
  createdAt: Date;
}
```

Change it to:

```typescript
export interface AccountInvitation {
  id: string;
  accountId: string;
  invitedBy: string;
  invitedEmail?: string;
  invitedUserId?: string;
  inviteCode: string;
  role: AccountRole;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedBy?: string;
  createdAt: Date;
}
```

- [ ] **Step 2: Add `invitedUserId` to `CreateInvitationDto`**

In `packages/shared-types/src/dto/account.ts`, the interface currently reads:

```typescript
export interface CreateInvitationDto {
  email?: string;
  role?: AccountRole;
  expiresInDays?: number;
}
```

Change it to:

```typescript
export interface CreateInvitationDto {
  email?: string;
  invitedUserId?: string;
  role?: AccountRole;
  expiresInDays?: number;
}
```

- [ ] **Step 3: Add `'account_invitation'` to `NotificationType`**

In `packages/shared-types/src/entities/primitives.ts`, the current line 27 reads:

```typescript
export type NotificationType = 'budget_alert' | 'shared_expense' | 'spending_anomaly' | 'debt_reminder' | 'recurring_expense' | 'chat_mention' | 'subscription_renewal' | 'tracking_gap_reminder' | 'purchase_request_created' | 'purchase_request_voted' | 'purchase_request_approved' | 'purchase_request_rejected' | 'trip_settle_up';
```

Change it to:

```typescript
export type NotificationType = 'budget_alert' | 'shared_expense' | 'spending_anomaly' | 'debt_reminder' | 'recurring_expense' | 'chat_mention' | 'subscription_renewal' | 'tracking_gap_reminder' | 'purchase_request_created' | 'purchase_request_voted' | 'purchase_request_approved' | 'purchase_request_rejected' | 'trip_settle_up' | 'account_invitation';
```

- [ ] **Step 4: Typecheck shared-types**

Run: `cd packages/shared-types && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/entities/account.ts packages/shared-types/src/dto/account.ts packages/shared-types/src/entities/primitives.ts
git commit -m "feat(types): add invitedUserId and account_invitation notification type"
```

---

### Task 2: Prisma schema + migration — `AccountInvitation.invitedUserId`

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (the `AccountInvitation` model, currently lines 321-340)
- Create: migration under `apps/api/prisma/migrations/` (auto-named by Prisma)

**Interfaces:**
- Consumes: nothing from Task 1 (Prisma schema is independent of `packages/shared-types`, per the repo's Dependency Order).
- Produces: `account_invitations.invited_user_id` column, indexed, used by Task 4/5/6's Prisma queries.

- [ ] **Step 1: Add `invitedUserId` field to the Prisma model**

In `apps/api/prisma/schema.prisma`, the `AccountInvitation` model currently reads:

```prisma
model AccountInvitation {
  id           String           @id @default(uuid())
  accountId    String           @map("account_id")
  invitedBy    String           @map("invited_by")
  invitedEmail String?          @map("invited_email")
  inviteCode   String           @unique @map("invite_code")
  role         AccountRole      @default(editor)
  status       InvitationStatus @default(pending)
  expiresAt    DateTime         @map("expires_at")
  acceptedBy   String?          @map("accepted_by")
  createdAt    DateTime         @default(now()) @map("created_at")
  updatedAt    DateTime         @updatedAt @map("updated_at")

  // Relations
  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@index([inviteCode])
  @@index([invitedEmail])
  @@map("account_invitations")
}
```

Change it to (adds `invitedUserId` as a plain field — mirroring `invitedBy`/`acceptedBy`, which are also plain `String`/`String?` columns with no Prisma `@relation` — plus an index for the `GET /accounts/invitations/mine` lookup):

```prisma
model AccountInvitation {
  id            String           @id @default(uuid())
  accountId     String           @map("account_id")
  invitedBy     String           @map("invited_by")
  invitedEmail  String?          @map("invited_email")
  invitedUserId String?          @map("invited_user_id")
  inviteCode    String           @unique @map("invite_code")
  role          AccountRole      @default(editor)
  status        InvitationStatus @default(pending)
  expiresAt     DateTime         @map("expires_at")
  acceptedBy    String?          @map("accepted_by")
  createdAt     DateTime         @default(now()) @map("created_at")
  updatedAt     DateTime         @updatedAt @map("updated_at")

  // Relations
  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@index([inviteCode])
  @@index([invitedEmail])
  @@index([invitedUserId])
  @@map("account_invitations")
}
```

- [ ] **Step 2: Create the migration**

Run from `apps/api/`:

```bash
npx prisma migrate dev --name add_invitation_invited_user_id
```

Expected: a new folder under `apps/api/prisma/migrations/` containing a `migration.sql` with `ALTER TABLE "account_invitations" ADD COLUMN "invited_user_id" TEXT;` and a `CREATE INDEX` statement, and the command exits with "Your database is now in sync with your schema."

- [ ] **Step 3: Regenerate the Prisma client**

Run from `apps/api/`: `npx prisma generate`
Expected: "Generated Prisma Client" with no errors.

- [ ] **Step 4: Typecheck the API**

Run from `apps/api/`: `npx tsc --noEmit`
Expected: no errors (the `invitedUserId` field is not yet referenced anywhere, so this just confirms the schema/client change didn't break anything).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(db): add AccountInvitation.invitedUserId column"
```

---

### Task 3: `GET /users/search` endpoint

**Files:**
- Modify: `apps/api/src/modules/users/users.service.ts` (add a `search` method)
- Modify: `apps/api/src/modules/users/users.controller.ts` (add a `GET search` route)
- Test: `apps/api/src/modules/users/users.service.spec.ts` (add a `describe('search', ...)` block)

**Interfaces:**
- Consumes: `this.prisma.user.findMany` (Prisma, already used elsewhere in this service).
- Produces: `UsersService.search(callerId: string, query: string): Promise<{id: string; name: string; email: string}[]>` — consumed by nothing else in this plan (it's a leaf endpoint), but its shape (`{id, name, email}[]`) is what Task 7's mobile `searchUsers` client method and Task 11's search UI expect.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/users/users.service.spec.ts` if it doesn't already have a `search` block — it already exists from prior work (notification preferences tests). Add this new `describe` block anywhere at the top level of the file, alongside the existing `describe('UsersService notification preferences', ...)`:

```typescript
describe('UsersService.search', () => {
  let service: UsersService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(UsersService);
  });

  it('returns [] without querying the DB for a query shorter than 2 characters', async () => {
    const result = await service.search('user-1', 'a');
    expect(result).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('excludes the caller and inactive users, matches name or email, caps at 20', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'user-2', name: 'Anna', email: 'anna@example.com' },
    ]);

    const result = await service.search('user-1', 'ann');

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        id: { not: 'user-1' },
        isActive: true,
        OR: [
          { name: { contains: 'ann', mode: 'insensitive' } },
          { email: { contains: 'ann', mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, email: true },
      take: 20,
    });
    expect(result).toEqual([{ id: 'user-2', name: 'Anna', email: 'anna@example.com' }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/api/`: `npx jest src/modules/users/users.service.spec.ts`
Expected: FAIL — `TypeError: service.search is not a function`.

- [ ] **Step 3: Implement `UsersService.search`**

In `apps/api/src/modules/users/users.service.ts`, add this method inside the `UsersService` class (anywhere among the other methods — e.g. right after the `create` method):

```typescript
  async search(callerId: string, query: string) {
    const q = query?.trim() ?? '';
    if (q.length < 2) return [];

    const users = await this.prisma.user.findMany({
      where: {
        id: { not: callerId },
        isActive: true,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, email: true },
      take: 20,
    });

    return users;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `apps/api/`: `npx jest src/modules/users/users.service.spec.ts`
Expected: PASS, both new tests plus the existing notification-preferences tests green.

- [ ] **Step 5: Wire the controller route with rate limiting**

In `apps/api/src/modules/users/users.controller.ts`, add this import at the top alongside the existing imports:

```typescript
import { Query, UseGuards as UseGuardsAlias } from '@nestjs/common';
```

Wait — `UseGuards` is already imported. Instead, just add `Query` to the existing `@nestjs/common` import line (currently `import { Controller, Get, Post, Patch, Delete, Body, UseGuards, Req, NotFoundException } from '@nestjs/common';`) so it reads:

```typescript
import { Controller, Get, Post, Patch, Delete, Body, Query, UseGuards, Req, NotFoundException } from '@nestjs/common';
```

Add this new import line below the existing imports:

```typescript
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
```

Add this new route inside the `UsersController` class, right after the `getProfile` method (`@Get('me')`):

```typescript
  @Get('search')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async search(@Req() req: AuthenticatedRequest, @Query('q') q: string) {
    return this.usersService.search(req.user.id, q ?? '');
  }
```

(This is the first route in the codebase to actually apply `ThrottlerGuard` — `ThrottlerModule` is already globally configured in `app.module.ts` with a default of 100 req/60s, but no route consumes the guard yet. `@Throttle({ default: { limit: 20, ttl: 60000 } })` overrides that default down to 20 req/60s specifically for this search endpoint, since it's the one route in the app that lets any user enumerate other users.)

- [ ] **Step 6: Typecheck**

Run from `apps/api/`: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/users/users.service.ts apps/api/src/modules/users/users.controller.ts apps/api/src/modules/users/users.service.spec.ts
git commit -m "feat(api): add rate-limited GET /users/search endpoint"
```

---

### Task 4: `notification-i18n.ts` — `account_invitation` push text (9 languages)

**Files:**
- Modify: `apps/api/src/modules/notifications/notification-i18n.ts`

**Interfaces:**
- Produces: `accountInvitationTitle(lang: Lang, params: { inviterName: string }): string` and `accountInvitationBody(lang: Lang, params: { accountName: string }): string` — consumed by Task 5's `AccountsService.createInvitation`.

This task has no test of its own (the file's existing pattern has no per-function unit tests — it's exercised via the callers' tests instead, which Task 5 covers). Do the following as a single mechanical edit pass.

- [ ] **Step 1: Add the params interface**

In `apps/api/src/modules/notifications/notification-i18n.ts`, find the `TripSettleUpParams` interface (currently around line 114-116):

```typescript
interface TripSettleUpParams {
  tripName: string;
}
```

Add a new interface directly below it:

```typescript
interface AccountInvitationParams {
  inviterName: string;
}

interface AccountInvitationBodyParams {
  accountName: string;
}
```

- [ ] **Step 2: Add the two function signatures to the `translations` type**

Find this block (currently right before the `en: {` language block starts):

```typescript
  tripSettleUpTitle: (p: TripSettleUpParams) => string;
  tripSettleUpBody: (p: TripSettleUpParams) => string;
}> = {
```

Change it to:

```typescript
  tripSettleUpTitle: (p: TripSettleUpParams) => string;
  tripSettleUpBody: (p: TripSettleUpParams) => string;
  accountInvitationTitle: (p: AccountInvitationParams) => string;
  accountInvitationBody: (p: AccountInvitationBodyParams) => string;
}> = {
```

- [ ] **Step 3: Add the translation entries to all 9 language blocks**

For each of the 9 language blocks (`en`, `ru`, `ua`, `pl`, `es`, `fr`, `de`, `be`, `nl`), find its `tripSettleUpTitle`/`tripSettleUpBody` pair and add the two new keys directly after it. Use these exact translations:

`en:` (after `tripSettleUpBody: () => 'Time to settle up with your trip group',`):
```typescript
    accountInvitationTitle: ({ inviterName }) => `${inviterName} invited you`,
    accountInvitationBody: ({ accountName }) => `Join "${accountName}" — tap to accept or decline.`,
```

`ru:` (after `tripSettleUpBody: () => 'Пора рассчитаться с группой поездки',`):
```typescript
    accountInvitationTitle: ({ inviterName }) => `${inviterName} пригласил вас`,
    accountInvitationBody: ({ accountName }) => `Присоединяйтесь к «${accountName}» — нажмите, чтобы принять или отклонить.`,
```

`ua:` (after `tripSettleUpBody: () => 'Час розрахуватися з групою поїздки',`):
```typescript
    accountInvitationTitle: ({ inviterName }) => `${inviterName} запросив вас`,
    accountInvitationBody: ({ accountName }) => `Приєднайтесь до «${accountName}» — торкніться, щоб прийняти або відхилити.`,
```

`pl:` (after `tripSettleUpBody: () => 'Czas rozliczyć się z grupą wyjazdową',`):
```typescript
    accountInvitationTitle: ({ inviterName }) => `${inviterName} zaprosił(a) Cię`,
    accountInvitationBody: ({ accountName }) => `Dołącz do "${accountName}" — dotknij, aby zaakceptować lub odrzucić.`,
```

`es:` (find its `tripSettleUpTitle`/`tripSettleUpBody` pair; add after):
```typescript
    accountInvitationTitle: ({ inviterName }) => `${inviterName} te ha invitado`,
    accountInvitationBody: ({ accountName }) => `Únete a "${accountName}" — toca para aceptar o rechazar.`,
```

`fr:` (find its pair; add after):
```typescript
    accountInvitationTitle: ({ inviterName }) => `${inviterName} vous a invité(e)`,
    accountInvitationBody: ({ accountName }) => `Rejoignez "${accountName}" — appuyez pour accepter ou refuser.`,
```

`de:` (find its pair; add after):
```typescript
    accountInvitationTitle: ({ inviterName }) => `${inviterName} hat dich eingeladen`,
    accountInvitationBody: ({ accountName }) => `Tritt "${accountName}" bei — tippen zum Annehmen oder Ablehnen.`,
```

`be:` (find its pair; add after):
```typescript
    accountInvitationTitle: ({ inviterName }) => `${inviterName} запрасіў(ла) вас`,
    accountInvitationBody: ({ accountName }) => `Далучайцеся да «${accountName}» — націсніце, каб прыняць ці адхіліць.`,
```

`nl:` (find its pair; add after):
```typescript
    accountInvitationTitle: ({ inviterName }) => `${inviterName} heeft je uitgenodigd`,
    accountInvitationBody: ({ accountName }) => `Word lid van "${accountName}" — tik om te accepteren of te weigeren.`,
```

- [ ] **Step 4: Add the exported functions**

Find the exported `tripSettleUpTitle`/`tripSettleUpBody` functions (near the bottom of the file, alongside the other `export function` pairs). Add these two directly after them:

```typescript
export function accountInvitationTitle(lang: Lang, params: AccountInvitationParams): string {
  return t(lang).accountInvitationTitle(params);
}

export function accountInvitationBody(lang: Lang, params: AccountInvitationBodyParams): string {
  return t(lang).accountInvitationBody(params);
}
```

- [ ] **Step 5: Typecheck**

Run from `apps/api/`: `npx tsc --noEmit`
Expected: no errors. (If any language block is missing the two new keys, TypeScript will report a missing-property error on the `translations` object — fix any block you skipped.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/notifications/notification-i18n.ts
git commit -m "feat(api): add account_invitation push text in all 9 languages"
```

---

### Task 5: Extend `createInvitation` for `invitedUserId` + push notification

**Files:**
- Modify: `apps/api/src/modules/accounts/accounts.service.ts` (the `createInvitation` method, currently lines 174-235, and the constructor)
- Modify: `apps/api/src/modules/accounts/dto/index.ts` (the `CreateInvitationDto` class, currently lines 54-67)
- Test: `apps/api/src/modules/accounts/accounts.service.spec.ts`

**Interfaces:**
- Consumes: `NotificationsService.sendToUser` (signature: `(userId, title, body, data?, notificationType?) => Promise<boolean>`, from `apps/api/src/modules/notifications/notifications.service.ts` — already globally available since `NotificationsModule` is `@Global()`), `accountInvitationTitle`/`accountInvitationBody` from Task 4, `AccountInvitation.invitedUserId` from Task 1/2.
- Produces: `createInvitation` now accepts `dto.invitedUserId` as an alternative to `dto.email`. Nothing later in this plan calls `createInvitation` directly (the mobile client already calls the existing endpoint), but Task 11 relies on this behavior existing.

- [ ] **Step 1: Add `invitedUserId` to the class-validator DTO**

In `apps/api/src/modules/accounts/dto/index.ts`, the `CreateInvitationDto` class currently reads:

```typescript
export class CreateInvitationDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(['editor', 'viewer'])
  role?: 'editor' | 'viewer';

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(30)
  expiresInDays?: number;
}
```

Add an `invitedUserId` field:

```typescript
export class CreateInvitationDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  invitedUserId?: string;

  @IsOptional()
  @IsEnum(['editor', 'viewer'])
  role?: 'editor' | 'viewer';

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(30)
  expiresInDays?: number;
}
```

Check the top of `apps/api/src/modules/accounts/dto/index.ts` for the `class-validator` import line — if `IsString` isn't already imported there, add it to the existing import (e.g. `import { IsOptional, IsEmail, IsEnum, IsNumber, Min, Max, IsString, ... } from 'class-validator';`, keeping whatever else is already imported on that line).

- [ ] **Step 2: Write the failing test**

In `apps/api/src/modules/accounts/accounts.service.spec.ts`, add `accountInvitation: { create: jest.fn(), findUnique: jest.fn() }` and `user: { findUnique: jest.fn() }` to the `mockPrisma` object at the top of the file if they aren't already present (check first — `mockPrisma.account`/`mockPrisma.accountMember` already exist; add sibling entries for `accountInvitation` and `user` if missing). Also add a `mockNotificationsService = { sendToUser: jest.fn().mockResolvedValue(true) }` const near `mockMailService`, and add `{ provide: NotificationsService, useValue: mockNotificationsService }` to the `providers` array in the `Test.createTestingModule` call, and import `NotificationsService` from `'../notifications/notifications.service'` at the top of the spec file.

Add this new test block:

```typescript
  describe('createInvitation via invitedUserId', () => {
    it('creates an invitation and sends a push instead of an email', async () => {
      mockPrisma.accountMember.findUnique = jest.fn().mockResolvedValue({ role: 'owner' });
      mockPrisma.account.findUnique = jest.fn().mockResolvedValue({ id: 'account-1', name: 'Bali Trip', type: 'trip' });
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(null); // no existing member with that email check path is skipped for invitedUserId
      mockPrisma.user.findFirst = jest.fn().mockResolvedValue({ id: userId, name: 'Owner Name' });
      mockPrisma.accountInvitation.create = jest.fn().mockResolvedValue({
        id: 'invitation-1',
        accountId: 'account-1',
        invitedUserId: 'user-2',
        inviteCode: 'abcd1234',
        role: 'editor',
        status: 'pending',
      });

      const result = await service.createInvitation('account-1', userId, {
        invitedUserId: 'user-2',
        role: 'editor',
      });

      expect(mockPrisma.accountInvitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accountId: 'account-1',
            invitedBy: userId,
            invitedUserId: 'user-2',
            role: 'editor',
          }),
        }),
      );
      expect(mockNotificationsService.sendToUser).toHaveBeenCalledWith(
        'user-2',
        expect.any(Function),
        expect.any(Function),
        expect.objectContaining({ accountId: 'account-1' }),
        'account_invitation',
      );
      expect(mockMailService.sendInvitationEmail).not.toHaveBeenCalled();
      expect(result.invitedUserId).toBe('user-2');
    });
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run from `apps/api/`: `npx jest src/modules/accounts/accounts.service.spec.ts`
Expected: FAIL — either a compile error (NotificationsService not injected yet) or an assertion failure on `sendToUser` never being called.

- [ ] **Step 4: Implement the `invitedUserId` branch**

In `apps/api/src/modules/accounts/accounts.service.ts`, add the import at the top:

```typescript
import { NotificationsService } from '../notifications/notifications.service';
import { accountInvitationTitle, accountInvitationBody } from '../notifications/notification-i18n';
```

Add `NotificationsService` to the constructor (currently `constructor(private readonly prisma: PrismaService, private readonly mailService: MailService) {}`):

```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
  ) {}
```

In the `createInvitation` method, the existing email-sending block (near the end of the method, currently):

```typescript
    // Send invitation email (fire-and-forget)
    if (dto.email) {
      const inviter = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });

      this.mailService
        .sendInvitationEmail({
          to: dto.email,
          inviterName: inviter?.name || inviter?.email || 'Someone',
          accountName: account.name,
          inviteCode,
          role: dto.role || 'editor',
          expiresAt,
        })
        .catch((err) => this.logger.error('Failed to send invitation email', err));
    }

    return invitation;
```

Change it to (adds an `invitedUserId` branch that sends a push instead, and includes `invitedUserId` in the `accountInvitation.create` call):

```typescript
    // Send invitation email (fire-and-forget) — only for the email-address flow
    if (dto.email) {
      const inviter = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });

      this.mailService
        .sendInvitationEmail({
          to: dto.email,
          inviterName: inviter?.name || inviter?.email || 'Someone',
          accountName: account.name,
          inviteCode,
          role: dto.role || 'editor',
          expiresAt,
        })
        .catch((err) => this.logger.error('Failed to send invitation email', err));
    }

    // Send a push notification (fire-and-forget) — only for the search-invite flow
    if (dto.invitedUserId) {
      const inviter = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });
      const inviterName = inviter?.name || inviter?.email || 'Someone';

      this.notificationsService
        .sendToUser(
          dto.invitedUserId,
          (lang) => accountInvitationTitle(lang, { inviterName }),
          (lang) => accountInvitationBody(lang, { accountName: account.name }),
          { accountId, invitationId: invitation.id },
          'account_invitation',
        )
        .catch((err) => this.logger.error('Failed to send invitation push', err));
    }

    return invitation;
```

Now find the `accountInvitation.create` call earlier in the same method (currently):

```typescript
    const invitation = await this.prisma.accountInvitation.create({
      data: {
        accountId,
        invitedBy: userId,
        invitedEmail: dto.email,
        inviteCode,
        role: dto.role || 'editor',
        expiresAt,
      },
    });
```

Change it to:

```typescript
    const invitation = await this.prisma.accountInvitation.create({
      data: {
        accountId,
        invitedBy: userId,
        invitedEmail: dto.email,
        invitedUserId: dto.invitedUserId,
        inviteCode,
        role: dto.role || 'editor',
        expiresAt,
      },
    });
```

Also find the existing member-already-exists check (currently only runs `if (dto.email)`):

```typescript
    // If inviting by email, check the user is not already a member
    if (dto.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existingUser) {
        const existingMember = await this.prisma.accountMember.findUnique({
          where: { accountId_userId: { accountId, userId: existingUser.id } },
        });
        if (existingMember) {
          throw new ConflictException('This user is already a member of this account');
        }
      }
    }
```

Extend it to also check the `invitedUserId` path:

```typescript
    // If inviting by email, check the user is not already a member
    if (dto.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existingUser) {
        const existingMember = await this.prisma.accountMember.findUnique({
          where: { accountId_userId: { accountId, userId: existingUser.id } },
        });
        if (existingMember) {
          throw new ConflictException('This user is already a member of this account');
        }
      }
    }

    // If inviting a specific user found via search, check they're not already a member
    if (dto.invitedUserId) {
      const existingMember = await this.prisma.accountMember.findUnique({
        where: { accountId_userId: { accountId, userId: dto.invitedUserId } },
      });
      if (existingMember) {
        throw new ConflictException('This user is already a member of this account');
      }
    }
```

- [ ] **Step 5: Run the test to verify it passes**

Run from `apps/api/`: `npx jest src/modules/accounts/accounts.service.spec.ts`
Expected: PASS, all tests including the new one and every pre-existing test in this file.

- [ ] **Step 6: Typecheck**

Run from `apps/api/`: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/accounts/accounts.service.ts apps/api/src/modules/accounts/dto/index.ts apps/api/src/modules/accounts/accounts.service.spec.ts
git commit -m "feat(api): invite by invitedUserId sends a push instead of an email"
```

---

### Task 6: `GET /accounts/invitations/mine`

**Files:**
- Modify: `apps/api/src/modules/accounts/accounts.service.ts` (add `getMyInvitations`)
- Modify: `apps/api/src/modules/accounts/accounts.controller.ts` (add the route)
- Test: `apps/api/src/modules/accounts/accounts.service.spec.ts`

**Interfaces:**
- Produces: `AccountsService.getMyInvitations(userId: string): Promise<{id, accountId, accountName, accountType, inviterName, role, createdAt}[]>` — consumed by Task 7's mobile `getMyInvitations` client method.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/modules/accounts/accounts.service.spec.ts`:

```typescript
  describe('getMyInvitations', () => {
    it('returns pending invitations matched by invitedUserId or invitedEmail, with account and inviter names', async () => {
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue({ id: userId, email: 'me@example.com' });
      mockPrisma.accountInvitation.findMany = jest.fn().mockResolvedValue([
        {
          id: 'invitation-1',
          accountId: 'account-1',
          invitedBy: 'owner-1',
          role: 'editor',
          createdAt: new Date('2026-07-01'),
          account: { name: 'Bali Trip', type: 'trip' },
        },
      ]);
      mockPrisma.user.findMany = jest.fn().mockResolvedValue([{ id: 'owner-1', name: 'Owner Name' }]);

      const result = await service.getMyInvitations(userId);

      expect(mockPrisma.accountInvitation.findMany).toHaveBeenCalledWith({
        where: {
          status: 'pending',
          OR: [{ invitedUserId: userId }, { invitedEmail: 'me@example.com' }],
        },
        include: { account: { select: { name: true, type: true } } },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([
        {
          id: 'invitation-1',
          accountId: 'account-1',
          accountName: 'Bali Trip',
          accountType: 'trip',
          inviterName: 'Owner Name',
          role: 'editor',
          createdAt: new Date('2026-07-01'),
        },
      ]);
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/api/`: `npx jest src/modules/accounts/accounts.service.spec.ts`
Expected: FAIL — `TypeError: service.getMyInvitations is not a function`.

- [ ] **Step 3: Implement `getMyInvitations`**

Add this method to `apps/api/src/modules/accounts/accounts.service.ts`, anywhere among the other invitation methods (e.g. right after `getInvitations`):

```typescript
  async getMyInvitations(userId: string) {
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    const invitations = await this.prisma.accountInvitation.findMany({
      where: {
        status: 'pending',
        OR: [{ invitedUserId: userId }, { invitedEmail: me?.email }],
      },
      include: { account: { select: { name: true, type: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (invitations.length === 0) return [];

    const inviterIds = [...new Set(invitations.map((i) => i.invitedBy))];
    const inviters = await this.prisma.user.findMany({
      where: { id: { in: inviterIds } },
      select: { id: true, name: true },
    });
    const inviterNameById = new Map(inviters.map((u) => [u.id, u.name]));

    return invitations.map((i) => ({
      id: i.id,
      accountId: i.accountId,
      accountName: i.account.name,
      accountType: i.account.type,
      inviterName: inviterNameById.get(i.invitedBy) ?? 'Someone',
      role: i.role,
      createdAt: i.createdAt,
    }));
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `apps/api/`: `npx jest src/modules/accounts/accounts.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Wire the controller route**

In `apps/api/src/modules/accounts/accounts.controller.ts`, add this route inside the `// ---- Invitations ----` section, right after the `getInvitations` method:

```typescript
  @Get('invitations/mine')
  async getMyInvitations(@Req() req: AuthenticatedRequest) {
    return this.accountsService.getMyInvitations(req.user.id);
  }
```

- [ ] **Step 6: Typecheck**

Run from `apps/api/`: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/accounts/accounts.service.ts apps/api/src/modules/accounts/accounts.controller.ts apps/api/src/modules/accounts/accounts.service.spec.ts
git commit -m "feat(api): add GET /accounts/invitations/mine"
```

---

### Task 7: `PATCH /accounts/invitations/:id/respond`

**Files:**
- Modify: `apps/api/src/modules/accounts/accounts.service.ts` (add `respondToInvitation`)
- Modify: `apps/api/src/modules/accounts/accounts.controller.ts` (add the route)
- Modify: `apps/api/src/modules/accounts/dto/index.ts` (add `RespondToInvitationDto`)
- Test: `apps/api/src/modules/accounts/accounts.service.spec.ts`

**Interfaces:**
- Consumes: nothing new beyond Prisma (already injected).
- Produces: `AccountsService.respondToInvitation(invitationId: string, userId: string, action: 'accept' | 'decline'): Promise<{member: AccountMember; account: Account} | AccountInvitation>` — consumed by Task 8's mobile `respondToInvitation` client method.

- [ ] **Step 1: Add the DTO**

In `apps/api/src/modules/accounts/dto/index.ts`, add this new class near `AcceptInvitationDto`:

```typescript
export class RespondToInvitationDto {
  @IsIn(['accept', 'decline'])
  action: 'accept' | 'decline';
}
```

Check that `IsIn` is imported from `class-validator` at the top of the file — it already is, since `AccountMemberPaymentInfoDto` uses `@IsIn(['blik', 'revolut', 'paypal', 'cash', 'other'])`.

- [ ] **Step 2: Write the failing tests**

Add to `apps/api/src/modules/accounts/accounts.service.spec.ts`:

```typescript
  describe('respondToInvitation', () => {
    it('rejects when the invitation is not found', async () => {
      mockPrisma.accountInvitation.findUnique = jest.fn().mockResolvedValue(null);

      await expect(service.respondToInvitation('invitation-1', userId, 'accept')).rejects.toThrow(
        'Invitation not found',
      );
    });

    it('rejects when the invitation is not addressed to the responder', async () => {
      mockPrisma.accountInvitation.findUnique = jest.fn().mockResolvedValue({
        id: 'invitation-1',
        accountId: 'account-1',
        status: 'pending',
        invitedUserId: 'someone-else',
        invitedEmail: null,
        role: 'editor',
      });
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue({ id: userId, email: 'me@example.com' });

      await expect(service.respondToInvitation('invitation-1', userId, 'accept')).rejects.toThrow(
        'This invitation is not addressed to you',
      );
    });

    it('accepts by creating an AccountMember and marking the invitation accepted', async () => {
      mockPrisma.accountInvitation.findUnique = jest.fn().mockResolvedValue({
        id: 'invitation-1',
        accountId: 'account-1',
        status: 'pending',
        invitedUserId: userId,
        invitedEmail: null,
        role: 'editor',
      });
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue({ id: userId, email: 'me@example.com' });
      mockPrisma.accountMember.findUnique = jest.fn().mockResolvedValue(null);
      mockPrisma.accountMember.create = jest.fn().mockResolvedValue({ id: 'member-1', accountId: 'account-1', userId, role: 'editor' });
      mockPrisma.accountInvitation.update = jest.fn().mockResolvedValue({ id: 'invitation-1', status: 'accepted' });
      mockPrisma.account.findUnique = jest.fn().mockResolvedValue({ id: 'account-1', name: 'Bali Trip' });

      const result = await service.respondToInvitation('invitation-1', userId, 'accept');

      expect(mockPrisma.accountMember.create).toHaveBeenCalledWith({
        data: { accountId: 'account-1', userId, role: 'editor' },
      });
      expect(mockPrisma.accountInvitation.update).toHaveBeenCalledWith({
        where: { id: 'invitation-1' },
        data: { status: 'accepted', acceptedBy: userId },
      });
      expect(result).toHaveProperty('member');
    });

    it('declines by marking the invitation declined, without creating a member', async () => {
      mockPrisma.accountInvitation.findUnique = jest.fn().mockResolvedValue({
        id: 'invitation-1',
        accountId: 'account-1',
        status: 'pending',
        invitedUserId: userId,
        invitedEmail: null,
        role: 'editor',
      });
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue({ id: userId, email: 'me@example.com' });
      mockPrisma.accountInvitation.update = jest.fn().mockResolvedValue({ id: 'invitation-1', status: 'declined' });

      const result = await service.respondToInvitation('invitation-1', userId, 'decline');

      expect(mockPrisma.accountMember.create).not.toHaveBeenCalled();
      expect(mockPrisma.accountInvitation.update).toHaveBeenCalledWith({
        where: { id: 'invitation-1' },
        data: { status: 'declined' },
      });
      expect(result.status).toBe('declined');
    });
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run from `apps/api/`: `npx jest src/modules/accounts/accounts.service.spec.ts`
Expected: FAIL — `TypeError: service.respondToInvitation is not a function`.

- [ ] **Step 4: Implement `respondToInvitation`**

Add this method to `apps/api/src/modules/accounts/accounts.service.ts`, right after `acceptInvitation`:

```typescript
  async respondToInvitation(invitationId: string, userId: string, action: 'accept' | 'decline') {
    const invitation = await this.prisma.accountInvitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    const addressedToMe =
      invitation.invitedUserId === userId || (!!invitation.invitedEmail && invitation.invitedEmail === me?.email);
    if (!addressedToMe) {
      throw new ForbiddenException('This invitation is not addressed to you');
    }

    if (invitation.status !== 'pending') {
      throw new BadRequestException('This invitation is no longer valid');
    }

    if (action === 'decline') {
      return this.prisma.accountInvitation.update({
        where: { id: invitation.id },
        data: { status: 'declined' },
      });
    }

    // action === 'accept' — same membership-creation logic as acceptInvitation()
    const existingMember = await this.prisma.accountMember.findUnique({
      where: { accountId_userId: { accountId: invitation.accountId, userId } },
    });
    if (existingMember) {
      throw new ConflictException('You are already a member of this account');
    }

    return this.prisma.$transaction(async (tx: PrismaClient) => {
      const member = await tx.accountMember.create({
        data: {
          accountId: invitation.accountId,
          userId,
          role: invitation.role,
        },
      });

      await tx.accountInvitation.update({
        where: { id: invitation.id },
        data: { status: 'accepted', acceptedBy: userId },
      });

      const account = await tx.account.findUnique({ where: { id: invitation.accountId } });

      return { member, account };
    });
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run from `apps/api/`: `npx jest src/modules/accounts/accounts.service.spec.ts`
Expected: PASS, all four new tests plus every pre-existing test in the file.

- [ ] **Step 6: Wire the controller route**

In `apps/api/src/modules/accounts/accounts.controller.ts`, add `RespondToInvitationDto` to the existing `dto` import (currently `import { CreateAccountDto, UpdateAccountDto, CreateInvitationDto, AcceptInvitationDto, UpdateMemberRoleDto, AccountMemberPaymentInfoDto } from './dto';`) so it reads:

```typescript
import {
  CreateAccountDto,
  UpdateAccountDto,
  CreateInvitationDto,
  AcceptInvitationDto,
  RespondToInvitationDto,
  UpdateMemberRoleDto,
  AccountMemberPaymentInfoDto,
} from './dto';
```

Add this route right after the `getMyInvitations` route added in Task 6:

```typescript
  @Patch('invitations/:id/respond')
  async respondToInvitation(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: RespondToInvitationDto,
  ) {
    return this.accountsService.respondToInvitation(id, req.user.id, dto.action);
  }
```

- [ ] **Step 7: Typecheck**

Run from `apps/api/`: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/accounts/accounts.service.ts apps/api/src/modules/accounts/accounts.controller.ts apps/api/src/modules/accounts/dto/index.ts apps/api/src/modules/accounts/accounts.service.spec.ts
git commit -m "feat(api): add PATCH /accounts/invitations/:id/respond"
```

---

### Task 8: Mobile API client — `searchUsers`, `getMyInvitations`, `respondToInvitation`

**Files:**
- Modify: `apps/mobile/src/services/users.api.ts`
- Modify: `apps/mobile/src/services/accounts.api.ts`

**Interfaces:**
- Consumes: `AccountInvitation` type (already imported in `accounts.api.ts`).
- Produces: `usersApi.searchUsers(query: string): Promise<{id: string; name: string; email: string}[]>`, `accountsApi.getMyInvitations(): Promise<MyInvitation[]>`, `accountsApi.respondToInvitation(id: string, action: 'accept' | 'decline'): Promise<any>` — consumed by Task 9 (`invitationStore.ts`) and Task 12 (search UI).

This task has no automated test — the mobile API client layer in this codebase is a thin `httpClient.request` wrapper with no unit tests of its own (consistent with every other method in `accounts.api.ts`/`users.api.ts`).

- [ ] **Step 1: Add `searchUsers` to `users.api.ts`**

In `apps/mobile/src/services/users.api.ts`, add this method to the `usersApi` object (anywhere — e.g. right after `getProfile`):

```typescript
  searchUsers(query: string) {
    return httpClient.request<{ id: string; name: string; email: string }[]>(
      `/users/search?q=${encodeURIComponent(query)}`,
    );
  },
```

- [ ] **Step 2: Add `getMyInvitations` and `respondToInvitation` to `accounts.api.ts`**

In `apps/mobile/src/services/accounts.api.ts`, add this type near the top of the file, below the existing imports:

```typescript
export interface MyInvitation {
  id: string;
  accountId: string;
  accountName: string;
  accountType: string;
  inviterName: string;
  role: string;
  createdAt: string;
}
```

Add these two methods to the `accountsApi` object, right after `declineInvitation`:

```typescript
  getMyInvitations() {
    return httpClient.request<MyInvitation[]>('/accounts/invitations/mine');
  },

  respondToInvitation(id: string, action: 'accept' | 'decline') {
    return httpClient.request<{ member: AccountMember; account: Account } | AccountInvitation>(
      `/accounts/invitations/${id}/respond`,
      { method: 'PATCH', body: JSON.stringify({ action }) },
    );
  },
```

- [ ] **Step 3: Typecheck**

Run from the project root: `npm run typecheck`
Expected: all 5 packages pass (this task adds no new consumers yet, so it should be a pure no-op typecheck pass).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/services/users.api.ts apps/mobile/src/services/accounts.api.ts
git commit -m "feat(mobile): add searchUsers/getMyInvitations/respondToInvitation API client methods"
```

---

### Task 9: `invitationStore.ts`

**Files:**
- Create: `apps/mobile/src/stores/invitationStore.ts`
- Test: `apps/mobile/src/stores/__tests__/invitationStore.test.ts`

**Interfaces:**
- Consumes: `api.getMyInvitations`, `api.respondToInvitation` from Task 8 (via the `api` barrel — check `apps/mobile/src/services/api.ts` re-exports `accountsApi`'s methods, which it does via `...accountsApi`).
- Produces: `useInvitationStore` Zustand store with `invitations: MyInvitation[]`, `isLoading: boolean`, `loadInvitations(): Promise<void>`, `respond(id: string, action: 'accept' | 'decline'): Promise<void>` — consumed by Task 10 (Alerts screen) and Task 11 (badge sum).

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/stores/__tests__/invitationStore.test.ts`:

```typescript
import { useInvitationStore } from '../invitationStore';
import { api } from '../../services/api';

jest.mock('../../services/api', () => ({
  api: {
    getMyInvitations: jest.fn(),
    respondToInvitation: jest.fn(),
  },
}));

describe('invitationStore', () => {
  beforeEach(() => {
    useInvitationStore.setState({ invitations: [], isLoading: false });
    jest.clearAllMocks();
  });

  it('loadInvitations populates state from the API', async () => {
    (api.getMyInvitations as jest.Mock).mockResolvedValue([
      { id: 'inv-1', accountId: 'account-1', accountName: 'Bali Trip', accountType: 'trip', inviterName: 'Owner', role: 'editor', createdAt: '2026-07-01' },
    ]);

    await useInvitationStore.getState().loadInvitations();

    expect(useInvitationStore.getState().invitations).toHaveLength(1);
    expect(useInvitationStore.getState().isLoading).toBe(false);
  });

  it('loadInvitations keeps the previous list and stops loading on failure', async () => {
    useInvitationStore.setState({ invitations: [{ id: 'inv-1' }] as any });
    (api.getMyInvitations as jest.Mock).mockRejectedValue(new Error('offline'));

    await useInvitationStore.getState().loadInvitations();

    expect(useInvitationStore.getState().invitations).toHaveLength(1);
    expect(useInvitationStore.getState().isLoading).toBe(false);
  });

  it('respond removes the invitation from state optimistically on success', async () => {
    useInvitationStore.setState({
      invitations: [{ id: 'inv-1', accountId: 'account-1' } as any],
    });
    (api.respondToInvitation as jest.Mock).mockResolvedValue({});

    await useInvitationStore.getState().respond('inv-1', 'accept');

    expect(api.respondToInvitation).toHaveBeenCalledWith('inv-1', 'accept');
    expect(useInvitationStore.getState().invitations).toHaveLength(0);
  });

  it('respond restores the invitation on failure', async () => {
    const invitation = { id: 'inv-1', accountId: 'account-1' } as any;
    useInvitationStore.setState({ invitations: [invitation] });
    (api.respondToInvitation as jest.Mock).mockRejectedValue(new Error('network'));

    await expect(useInvitationStore.getState().respond('inv-1', 'decline')).rejects.toThrow('network');

    expect(useInvitationStore.getState().invitations).toEqual([invitation]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/mobile/`: `npx jest src/stores/__tests__/invitationStore.test.ts`
Expected: FAIL — cannot find module `../invitationStore`.

- [ ] **Step 3: Implement the store**

Create `apps/mobile/src/stores/invitationStore.ts`:

```typescript
import { create } from 'zustand';
import { api } from '@/services/api';
import type { MyInvitation } from '@/services/accounts.api';

interface InvitationState {
  invitations: MyInvitation[];
  isLoading: boolean;

  loadInvitations: () => Promise<void>;
  respond: (id: string, action: 'accept' | 'decline') => Promise<void>;
}

export const useInvitationStore = create<InvitationState>((set, get) => ({
  invitations: [],
  isLoading: false,

  async loadInvitations() {
    set({ isLoading: true });
    try {
      const invitations = await api.getMyInvitations();
      set({ invitations, isLoading: false });
    } catch (e) {
      // Offline or server error — keep whatever we had; this store is server-backed only.
      console.warn('Failed to load invitations:', e);
      set({ isLoading: false });
    }
  },

  async respond(id, action) {
    const { invitations } = get();
    const previous = invitations;
    set({ invitations: invitations.filter((i) => i.id !== id) });
    try {
      await api.respondToInvitation(id, action);
    } catch (e) {
      set({ invitations: previous });
      throw e;
    }
  },
}));
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `apps/mobile/`: `npx jest src/stores/__tests__/invitationStore.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Typecheck**

Run from the project root: `npm run typecheck`
Expected: all 5 packages pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/stores/invitationStore.ts apps/mobile/src/stores/__tests__/invitationStore.test.ts
git commit -m "feat(mobile): add invitationStore"
```

---

### Task 10: Push deep-link handler — `account_invitation`

**Files:**
- Modify: `apps/mobile/src/services/notifications.ts` (the `handleNotificationResponse` function)

**Interfaces:**
- Consumes: nothing new.
- Produces: tapping an `account_invitation` push navigates to `/alerts` with a param selecting the Invitations tab — consumed by Task 11's tab-selection logic.

No automated test exists for this function in the codebase today (it's a thin `switch` over `router.push` calls with no test file) — this task is a single mechanical addition, consistent with how `spending_anomaly` and `purchase_request_created` were added previously without tests.

- [ ] **Step 1: Add the `account_invitation` case**

In `apps/mobile/src/services/notifications.ts`, inside `handleNotificationResponse`'s `switch (data.type)` block, the `spending_anomaly` case currently reads:

```typescript
    case 'spending_anomaly':
      router.push('/alerts' as any);
      break;
```

Add a new case directly after it:

```typescript
    case 'spending_anomaly':
      router.push('/alerts' as any);
      break;
    case 'account_invitation':
      router.push({ pathname: '/alerts', params: { tab: 'invitations' } } as any);
      break;
```

- [ ] **Step 2: Typecheck**

Run from the project root: `npm run typecheck`
Expected: all 5 packages pass.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/services/notifications.ts
git commit -m "feat(mobile): deep-link account_invitation push to the Invitations tab"
```

---

### Task 11: Alerts screen — "My Invitations" tab + `InvitationCard` + badge sum

**Files:**
- Modify: `apps/mobile/app/alerts/index.tsx`
- Create: `apps/mobile/src/components/alerts/InvitationCard.tsx`
- Modify: `apps/mobile/src/hooks/useHomeScreenData.ts` (the `unreadAlertCount` computation, currently line 37)
- Modify: `apps/mobile/app/(tabs)/_layout.tsx` (the `unreadAlertCount` computation, currently line 25)

**Interfaces:**
- Consumes: `useInvitationStore` from Task 9, `useLocalSearchParams` for the `tab` param set by Task 10's deep link.
- Produces: nothing consumed by later tasks in this plan — this is the terminal UI task for the Alerts side.

No automated test — this codebase has no test coverage for screen files (established pattern throughout prior work on this app; verify manually per Step 6).

- [ ] **Step 1: Create the `InvitationCard` component**

Create `apps/mobile/src/components/alerts/InvitationCard.tsx`:

```typescript
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import type { MyInvitation } from '@/services/accounts.api';

interface Props {
  invitation: MyInvitation;
  onAccept: () => void;
  onDecline: () => void;
}

export function InvitationCard({ invitation, onAccept, onDecline }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderLight }]}>
      <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
        {t('alerts.invitationTitle', { accountName: invitation.accountName })}
      </Text>
      <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
        {t('alerts.invitationSubtitle', { inviterName: invitation.inviterName, role: t(`accounts.roles.${invitation.role}`) })}
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.declineButton, { borderColor: theme.colors.border }]}
          onPress={onDecline}
        >
          <Text style={{ color: theme.colors.textSecondary }}>{t('alerts.invitationDecline')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.acceptButton, { backgroundColor: theme.colors.primary }]}
          onPress={onAccept}
        >
          <Text style={{ color: theme.colors.textInverse }}>{t('alerts.invitationAccept')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  subtitle: { fontSize: 13, marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 10 },
  button: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  declineButton: { borderWidth: 1 },
  acceptButton: {},
});
```

- [ ] **Step 2: Add the tab control and Invitations list to `app/alerts/index.tsx`**

In `apps/mobile/app/alerts/index.tsx`, add these imports at the top, alongside the existing ones:

```typescript
import { useLocalSearchParams } from 'expo-router';
import { showAlert } from '@/utils/alert';
import { useInvitationStore } from '@/stores/invitationStore';
import { InvitationCard } from '@/components/alerts/InvitationCard';
```

Inside the `AlertsScreen` function, right after the existing `const { alerts, isLoading, unreadCount, loadAlerts, markRead, markAllRead, dismiss } = useAlertStore();` line, add:

```typescript
  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = React.useState<'alerts' | 'invitations'>(
    params.tab === 'invitations' ? 'invitations' : 'alerts',
  );
  const { invitations, isLoading: invitationsLoading, loadInvitations, respond } = useInvitationStore();

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  const handleAccept = async (id: string) => {
    try {
      await respond(id, 'accept');
      const { loadAccounts } = useAccountStore.getState();
      await loadAccounts();
    } catch (e) {
      showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleDecline = async (id: string) => {
    try {
      await respond(id, 'decline');
    } catch (e) {
      showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };
```

No import change is needed for this — the file already imports `useEffect` (`import React, { useCallback, useEffect } from 'react';`), and the new code above uses `React.useState(...)` (via the `React` default import already present) rather than a named `useState` import, so nothing else needs adding.

Now find the screen's return statement — currently:

```typescript
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerRight }} />
      {isLoading && alerts.length === 0 ? (
```

Change it to add the tab control right after `<Stack.Screen options={{ headerRight }} />`, and branch the body on `activeTab`:

```typescript
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerRight }} />
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'alerts' && styles.tabButtonActive]}
          onPress={() => setActiveTab('alerts')}
        >
          <Text style={[styles.tabText, activeTab === 'alerts' && styles.tabTextActive]}>
            {t('alerts.tabAlerts')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'invitations' && styles.tabButtonActive]}
          onPress={() => setActiveTab('invitations')}
        >
          <Text style={[styles.tabText, activeTab === 'invitations' && styles.tabTextActive]}>
            {t('alerts.tabInvitations')}
            {invitations.length > 0 ? ` (${invitations.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>
      {activeTab === 'invitations' ? (
        invitationsLoading && invitations.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : invitations.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="mail-open-outline" size={56} color={theme.colors.textTertiary} />
            <Text style={styles.emptyText}>{t('alerts.invitationsEmpty')}</Text>
          </View>
        ) : (
          <FlatList
            data={invitations}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <InvitationCard
                invitation={item}
                onAccept={() => handleAccept(item.id)}
                onDecline={() => handleDecline(item.id)}
              />
            )}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={invitationsLoading} onRefresh={loadInvitations} />}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : isLoading && alerts.length === 0 ? (
```

The rest of the existing `alerts.length === 0 ? ... : <FlatList ... />) }` branch stays exactly as-is (it now sits inside this extended ternary, only reached when `activeTab === 'alerts'`).

Add these two new styles to the `createStyles` function, alongside the existing ones:

```typescript
  tabRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
  },
  tabButton: {
    flex: 1,
    paddingVertical: theme.spacing[2.5],
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
  },
  tabButtonActive: {
    backgroundColor: theme.colors.primaryLight,
  },
  tabText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
  },
  tabTextActive: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },
```

- [ ] **Step 3: Sum the badge count in `useHomeScreenData.ts`**

In `apps/mobile/src/hooks/useHomeScreenData.ts`, add this import alongside the existing store imports:

```typescript
import { useInvitationStore } from '@/stores/invitationStore';
```

The current line 37 reads:

```typescript
  const unreadAlertCount = useAlertStore((s) => s.unreadCount);
```

Change it to:

```typescript
  const unreadAlertCount = useAlertStore((s) => s.unreadCount) + useInvitationStore((s) => s.invitations.length);
```

- [ ] **Step 4: Sum the badge count in `(tabs)/_layout.tsx`**

In `apps/mobile/app/(tabs)/_layout.tsx`, add this import alongside the existing `useAlertStore` import:

```typescript
import { useInvitationStore } from '@/stores/invitationStore';
```

The current line 25 reads:

```typescript
  const unreadAlertCount = useAlertStore((s) => s.unreadCount);
```

Change it to:

```typescript
  const unreadAlertCount = useAlertStore((s) => s.unreadCount) + useInvitationStore((s) => s.invitations.length);
```

- [ ] **Step 5: Typecheck**

Run from the project root: `npm run typecheck`
Expected: all 5 packages pass.

- [ ] **Step 6: Manual verification**

Attempt `npx expo start --web` from `apps/mobile/` (or use an already-running dev server) and open `/alerts` — confirm the tab control renders and switching tabs doesn't crash even with zero invitations. If the environment blocks a live check, note that explicitly rather than claiming it was verified.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/app/alerts/index.tsx apps/mobile/src/components/alerts/InvitationCard.tsx apps/mobile/src/hooks/useHomeScreenData.ts "apps/mobile/app/(tabs)/_layout.tsx"
git commit -m "feat(mobile): add My Invitations tab to the Alerts screen"
```

---

### Task 12: "Find user" search mode in `account/invite.tsx`

**Files:**
- Modify: `apps/mobile/app/account/invite.tsx`
- Modify: `apps/mobile/src/stores/accountStore.ts` (the `inviteMember` action's parameter type, if needed — check Step 1)

**Interfaces:**
- Consumes: `api.searchUsers` from Task 8, `inviteMember(accountId, dto)` (already exists — `dto` is `CreateInvitationDto`, which Task 1 already extended with `invitedUserId`, so no store change should be needed; verify in Step 1).
- Produces: nothing consumed by later tasks — this is the final task in the plan.

No automated test — `account/invite.tsx` has no existing test file (established pattern for screen files in this codebase).

- [ ] **Step 1: Verify `inviteMember`'s type already accepts `invitedUserId`**

Read `apps/mobile/src/stores/accountStore.ts` around line 61 (`inviteMember: (accountId: string, dto: CreateInvitationDto) => Promise<AccountInvitation>;`) — since `CreateInvitationDto` comes from `@budget/shared-types` and Task 1 already added `invitedUserId?: string` to it, no change is needed here. If this line instead uses a locally-redeclared interface (not the shared-types one), add `invitedUserId?: string` to that local interface to match.

- [ ] **Step 2: Add the third mode and search UI**

In `apps/mobile/app/account/invite.tsx`, add these imports alongside the existing ones:

```typescript
import { api } from '@/services/api';
```

Change the `mode` state type (currently `const [mode, setMode] = useState<'email' | 'link'>('link');`) to:

```typescript
  const [mode, setMode] = useState<'email' | 'link' | 'search'>('link');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; email: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string; email: string } | null>(null);
```

Add a debounced search effect right after the state declarations (needs `useEffect` — add it to the existing `import React, { useState } from 'react';` so it reads `import React, { useState, useEffect } from 'react';`):

```typescript
  useEffect(() => {
    if (mode !== 'search' || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const handle = setTimeout(() => {
      api
        .searchUsers(searchQuery.trim())
        .then(setSearchResults)
        .catch(() => setSearchResults([]))
        .finally(() => setIsSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [mode, searchQuery]);
```

In `handleInvite`, the current body reads:

```typescript
  const handleInvite = async () => {
    if (!accountId) return;

    if (mode === 'email' && !email.trim()) {
      showAlert(t('errors.error'), t('accounts.emailRequired'));
      return;
    }

    setIsLoading(true);
    try {
      const invitation = await inviteMember(accountId, {
        email: mode === 'email' ? email.trim() : undefined,
        role,
      });
      setInviteCode(invitation.inviteCode);
    } catch (e) {
      if ((e as { status?: number }).status === 403) {
        showUpgrade(t('subscription.limitReachedBody'), 'pro');
      } else {
        showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
      }
    } finally {
      setIsLoading(false);
    }
  };
```

Change it to add a `search`-mode branch and a success path that skips showing a code (nothing to share — the invite already went out via push):

```typescript
  const [searchInviteSent, setSearchInviteSent] = useState(false);

  const handleInvite = async () => {
    if (!accountId) return;

    if (mode === 'email' && !email.trim()) {
      showAlert(t('errors.error'), t('accounts.emailRequired'));
      return;
    }
    if (mode === 'search' && !selectedUser) {
      showAlert(t('errors.error'), t('accounts.selectUserRequired'));
      return;
    }

    setIsLoading(true);
    try {
      const invitation = await inviteMember(accountId, {
        email: mode === 'email' ? email.trim() : undefined,
        invitedUserId: mode === 'search' ? selectedUser!.id : undefined,
        role,
      });
      if (mode === 'search') {
        setSearchInviteSent(true);
      } else {
        setInviteCode(invitation.inviteCode);
      }
    } catch (e) {
      if ((e as { status?: number }).status === 403) {
        showUpgrade(t('subscription.limitReachedBody'), 'pro');
      } else {
        showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
      }
    } finally {
      setIsLoading(false);
    }
  };
```

Find the success-state early return (currently `if (inviteCode) { return ( <SafeAreaView ...> ... ); }`). Add a sibling early return for the search-invite success state directly above it:

```typescript
  if (searchInviteSent) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.successContainer}>
          <Ionicons name="checkmark-circle" size={64} color={theme.colors.primary} />
          <Text style={styles.successTitle}>{t('accounts.inviteSent')}</Text>
          <Text style={styles.successSubtitle}>
            {t('accounts.inviteSentPush', { name: selectedUser?.name })}
          </Text>
          <TouchableOpacity style={styles.doneButton} onPress={() => router.back()}>
            <Text style={styles.doneButtonText}>{t('common.done')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (inviteCode) {
```

Find the mode selector row (currently a 2-button `modeRow` with `link` and `email`). Add a third button:

```typescript
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'link' && styles.modeButtonActive]}
            onPress={() => setMode('link')}
          >
            <Ionicons
              name="link-outline"
              size={20}
              color={mode === 'link' ? theme.colors.primary : theme.colors.textTertiary}
            />
            <Text style={[styles.modeText, mode === 'link' && styles.modeTextActive]}>
              {t('accounts.inviteByLink')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'email' && styles.modeButtonActive]}
            onPress={() => setMode('email')}
          >
            <Ionicons
              name="mail-outline"
              size={20}
              color={mode === 'email' ? theme.colors.primary : theme.colors.textTertiary}
            />
            <Text style={[styles.modeText, mode === 'email' && styles.modeTextActive]}>
              {t('accounts.inviteByEmail')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'search' && styles.modeButtonActive]}
            onPress={() => setMode('search')}
          >
            <Ionicons
              name="search-outline"
              size={20}
              color={mode === 'search' ? theme.colors.primary : theme.colors.textTertiary}
            />
            <Text style={[styles.modeText, mode === 'search' && styles.modeTextActive]}>
              {t('accounts.inviteBySearch')}
            </Text>
          </TouchableOpacity>
        </View>
```

Find the email-mode input block (currently `{mode === 'email' && ( <> ... </> )}`). Add a sibling search-mode block directly after it:

```typescript
        {mode === 'search' && (
          <>
            <Text style={styles.label}>{t('accounts.searchLabel')}</Text>
            <TextInput
              style={styles.input}
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                setSelectedUser(null);
              }}
              placeholder={t('accounts.searchPlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
              autoCapitalize="none"
            />
            {isSearching && <ActivityIndicator style={{ marginTop: theme.spacing[3] }} color={theme.colors.primary} />}
            {!isSearching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
              <Text style={styles.searchEmptyText}>{t('accounts.searchNoResults')}</Text>
            )}
            {searchResults.map((u) => (
              <TouchableOpacity
                key={u.id}
                style={[styles.searchResultRow, selectedUser?.id === u.id && styles.searchResultRowActive]}
                onPress={() => setSelectedUser(u)}
              >
                <View style={styles.searchResultAvatar}>
                  <Text style={styles.searchResultAvatarText}>{u.name[0]?.toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={styles.searchResultName}>{u.name}</Text>
                  <Text style={styles.searchResultEmail}>{u.email}</Text>
                </View>
                {selectedUser?.id === u.id && (
                  <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} style={{ marginLeft: 'auto' }} />
                )}
              </TouchableOpacity>
            ))}
          </>
        )}
```

Find the Role Selector section (currently rendered unconditionally) — gate it so it doesn't show for `search` mode until a user is picked, and for `email` mode it stays as-is. Change its wrapping condition from nothing to:

```typescript
        {(mode !== 'search' || selectedUser) && (
          <>
            {/* Role Selector */}
            <Text style={styles.label}>{t('accounts.inviteRole')}</Text>
            <View style={styles.roleRow}>
              {ROLES.map((item) => (
                <TouchableOpacity
                  key={item.role}
                  style={[
                    styles.roleCard,
                    role === item.role && styles.roleCardActive,
                  ]}
                  onPress={() => setRole(item.role)}
                >
                  <Ionicons
                    name={item.icon}
                    size={24}
                    color={role === item.role ? theme.colors.primary : theme.colors.textTertiary}
                  />
                  <Text
                    style={[
                      styles.roleLabel,
                      role === item.role && styles.roleLabelActive,
                    ]}
                  >
                    {t(`accounts.roles.${item.role}`)}
                  </Text>
                  <Text style={styles.roleDescription}>
                    {t(`accounts.roleDescriptions.${item.role}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
              onPress={handleInvite}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={theme.colors.textInverse} />
              ) : (
                <Text style={styles.submitButtonText}>{t('accounts.sendInvite')}</Text>
              )}
            </TouchableOpacity>
          </>
        )}
```

(This wraps the existing Role Selector + Submit button block that's already in the file — remove the old unconditional copies of those two sections so they aren't duplicated.)

Add these new styles to `createStyles`, alongside the existing ones:

```typescript
  searchEmptyText: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[3],
    textAlign: 'center' as const,
  },
  searchResultRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    marginTop: theme.spacing[2],
    gap: theme.spacing[3],
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  searchResultRowActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  searchResultAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  searchResultAvatarText: {
    color: theme.colors.textInverse,
    fontWeight: '600' as const,
  },
  searchResultName: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  searchResultEmail: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
```

- [ ] **Step 3: Typecheck**

Run from the project root: `npm run typecheck`
Expected: all 5 packages pass.

- [ ] **Step 4: Manual verification**

Attempt a live check via `npx expo start --web` (or an already-running dev server): open a shared/trip account's invite screen, switch to "Find user", type a 2+ character query, confirm results render and selecting one reveals the role picker. If the environment blocks a live check, note that explicitly.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/account/invite.tsx
git commit -m "feat(mobile): add Find user search mode to the invite screen"
```

---

### Task 13: i18n — new keys across all 9 locales

**Files:**
- Modify: `apps/mobile/src/i18n/locales/en.ts`, `de.ts`, `es.ts`, `fr.ts`, `pl.ts`, `ru.ts`, `ua.ts`, `be.ts`, `nl.ts`

**Interfaces:**
- Consumes: nothing — pure content addition.
- Produces: every `t('accounts.X')`/`t('alerts.X')` key referenced by Task 11 and Task 12.

- [ ] **Step 1: Add the new keys to `en.ts`**

In `apps/mobile/src/i18n/locales/en.ts`, in the `accounts` block, right after the existing `joinedSuccess: 'Successfully joined the account!',` line (currently line 609), add:

```typescript
    inviteBySearch: 'Find User',
    searchLabel: 'Search by name or email',
    searchPlaceholder: 'Type a name or email…',
    searchNoResults: 'No matching users found.',
    selectUserRequired: 'Please select a user to invite',
    inviteSentPush: '{{name}} will receive a notification to accept.',
```

In the `alerts` block, right after the existing `mergeBody: '{{amountA}} {{currencyA}} and {{amountB}} {{currencyB}} at {{merchant}} look like one transaction. Merge them?',` line (currently line 756), add:

```typescript
    tabAlerts: 'Alerts',
    tabInvitations: 'Invitations',
    invitationsEmpty: "No pending invitations. You'll see them here when someone invites you to their account.",
    invitationTitle: 'Invitation to "{{accountName}}"',
    invitationSubtitle: '{{inviterName}} invited you as {{role}}',
    invitationAccept: 'Accept',
    invitationDecline: 'Decline',
```

- [ ] **Step 2: Add the equivalent keys to the other 8 locales**

Repeat the same two insertions (same key names, translated values) in `de.ts`, `es.ts`, `fr.ts`, `pl.ts`, `ru.ts`, `ua.ts`, `be.ts`, `nl.ts` — find each file's `accounts.joinedSuccess` and `alerts` block (search for `joinedSuccess` and `mergeBody`/`mergeTitle` to locate the same insertion points) and insert translated equivalents. Use these translations:

`de.ts` — accounts:
```typescript
    inviteBySearch: 'Nutzer finden',
    searchLabel: 'Nach Name oder E-Mail suchen',
    searchPlaceholder: 'Name oder E-Mail eingeben…',
    searchNoResults: 'Keine passenden Nutzer gefunden.',
    selectUserRequired: 'Bitte einen Nutzer zum Einladen auswählen',
    inviteSentPush: '{{name}} erhält eine Benachrichtigung zum Annehmen.',
```
`de.ts` — alerts:
```typescript
    tabAlerts: 'Warnungen',
    tabInvitations: 'Einladungen',
    invitationsEmpty: 'Keine ausstehenden Einladungen. Du siehst sie hier, sobald dich jemand zu seinem Konto einlädt.',
    invitationTitle: 'Einladung zu "{{accountName}}"',
    invitationSubtitle: '{{inviterName}} hat dich als {{role}} eingeladen',
    invitationAccept: 'Annehmen',
    invitationDecline: 'Ablehnen',
```

`es.ts` — accounts:
```typescript
    inviteBySearch: 'Buscar usuario',
    searchLabel: 'Buscar por nombre o correo',
    searchPlaceholder: 'Escribe un nombre o correo…',
    searchNoResults: 'No se encontraron usuarios.',
    selectUserRequired: 'Selecciona un usuario para invitar',
    inviteSentPush: '{{name}} recibirá una notificación para aceptar.',
```
`es.ts` — alerts:
```typescript
    tabAlerts: 'Alertas',
    tabInvitations: 'Invitaciones',
    invitationsEmpty: 'No hay invitaciones pendientes. Las verás aquí cuando alguien te invite a su cuenta.',
    invitationTitle: 'Invitación a "{{accountName}}"',
    invitationSubtitle: '{{inviterName}} te invitó como {{role}}',
    invitationAccept: 'Aceptar',
    invitationDecline: 'Rechazar',
```

`fr.ts` — accounts:
```typescript
    inviteBySearch: 'Rechercher un utilisateur',
    searchLabel: 'Rechercher par nom ou e-mail',
    searchPlaceholder: 'Tapez un nom ou un e-mail…',
    searchNoResults: 'Aucun utilisateur trouvé.',
    selectUserRequired: 'Veuillez sélectionner un utilisateur à inviter',
    inviteSentPush: '{{name}} recevra une notification pour accepter.',
```
`fr.ts` — alerts:
```typescript
    tabAlerts: 'Alertes',
    tabInvitations: 'Invitations',
    invitationsEmpty: "Aucune invitation en attente. Vous les verrez ici lorsqu'on vous invitera à rejoindre un compte.",
    invitationTitle: 'Invitation à "{{accountName}}"',
    invitationSubtitle: "{{inviterName}} vous a invité(e) en tant que {{role}}",
    invitationAccept: 'Accepter',
    invitationDecline: 'Refuser',
```

`pl.ts` — accounts:
```typescript
    inviteBySearch: 'Znajdź użytkownika',
    searchLabel: 'Szukaj po imieniu lub e-mailu',
    searchPlaceholder: 'Wpisz imię lub e-mail…',
    searchNoResults: 'Nie znaleziono użytkowników.',
    selectUserRequired: 'Wybierz użytkownika do zaproszenia',
    inviteSentPush: '{{name}} otrzyma powiadomienie, aby zaakceptować.',
```
`pl.ts` — alerts:
```typescript
    tabAlerts: 'Alerty',
    tabInvitations: 'Zaproszenia',
    invitationsEmpty: 'Brak oczekujących zaproszeń. Pojawią się tutaj, gdy ktoś zaprosi Cię do swojego konta.',
    invitationTitle: 'Zaproszenie do "{{accountName}}"',
    invitationSubtitle: '{{inviterName}} zaprosił(a) Cię jako {{role}}',
    invitationAccept: 'Akceptuj',
    invitationDecline: 'Odrzuć',
```

`ru.ts` — accounts:
```typescript
    inviteBySearch: 'Найти пользователя',
    searchLabel: 'Поиск по имени или email',
    searchPlaceholder: 'Введите имя или email…',
    searchNoResults: 'Пользователи не найдены.',
    selectUserRequired: 'Выберите пользователя для приглашения',
    inviteSentPush: '{{name}} получит уведомление, чтобы принять приглашение.',
```
`ru.ts` — alerts:
```typescript
    tabAlerts: 'Оповещения',
    tabInvitations: 'Приглашения',
    invitationsEmpty: 'Нет ожидающих приглашений. Здесь появятся приглашения, когда кто-то пригласит вас в свой аккаунт.',
    invitationTitle: 'Приглашение в «{{accountName}}»',
    invitationSubtitle: '{{inviterName}} пригласил(а) вас как {{role}}',
    invitationAccept: 'Принять',
    invitationDecline: 'Отклонить',
```

`ua.ts` — accounts:
```typescript
    inviteBySearch: 'Знайти користувача',
    searchLabel: 'Пошук за ім\'ям або email',
    searchPlaceholder: 'Введіть ім\'я або email…',
    searchNoResults: 'Користувачів не знайдено.',
    selectUserRequired: 'Виберіть користувача для запрошення',
    inviteSentPush: '{{name}} отримає сповіщення, щоб прийняти запрошення.',
```
`ua.ts` — alerts:
```typescript
    tabAlerts: 'Сповіщення',
    tabInvitations: 'Запрошення',
    invitationsEmpty: 'Немає запрошень, що очікують. Вони з\'являться тут, коли хтось запросить вас у свій обліковий запис.',
    invitationTitle: 'Запрошення до «{{accountName}}»',
    invitationSubtitle: '{{inviterName}} запросив(ла) вас як {{role}}',
    invitationAccept: 'Прийняти',
    invitationDecline: 'Відхилити',
```

`be.ts` — accounts:
```typescript
    inviteBySearch: 'Знайсці карыстальніка',
    searchLabel: 'Пошук па імені ці email',
    searchPlaceholder: 'Увядзіце імя ці email…',
    searchNoResults: 'Карыстальнікаў не знойдзена.',
    selectUserRequired: 'Выберыце карыстальніка для запрашэння',
    inviteSentPush: '{{name}} атрымае апавяшчэнне, каб прыняць запрашэнне.',
```
`be.ts` — alerts:
```typescript
    tabAlerts: 'Апавяшчэнні',
    tabInvitations: 'Запрашэнні',
    invitationsEmpty: 'Няма запрашэнняў, якія чакаюць. Яны з\'явяцца тут, калі хтосьці запросіць вас у свой уліковы запіс.',
    invitationTitle: 'Запрашэнне ў «{{accountName}}»',
    invitationSubtitle: '{{inviterName}} запрасіў(ла) вас як {{role}}',
    invitationAccept: 'Прыняць',
    invitationDecline: 'Адхіліць',
```

`nl.ts` — accounts:
```typescript
    inviteBySearch: 'Gebruiker zoeken',
    searchLabel: 'Zoeken op naam of e-mail',
    searchPlaceholder: 'Typ een naam of e-mail…',
    searchNoResults: 'Geen gebruikers gevonden.',
    selectUserRequired: 'Selecteer een gebruiker om uit te nodigen',
    inviteSentPush: '{{name}} ontvangt een melding om te accepteren.',
```
`nl.ts` — alerts:
```typescript
    tabAlerts: 'Meldingen',
    tabInvitations: 'Uitnodigingen',
    invitationsEmpty: 'Geen openstaande uitnodigingen. Je ziet ze hier zodra iemand je uitnodigt voor zijn account.',
    invitationTitle: 'Uitnodiging voor "{{accountName}}"',
    invitationSubtitle: '{{inviterName}} heeft je uitgenodigd als {{role}}',
    invitationAccept: 'Accepteren',
    invitationDecline: 'Weigeren',
```

- [ ] **Step 3: Typecheck**

Run from the project root: `npm run typecheck`
Expected: all 5 packages pass (a mismatched key across locale files doesn't typically fail TypeScript unless the i18n types are strictly derived from `en.ts`'s shape — if `apps/mobile/src/i18n/index.ts` types other locales against `en.ts`'s keys via `typeof enTranslations`, a missing key in another locale WILL fail typecheck; treat any such error as a real gap to fix, not a false positive).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/i18n/locales/en.ts apps/mobile/src/i18n/locales/de.ts apps/mobile/src/i18n/locales/es.ts apps/mobile/src/i18n/locales/fr.ts apps/mobile/src/i18n/locales/pl.ts apps/mobile/src/i18n/locales/ru.ts apps/mobile/src/i18n/locales/ua.ts apps/mobile/src/i18n/locales/be.ts apps/mobile/src/i18n/locales/nl.ts
git commit -m "feat(i18n): add invite-by-search and invitations-tab keys to all 9 locales"
```

---

### Task 14: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full monorepo typecheck**

Run from the project root: `npm run typecheck`
Expected: all 5 packages pass.

- [ ] **Step 2: Full API test suite**

Run from `apps/api/`: `npx jest`
Expected: all tests pass, including every new test added in Tasks 3, 5, 6, 7. Compare failure count against the pre-existing baseline (documented in this repo's prior work as ~9 unrelated failures in `import-bank.service.spec.ts`/`chat.service.spec.ts`) — any NEW failure is a regression to fix before considering this plan done.

- [ ] **Step 3: Full mobile test suite**

Run from `apps/mobile/`: `npx jest`
Expected: all tests pass, including every new test added in Task 9. Compare failure count against the pre-existing baseline (documented in this repo's prior work as ~4 unrelated failures in notification-parser CZK/CHF tests) — any NEW failure is a regression to fix.

- [ ] **Step 4: Manual smoke test (if a live device/browser is available)**

As the owner of a shared or trip account: open the invite screen, switch to "Find user", search for a real second test user, select them, and send the invite. As that second user: open the Alerts screen, confirm the invitation appears under the "Invitations" tab, and confirm both Accept and Decline work (test each on a separate invitation). If no live device/browser is available in this environment, say so explicitly rather than claiming this was verified.
