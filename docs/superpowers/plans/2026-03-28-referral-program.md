# Referral Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a referral program where users earn bonus AI requests for inviting friends, with Stripe coupon and Ambassador badge milestones.

**Architecture:** New `referrals` NestJS module with cron job for qualification. Integrates with existing auth (registration flow), subscriptions (bonus AI limits), gamification (Ambassador badge), admin (dashboard page), and mobile (referral screen + settings entry).

**Tech Stack:** NestJS 10, Prisma 5, PostgreSQL, Stripe, Expo/React Native, Next.js 16, Zustand, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-28-referral-program-design.md`

---

## File Map

### Create (8 files)

| File | Responsibility |
|---|---|
| `apps/api/src/modules/referrals/referrals.module.ts` | NestJS module wiring |
| `apps/api/src/modules/referrals/referrals.service.ts` | Core referral logic: code generation, apply, qualify, bonus, milestones |
| `apps/api/src/modules/referrals/referrals.controller.ts` | REST endpoints: my-code, stats, list |
| `apps/api/src/modules/referrals/dto/index.ts` | Validation DTOs |
| `apps/api/src/modules/referrals/referral-qualification.cron.ts` | Daily cron: qualify pending referrals |
| `apps/mobile/src/stores/referralStore.ts` | Zustand store for referral data |
| `apps/mobile/app/referral.tsx` | Referral details screen |
| `apps/admin/src/app/referrals/page.tsx` | Admin referrals dashboard page |

### Modify (19+ files)

| File | Change |
|---|---|
| `apps/api/prisma/schema.prisma` | Add Referral model, ReferralStatus enum, User.referralCode, Subscription.bonusAiRequests |
| `packages/shared-types/src/dto/index.ts` | Add ReferralStatsDto, ReferralListItemDto, RegisterDto.referralCode |
| `apps/api/src/modules/auth/dto/index.ts` | Add referralCode to RegisterDto |
| `apps/api/src/modules/auth/auth.service.ts` | Apply referral code on registration |
| `apps/api/src/modules/auth/auth.module.ts` | Import ReferralsModule |
| `apps/api/src/modules/subscriptions/subscriptions.service.ts` | Add bonusAiRequests to limit check |
| `apps/api/src/modules/gamification/achievement-definitions.ts` | Add 'social' category, referral achievements |
| `apps/api/src/modules/gamification/gamification.service.ts` | Add referral count in checkAchievements |
| `apps/api/src/modules/admin/admin.service.ts` | Add referral stats + list methods |
| `apps/api/src/modules/admin/admin.controller.ts` | Add referral endpoints |
| `apps/api/src/app.module.ts` | Import ReferralsModule |
| `apps/mobile/src/services/api.ts` | Add referral + register referralCode methods |
| `apps/mobile/src/stores/authStore.ts` | Pass referralCode to register |
| `apps/mobile/app/(auth)/register.tsx` | Add referral code input |
| `apps/mobile/app/settings/index.tsx` | Add "Invite Friends" section |
| `apps/mobile/app/subscription.tsx` | Show bonus AI requests |
| `apps/mobile/src/i18n/locales/*.ts` | Add referral + gamification keys (x8 files) |
| `apps/admin/src/components/layout/app-sidebar.tsx` | Add Referrals nav item |

---

## Task 1: Prisma Schema + Migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add ReferralStatus enum**

Add after the existing `InvitationStatus` enum (search for `@@map("invitation_status")`):

```prisma
enum ReferralStatus {
  pending
  qualified
  expired

  @@map("referral_status")
}
```

- [ ] **Step 2: Add Referral model**

Add after the new enum:

```prisma
model Referral {
  id             String         @id @default(uuid())
  referrerUserId String         @map("referrer_user_id")
  referredUserId String         @unique @map("referred_user_id")
  code           String         @map("code")
  status         ReferralStatus @default(pending)
  bonusGranted   Boolean        @default(false) @map("bonus_granted")
  qualifiedAt    DateTime?      @map("qualified_at")
  createdAt      DateTime       @default(now()) @map("created_at")

  referrer User @relation("ReferralsMade", fields: [referrerUserId], references: [id])
  referred User @relation("ReferredBy", fields: [referredUserId], references: [id])

  @@index([referrerUserId])
  @@index([status, createdAt])
  @@map("referrals")
}
```

- [ ] **Step 3: Add fields to User model**

In the `User` model, add these fields (after `updatedAt`):

```prisma
  referralCode   String?    @unique @map("referral_code")
  referralsMade  Referral[] @relation("ReferralsMade")
  referredBy     Referral?  @relation("ReferredBy")
```

- [ ] **Step 4: Add bonusAiRequests to Subscription model**

In the `Subscription` model, add after `customAiLimit`:

```prisma
  bonusAiRequests Int @default(0) @map("bonus_ai_requests")
```

- [ ] **Step 5: Run migration**

```bash
cd apps/api && npx prisma migrate dev --name add-referral-program
```

Expected: Migration created successfully, Prisma client regenerated.

- [ ] **Step 6: Verify Prisma client generation**

```bash
cd apps/api && npx prisma generate
```

Expected: `Generated Prisma Client`

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/
git commit -m "feat(api): add referral program database schema (ABA-66)"
```

---

## Task 2: Shared Types — DTOs

**Files:**
- Modify: `packages/shared-types/src/dto/index.ts`

- [ ] **Step 1: Add referralCode to RegisterDto**

In `packages/shared-types/src/dto/index.ts`, add `referralCode` to the `RegisterDto` interface (line 6-12):

```typescript
export interface RegisterDto {
  email: string;
  password: string;
  name: string;
  currencyCode?: Currency;
  timezone?: string;
  referralCode?: string;
}
```

- [ ] **Step 2: Add ReferralStatsDto and ReferralListItemDto**

Add at end of file, before the closing:

```typescript
// Referral DTOs
export interface ReferralStatsDto {
  referralCode: string;
  totalReferrals: number;
  qualifiedReferrals: number;
  pendingReferrals: number;
  bonusAiRequests: number;
  nextMilestone: { count: number; reward: string } | null;
}

export interface ReferralListItemDto {
  id: string;
  referredName: string;
  status: 'pending' | 'qualified' | 'expired';
  createdAt: string;
  qualifiedAt: string | null;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared-types/
git commit -m "feat(shared-types): add referral DTOs (ABA-66)"
```

---

## Task 3: Referrals API Module — Service

**Files:**
- Create: `apps/api/src/modules/referrals/referrals.service.ts`

- [ ] **Step 1: Create the service file**

Create `apps/api/src/modules/referrals/referrals.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { TelegramService } from '../telegram/telegram.service';
import Stripe from 'stripe';
import * as crypto from 'crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const CODE_LENGTH = 6;
const BONUS_AI_REQUESTS = 30;

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
    private readonly telegramService: TelegramService,
  ) {
    const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.stripe = new Stripe(stripeKey || '', {
      apiVersion: '2026-01-28.clover',
    });
  }

  // ---- Code Generation ----

  private generateRandomCode(): string {
    const bytes = crypto.randomBytes(CODE_LENGTH);
    return Array.from(bytes)
      .map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
      .join('');
  }

  async generateCode(userId: string): Promise<string> {
    // Idempotent: return existing code if present
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { referralCode: true },
    });

    if (user.referralCode) return user.referralCode;

    // Generate unique code with retry on collision
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.generateRandomCode();
      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: { referralCode: code },
        });
        return code;
      } catch (error: any) {
        if (error.code === 'P2002') continue; // unique constraint violation, retry
        throw error;
      }
    }

    throw new Error('Failed to generate unique referral code after 5 attempts');
  }

  // ---- Apply Referral Code ----

  async applyReferralCode(referredUserId: string, code: string): Promise<void> {
    try {
      // Find referrer by code
      const referrer = await this.prisma.user.findUnique({
        where: { referralCode: code },
        select: { id: true, name: true },
      });

      if (!referrer) {
        this.logger.warn(`Invalid referral code: ${code}`);
        return;
      }

      // Self-referral prevention
      if (referrer.id === referredUserId) {
        this.logger.warn(`Self-referral attempt by user ${referredUserId}`);
        return;
      }

      // Create referral record (unique constraint on referredUserId prevents duplicates)
      await this.prisma.referral.create({
        data: {
          referrerUserId: referrer.id,
          referredUserId,
          code,
          status: 'pending',
        },
      });

      // Extend trial to 14 days for referred user
      const subscription = await this.prisma.subscription.findUnique({
        where: { userId: referredUserId },
      });

      if (subscription?.trialEnd) {
        const extendedTrialEnd = new Date(subscription.trialEnd);
        extendedTrialEnd.setDate(extendedTrialEnd.getDate() + 7);
        await this.prisma.subscription.update({
          where: { userId: referredUserId },
          data: { trialEnd: extendedTrialEnd },
        });
      }

      // Notify referrer
      const referred = await this.prisma.user.findUnique({
        where: { id: referredUserId },
        select: { name: true },
      });

      this.notificationsService.sendToUser(
        referrer.id,
        (lang: string) => lang === 'ru' ? '��овый реферал!' : 'New Referral!',
        (lang: string) => lang === 'ru'
          ? `Ваш друг ${referred?.name || ''} присоединился по вашему коду!`
          : `Your friend ${referred?.name || ''} joined using your referral code!`,
      ).catch(() => {});

      // Notify admin Telegram
      this.telegramService.sendMessage(
        `🤝 New referral: ${referred?.name} joined via ${referrer.name}'s code (${code})`,
      ).catch(() => {});
    } catch (error: any) {
      // P2002 = unique constraint (already referred)
      if (error.code === 'P2002') {
        this.logger.warn(`User ${referredUserId} already has a referral`);
        return;
      }
      this.logger.error(`Failed to apply referral code: ${error.message}`);
    }
  }

  // ---- Qualification ----

  async qualifyPendingReferrals(): Promise<void> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const pendingReferrals = await this.prisma.referral.findMany({
      where: {
        status: 'pending',
        createdAt: { lte: sevenDaysAgo },
      },
      include: {
        referred: { select: { id: true, name: true, isActive: true, lastSyncAt: true } },
        referrer: { select: { id: true, name: true, defaultAccountId: true } },
      },
    });

    for (const referral of pendingReferrals) {
      const isActive = referral.referred.isActive &&
        referral.referred.lastSyncAt &&
        referral.referred.lastSyncAt >= sevenDaysAgo;

      if (isActive) {
        await this.prisma.$transaction(async (tx) => {
          await tx.referral.update({
            where: { id: referral.id },
            data: { status: 'qualified', qualifiedAt: new Date() },
          });

          await this.grantReferralBonus(tx, referral.id, referral.referrer.id);
        });

        await this.checkMilestones(referral.referrer.id, referral.referrer.defaultAccountId);

        // Notify referrer
        this.notificationsService.sendToUser(
          referral.referrer.id,
          (lang: string) => lang === 'ru' ? 'Реферал подтверждён!' : 'Referral Qualified!',
          (lang: string) => lang === 'ru'
            ? `Ваш реферал ${referral.referred.name} активен! Вы получили +${BONUS_AI_REQUESTS} AI запросов.`
            : `Your referral ${referral.referred.name} is now active! You earned +${BONUS_AI_REQUESTS} AI requests.`,
        ).catch(() => {});

        this.telegramService.sendMessage(
          `✅ Referral qualified: ${referral.referred.name} (referrer: ${referral.referrer.name}, +${BONUS_AI_REQUESTS} AI requests)`,
        ).catch(() => {});
      } else if (referral.createdAt <= thirtyDaysAgo) {
        // Expire after 30 days of inactivity
        await this.prisma.referral.update({
          where: { id: referral.id },
          data: { status: 'expired' },
        });
      }
    }
  }

  // ---- Bonus Granting ----

  private async grantReferralBonus(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    referralId: string,
    referrerUserId: string,
  ): Promise<void> {
    // Check idempotency flag
    const referral = await tx.referral.findUniqueOrThrow({
      where: { id: referralId },
    });

    if (referral.bonusGranted) return;

    await tx.subscription.updateMany({
      where: { userId: referrerUserId },
      data: { bonusAiRequests: { increment: BONUS_AI_REQUESTS } },
    });

    await tx.referral.update({
      where: { id: referralId },
      data: { bonusGranted: true },
    });
  }

  // ---- Milestones ----

  async checkMilestones(referrerUserId: string, defaultAccountId?: string | null): Promise<void> {
    const qualifiedCount = await this.prisma.referral.count({
      where: { referrerUserId, status: 'qualified' },
    });

    // Milestone: 5 qualified referrals -> Stripe coupon
    if (qualifiedCount === 5) {
      await this.grantStripeCoupon(referrerUserId);
    }

    // Milestone: 10 qualified referrals -> Ambassador badge
    // (Handled via gamification checkAchievements — triggered by the caller)
  }

  private async grantStripeCoupon(userId: string): Promise<void> {
    const couponId = this.configService.get<string>('STRIPE_REFERRAL_COUPON_ID');
    if (!couponId) {
      this.logger.warn('STRIPE_REFERRAL_COUPON_ID not set, skipping coupon creation');
      return;
    }

    try {
      const promoCode = await this.stripe.promotionCodes.create({
        coupon: couponId,
        max_redemptions: 1,
      });

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });

      if (user?.email) {
        await this.mailService.sendMail(
          user.email,
          '🎉 You earned a free month of Pro!',
          `<h2>Congratulations, ${user.name}!</h2>
          <p>You've referred 5 friends and earned a <strong>free month of Pro</strong>!</p>
          <p>Use this promotion code at checkout: <strong>${promoCode.code}</strong></p>
          <p>Keep sharing to earn the Ambassador badge at 10 referrals!</p>`,
        );
      }

      this.notificationsService.sendToUser(
        userId,
        (lang: string) => lang === 'ru' ? '5 рефералов!' : '5 Referrals!',
        (lang: string) => lang === 'ru'
          ? 'Вы заработали бесплатный месяц Pro! Проверьте email.'
          : 'You earned a free month of Pro! Check your email.',
      ).catch(() => {});
    } catch (error) {
      this.logger.error(`Failed to create Stripe coupon for user ${userId}: ${error}`);
    }
  }

  // ---- Stats & List ----

  async getStats(userId: string) {
    const code = await this.generateCode(userId);

    const [total, qualified, pending, subscription] = await Promise.all([
      this.prisma.referral.count({ where: { referrerUserId: userId } }),
      this.prisma.referral.count({ where: { referrerUserId: userId, status: 'qualified' } }),
      this.prisma.referral.count({ where: { referrerUserId: userId, status: 'pending' } }),
      this.prisma.subscription.findUnique({ where: { userId }, select: { bonusAiRequests: true } }),
    ]);

    let nextMilestone: { count: number; reward: string } | null = null;
    if (qualified < 5) {
      nextMilestone = { count: 5, reward: 'free_pro_month' };
    } else if (qualified < 10) {
      nextMilestone = { count: 10, reward: 'ambassador_badge' };
    }

    return {
      referralCode: code,
      totalReferrals: total,
      qualifiedReferrals: qualified,
      pendingReferrals: pending,
      bonusAiRequests: subscription?.bonusAiRequests ?? 0,
      nextMilestone,
    };
  }

  async getList(userId: string) {
    const referrals = await this.prisma.referral.findMany({
      where: { referrerUserId: userId },
      include: { referred: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return referrals.map((r) => ({
      id: r.id,
      referredName: r.referred.name,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      qualifiedAt: r.qualifiedAt?.toISOString() ?? null,
    }));
  }

  // ---- Admin ----

  async getAdminStats() {
    const [total, qualified, expired, pending] = await Promise.all([
      this.prisma.referral.count(),
      this.prisma.referral.count({ where: { status: 'qualified' } }),
      this.prisma.referral.count({ where: { status: 'expired' } }),
      this.prisma.referral.count({ where: { status: 'pending' } }),
    ]);

    const bonusResult = await this.prisma.subscription.aggregate({
      _sum: { bonusAiRequests: true },
    });

    const activeReferrers = await this.prisma.referral.groupBy({
      by: ['referrerUserId'],
      _count: true,
    });

    return {
      totalReferrals: total,
      qualifiedReferrals: qualified,
      expiredReferrals: expired,
      pendingReferrals: pending,
      qualifiedRate: total > 0 ? Math.round((qualified / total) * 100) : 0,
      totalBonusAiRequests: bonusResult._sum.bonusAiRequests ?? 0,
      activeReferrers: activeReferrers.length,
    };
  }

  async getAdminList(options: { status?: string; page?: number; limit?: number }) {
    const { status, page = 1, limit = 20 } = options;
    const where = status && status !== 'all' ? { status: status as any } : {};

    const [referrals, total] = await Promise.all([
      this.prisma.referral.findMany({
        where,
        include: {
          referrer: { select: { name: true, email: true } },
          referred: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.referral.count({ where }),
    ]);

    return {
      data: referrals.map((r) => ({
        id: r.id,
        referrerName: r.referrer.name,
        referrerEmail: r.referrer.email,
        referredName: r.referred.name,
        referredEmail: r.referred.email,
        code: r.code,
        status: r.status,
        bonusGranted: r.bonusGranted,
        createdAt: r.createdAt.toISOString(),
        qualifiedAt: r.qualifiedAt?.toISOString() ?? null,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }
}
```

- [ ] **Step 2: Verify no TypeScript errors in the service**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -20
```

Expected: May have errors about missing module/controller — those come next.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/referrals/referrals.service.ts
git commit -m "feat(api): add referrals service with core business logic (ABA-66)"
```

---

## Task 4: Referrals API Module — DTOs, Controller, Cron, Module

**Files:**
- Create: `apps/api/src/modules/referrals/dto/index.ts`
- Create: `apps/api/src/modules/referrals/referrals.controller.ts`
- Create: `apps/api/src/modules/referrals/referral-qualification.cron.ts`
- Create: `apps/api/src/modules/referrals/referrals.module.ts`

- [ ] **Step 1: Create DTOs**

Create `apps/api/src/modules/referrals/dto/index.ts`:

```typescript
// Referral DTOs — currently empty, admin queries use inline @Query() params.
// Add DTOs here if endpoints grow more complex.
export {};
```

- [ ] **Step 2: Create controller**

Create `apps/api/src/modules/referrals/referrals.controller.ts`:

```typescript
import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../common/types';

@Controller('referrals')
@UseGuards(JwtAuthGuard)
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get('my-code')
  async getMyCode(@Request() req: AuthenticatedRequest) {
    const code = await this.referralsService.generateCode(req.user.id);
    return { code };
  }

  @Get('stats')
  async getStats(@Request() req: AuthenticatedRequest) {
    return this.referralsService.getStats(req.user.id);
  }

  @Get('list')
  async getList(@Request() req: AuthenticatedRequest) {
    return this.referralsService.getList(req.user.id);
  }
}
```

- [ ] **Step 3: Create cron service**

Create `apps/api/src/modules/referrals/referral-qualification.cron.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReferralsService } from './referrals.service';

@Injectable()
export class ReferralQualificationCron {
  private readonly logger = new Logger(ReferralQualificationCron.name);

  constructor(private readonly referralsService: ReferralsService) {}

  @Cron('0 3 * * *') // Daily at 3:00 AM UTC
  async handleQualification() {
    this.logger.log('Starting referral qualification check...');
    try {
      await this.referralsService.qualifyPendingReferrals();
      this.logger.log('Referral qualification check completed');
    } catch (error) {
      this.logger.error(`Referral qualification failed: ${error}`);
    }
  }
}
```

- [ ] **Step 4: Create module**

Create `apps/api/src/modules/referrals/referrals.module.ts`:

```typescript
import { Module, forwardRef } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { ReferralsController } from './referrals.controller';
import { ReferralQualificationCron } from './referral-qualification.cron';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [
    NotificationsModule,
    MailModule,
    forwardRef(() => TelegramModule),
  ],
  controllers: [ReferralsController],
  providers: [ReferralsService, ReferralQualificationCron],
  exports: [ReferralsService],
})
export class ReferralsModule {}
```

- [ ] **Step 5: Register in AppModule**

In `apps/api/src/app.module.ts`:

Add import at top (after line 32):
```typescript
import { ReferralsModule } from './modules/referrals/referrals.module';
```

Add `ReferralsModule` to the imports array (after `DebtsModule` at line 85):
```typescript
    DebtsModule,
    ReferralsModule,
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: No errors (or only pre-existing ones).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/referrals/ apps/api/src/app.module.ts
git commit -m "feat(api): add referrals controller, DTOs, cron, module (ABA-66)"
```

---

## Task 5: Auth Integration

**Files:**
- Modify: `apps/api/src/modules/auth/dto/index.ts` (line 3-26)
- Modify: `apps/api/src/modules/auth/auth.service.ts` (line 1-24, 40-92)
- Modify: `apps/api/src/modules/auth/auth.module.ts` (line 1-35)

- [ ] **Step 1: Add referralCode to auth RegisterDto**

In `apps/api/src/modules/auth/dto/index.ts`, add after the `timezone` field (line 25):

```typescript
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{4,10}$/, { message: 'Invalid referral code format' })
  referralCode?: string;
```

- [ ] **Step 2: Import ReferralsModule in AuthModule**

In `apps/api/src/modules/auth/auth.module.ts`:

Add import (after line 11):
```typescript
import { ReferralsModule } from '../referrals/referrals.module';
```

Add to imports array (after `MailModule` at line 17):
```typescript
    ReferralsModule,
```

- [ ] **Step 3: Inject ReferralsService in AuthService**

In `apps/api/src/modules/auth/auth.service.ts`:

Add import (after line 10):
```typescript
import { ReferralsService } from '../referrals/referrals.service';
```

Add to constructor (after line 23):
```typescript
    private readonly referralsService: ReferralsService,
```

- [ ] **Step 4: Apply referral code after user creation**

In `apps/api/src/modules/auth/auth.service.ts`, after the `adminGateway.emitNewUser` call (after line 66) and before "Create default personal account" (line 68), add:

```typescript
    // Apply referral code if provided
    if (dto.referralCode) {
      await this.referralsService.applyReferralCode(user.id, dto.referralCode);
    }
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/auth/
git commit -m "feat(api): integrate referral code in registration flow (ABA-66)"
```

---

## Task 6: Subscription Integration — Bonus AI Requests

**Files:**
- Modify: `apps/api/src/modules/subscriptions/subscriptions.service.ts` (lines 100-122, 328-336)

- [ ] **Step 1: Update getUsageStats to include bonusAiRequests**

In `apps/api/src/modules/subscriptions/subscriptions.service.ts`, find the `getUsageStats` method.

Change line 111 from:
```typescript
    const limit = refreshedSub?.customAiLimit ?? tierLimit;
```
to:
```typescript
    const limit = (refreshedSub?.customAiLimit ?? tierLimit) + (refreshedSub?.bonusAiRequests ?? 0);
```

Also add `bonusAiRequests` to the return object (after `percentUsed` around line 119):
```typescript
      bonusAiRequests: refreshedSub?.bonusAiRequests ?? 0,
```

- [ ] **Step 2: Update trackAiUsage to include bonusAiRequests**

In the same file, find `trackAiUsage` method.

Change line 335 from:
```typescript
    const limit = current.customAiLimit ?? tierLimit;
```
to:
```typescript
    const limit = (current.customAiLimit ?? tierLimit) + (current.bonusAiRequests ?? 0);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/subscriptions/
git commit -m "feat(api): include bonusAiRequests in AI limit calculation (ABA-66)"
```

---

## Task 7: Gamification Integration — Referral Achievements

**Files:**
- Modify: `apps/api/src/modules/gamification/achievement-definitions.ts` (lines 1-43)
- Modify: `apps/api/src/modules/gamification/gamification.service.ts` (lines 60-234)

- [ ] **Step 1: Add 'social' category and referral achievements**

In `apps/api/src/modules/gamification/achievement-definitions.ts`:

Update the `category` type on line 3:
```typescript
  category: 'budget' | 'tracking' | 'streak' | 'milestone' | 'savings' | 'social';
```

Add before the closing `];` (after line 33, before line 34):
```typescript

  // Social achievements (referrals)
  { id: 'referrals_5', category: 'social', icon: '🤝', rarity: 'epic', threshold: 5, xpReward: 150, titleKey: 'gamification.achievements.referrals5.title', descriptionKey: 'gamification.achievements.referrals5.description' },
  { id: 'referrals_10_ambassador', category: 'social', icon: '🏅', rarity: 'legendary', threshold: 10, xpReward: 500, titleKey: 'gamification.achievements.ambassador.title', descriptionKey: 'gamification.achievements.ambassador.description' },
```

- [ ] **Step 2: Add referral count check in gamification service**

In `apps/api/src/modules/gamification/gamification.service.ts`, inside `checkAchievements()`:

After the existing data gathering (after line 79, the `Promise.all` block), add:

```typescript
    // Referral achievements (user-global, stored on defaultAccountId)
    const referralCount = await this.prisma.referral.count({
      where: { referrerUserId: userId, status: 'qualified' },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { defaultAccountId: true },
    });
    const referralAccountId = user?.defaultAccountId || accountId;
```

Then in the `switch` block (after the `net_positive_month` case, before the closing of the switch around line 194), add:

```typescript
        case 'referrals_5':
        case 'referrals_10_ambassador': {
          progress = Math.min(100, Math.round((referralCount / (def.threshold || 1)) * 100));
          completed = referralCount >= (def.threshold || 1);
          break;
        }
```

And update the upsert block: for referral achievements, use `referralAccountId` instead of `accountId`. In the existing upsert logic (line 197-233), wrap the `accountId` reference:

Replace the `findUnique` where clause (line 199) to handle referral achievements:
```typescript
      const achievementAccountId = def.category === 'social' ? referralAccountId : accountId;
```

Then use `achievementAccountId` in place of `accountId` in the `findUnique` where clause and `create` data within the achievement evaluation loop. Specifically:

Change the `findUnique` (line 198-201) from using `accountId` to `achievementAccountId`:
```typescript
      const existing = await this.prisma.userAchievement.findUnique({
        where: {
          userId_accountId_achievementId: { userId, accountId: achievementAccountId, achievementId: def.id },
        },
      });
```

And in the `create` call (line 218), change `accountId` to `achievementAccountId`:
```typescript
        await this.prisma.userAchievement.create({
          data: {
            userId,
            accountId: achievementAccountId,
            achievementId: def.id,
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/gamification/
git commit -m "feat(api): add referral achievements to gamification system (ABA-66)"
```

---

## Task 8: Admin API Endpoints

**Files:**
- Modify: `apps/api/src/modules/admin/admin.controller.ts`
- Modify: `apps/api/src/modules/admin/admin.service.ts`

- [ ] **Step 1: Add ReferralsService to admin controller directly**

In `apps/api/src/modules/admin/admin.controller.ts`:

Add import:
```typescript
import { ReferralsService } from '../referrals/referrals.service';
```

Add to constructor (the admin controller already injects `AdminService`):
```typescript
    private readonly referralsService: ReferralsService,
```

Add endpoints (before the last closing brace):

```typescript
  @Get('referrals/stats')
  async getReferralStats() {
    return this.referralsService.getAdminStats();
  }

  @Get('referrals')
  async getReferralList(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.referralsService.getAdminList({
      status,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }
```

Add `Query` to the imports from `@nestjs/common` if not already there.

- [ ] **Step 2: Import ReferralsModule in AdminModule**

In `apps/api/src/modules/admin/admin.module.ts`, add import:
```typescript
import { ReferralsModule } from '../referrals/referrals.module';
```

Add `ReferralsModule` to the imports array. If circular dependency arises (AuthModule -> AdminModule -> ReferralsModule -> TelegramModule), use `forwardRef(() => ReferralsModule)`.

Note: `AdminService` does NOT need modification — the admin referral endpoints call `ReferralsService` directly from the controller.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/
git commit -m "feat(api): add referral endpoints to admin API (ABA-66)"
```

---

## Task 9: Mobile — API Client + Auth Store

**Files:**
- Modify: `apps/mobile/src/services/api.ts` (lines 150-158)
- Modify: `apps/mobile/src/stores/authStore.ts` (lines 168-230)

- [ ] **Step 1: Add referralCode to api.register()**

In `apps/mobile/src/services/api.ts`, update the `register` method (line 150):

```typescript
  async register(email: string, password: string, name: string, currencyCode?: string, referralCode?: string) {
    return this.request<{ accessToken: string; refreshToken: string; user: any; accounts: Account[] }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({ email, password, name, currencyCode, referralCode }),
        skipAuth: true,
      },
    );
  }
```

- [ ] **Step 2: Add referral API methods**

In the same file, add after the `resetPassword` method (after line 175):

```typescript
  // Referral endpoints
  async getReferralCode() {
    return this.request<{ code: string }>('/referrals/my-code');
  }

  async getReferralStats() {
    return this.request<any>('/referrals/stats');
  }

  async getReferralList() {
    return this.request<any[]>('/referrals/list');
  }
```

- [ ] **Step 3: Update authStore.register to pass referralCode**

In `apps/mobile/src/stores/authStore.ts`, update the register method signature (line 168):

```typescript
      register: async (email: string, password: string, name: string, currencyCode?: string, referralCode?: string) => {
```

And update the api call (line 171):
```typescript
          const response = await api.register(email, password, name, currencyCode, referralCode);
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/services/api.ts apps/mobile/src/stores/authStore.ts
git commit -m "feat(mobile): add referral API client and auth store integration (ABA-66)"
```

---

## Task 10: Mobile — Referral Store

**Files:**
- Create: `apps/mobile/src/stores/referralStore.ts`

- [ ] **Step 1: Create referral store**

Create `apps/mobile/src/stores/referralStore.ts`:

```typescript
import { create } from 'zustand';
import { api } from '../services/api';
import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { ReferralStatsDto, ReferralListItemDto } from '@budget/shared-types';

interface ReferralState {
  code: string | null;
  stats: ReferralStatsDto | null;
  referrals: ReferralListItemDto[];
  isLoading: boolean;
  error: string | null;

  loadCode: () => Promise<void>;
  loadStats: () => Promise<void>;
  loadReferrals: () => Promise<void>;
  shareCode: () => Promise<void>;
  copyCode: () => Promise<boolean>;
  reset: () => void;
}

export const useReferralStore = create<ReferralState>()((set, get) => ({
  code: null,
  stats: null,
  referrals: [],
  isLoading: false,
  error: null,

  loadCode: async () => {
    try {
      const result = await api.getReferralCode();
      set({ code: result.code });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load referral code' });
    }
  },

  loadStats: async () => {
    set({ isLoading: true, error: null });
    try {
      const stats = await api.getReferralStats();
      set({ stats, code: stats.referralCode, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load referral stats',
        isLoading: false,
      });
    }
  },

  loadReferrals: async () => {
    try {
      const referrals = await api.getReferralList();
      set({ referrals });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load referrals' });
    }
  },

  shareCode: async () => {
    const { code } = get();
    if (!code) return;
    try {
      await Share.share({
        message: `Join AI Budget Assistant with my referral code: ${code}. You'll get an extended 14-day trial!`,
      });
    } catch {
      // User cancelled share
    }
  },

  copyCode: async () => {
    const { code } = get();
    if (!code) return false;
    await Clipboard.setStringAsync(code);
    return true;
  },

  reset: () => set({ code: null, stats: null, referrals: [], isLoading: false, error: null }),
}));
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/stores/referralStore.ts
git commit -m "feat(mobile): add referral Zustand store (ABA-66)"
```

---

## Task 11: Mobile — Registration Screen

**Files:**
- Modify: `apps/mobile/app/(auth)/register.tsx` (around line 100)

- [ ] **Step 1: Add referralCode state and input**

In `apps/mobile/app/(auth)/register.tsx`:

Add state variable (near the other state declarations):
```typescript
const [referralCode, setReferralCode] = useState('');
```

Update the `register()` call (line 100) to pass referralCode:
```typescript
await register(email, password, name, currencyCode, referralCode || undefined);
```

Add a text input for referral code in the form JSX, before the Register button. Find the terms/register button area and add above it:

```tsx
<TextInput
  style={styles.input}
  placeholder={t('referral.codeOptional')}
  value={referralCode}
  onChangeText={(text) => setReferralCode(text.toUpperCase())}
  autoCapitalize="characters"
  maxLength={10}
/>
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/app/(auth)/register.tsx
git commit -m "feat(mobile): add referral code input to registration screen (ABA-66)"
```

---

## Task 12: Mobile — Referral Screen

**Files:**
- Create: `apps/mobile/app/referral.tsx`

- [ ] **Step 1: Create the referral screen**

Create `apps/mobile/app/referral.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../src/hooks/useTheme';
import { useStyles } from '../src/hooks/useStyles';
import { useReferralStore } from '../src/stores/referralStore';
import type { ReferralListItemDto } from '@budget/shared-types';

export default function ReferralScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { stats, referrals, isLoading, loadStats, loadReferrals, shareCode, copyCode } = useReferralStore();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadStats();
    loadReferrals();
  }, []);

  const handleCopy = async () => {
    const success = await copyCode();
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'qualified': return theme.colors.success;
      case 'pending': return theme.colors.warning;
      case 'expired': return theme.colors.textTertiary;
      default: return theme.colors.textSecondary;
    }
  };

  const renderReferral = ({ item }: { item: ReferralListItemDto }) => (
    <View style={styles.referralItem}>
      <View style={styles.referralInfo}>
        <Text style={styles.referralName}>{item.referredName}</Text>
        <Text style={styles.referralDate}>
          {new Date(item.createdAt).toLocaleDateString()}
        </Text>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
        <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
          {t(`referral.status${item.status.charAt(0).toUpperCase() + item.status.slice(1)}`)}
        </Text>
      </View>
    </View>
  );

  if (isLoading && !stats) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: t('referral.title') }} />
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const milestoneProgress = stats?.nextMilestone
    ? stats.qualifiedReferrals / stats.nextMilestone.count
    : 1;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('referral.title') }} />

      <FlatList
        data={referrals}
        keyExtractor={(item) => item.id}
        renderItem={renderReferral}
        ListHeaderComponent={
          <View>
            {/* Code Card */}
            <View style={styles.codeCard}>
              <Text style={styles.codeLabel}>{t('referral.code')}</Text>
              <Text style={styles.codeValue}>{stats?.referralCode || '...'}</Text>
              <View style={styles.codeActions}>
                <TouchableOpacity style={styles.codeButton} onPress={handleCopy}>
                  <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={20} color={theme.colors.primary} />
                  <Text style={styles.codeButtonText}>
                    {copied ? t('referral.copied') : t('referral.copy')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.codeButton, styles.shareButton]} onPress={shareCode}>
                  <Ionicons name="share-outline" size={20} color="#fff" />
                  <Text style={[styles.codeButtonText, { color: '#fff' }]}>{t('referral.share')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats?.totalReferrals ?? 0}</Text>
                <Text style={styles.statLabel}>{t('referral.totalReferrals')}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats?.qualifiedReferrals ?? 0}</Text>
                <Text style={styles.statLabel}>{t('referral.qualifiedReferrals')}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats?.pendingReferrals ?? 0}</Text>
                <Text style={styles.statLabel}>{t('referral.pendingReferrals')}</Text>
              </View>
            </View>

            {/* Bonus */}
            {(stats?.bonusAiRequests ?? 0) > 0 && (
              <View style={styles.bonusCard}>
                <Ionicons name="sparkles" size={24} color={theme.colors.primary} />
                <Text style={styles.bonusText}>
                  +{stats?.bonusAiRequests} {t('referral.bonusRequests')}
                </Text>
              </View>
            )}

            {/* Milestone */}
            {stats?.nextMilestone && (
              <View style={styles.milestoneCard}>
                <Text style={styles.milestoneTitle}>{t('referral.nextMilestone')}</Text>
                <View style={styles.milestoneProgress}>
                  <View style={styles.milestoneTrack}>
                    <View style={[styles.milestoneFill, { width: `${Math.min(milestoneProgress * 100, 100)}%` }]} />
                  </View>
                  <Text style={styles.milestoneCount}>
                    {stats.qualifiedReferrals}/{stats.nextMilestone.count}
                  </Text>
                </View>
                <Text style={styles.milestoneReward}>
                  {stats.nextMilestone.reward === 'free_pro_month'
                    ? t('referral.milestone5')
                    : t('referral.milestone10')}
                </Text>
              </View>
            )}

            {/* List header */}
            {referrals.length > 0 && (
              <Text style={styles.listHeader}>{t('referral.stats')}</Text>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color={theme.colors.textTertiary} />
            <Text style={styles.emptyText}>{t('referral.emptyList')}</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const createStyles = (theme: any) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, justifyContent: 'center' as const, alignItems: 'center' as const, backgroundColor: theme.colors.background },
  listContent: { padding: 16 },
  codeCard: { backgroundColor: theme.colors.card, borderRadius: 16, padding: 20, marginBottom: 16, alignItems: 'center' as const },
  codeLabel: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 8 },
  codeValue: { fontSize: 32, fontWeight: '700' as const, color: theme.colors.text, letterSpacing: 4, marginBottom: 16 },
  codeActions: { flexDirection: 'row' as const, gap: 12 },
  codeButton: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.primary },
  codeButtonText: { fontSize: 14, fontWeight: '600' as const, color: theme.colors.primary },
  shareButton: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  statsRow: { flexDirection: 'row' as const, justifyContent: 'space-around' as const, backgroundColor: theme.colors.card, borderRadius: 16, padding: 16, marginBottom: 16 },
  statItem: { alignItems: 'center' as const },
  statValue: { fontSize: 24, fontWeight: '700' as const, color: theme.colors.text },
  statLabel: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  bonusCard: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, backgroundColor: theme.colors.primary + '15', borderRadius: 12, padding: 16, marginBottom: 16 },
  bonusText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.primary },
  milestoneCard: { backgroundColor: theme.colors.card, borderRadius: 16, padding: 16, marginBottom: 16 },
  milestoneTitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 8 },
  milestoneProgress: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  milestoneTrack: { flex: 1, height: 8, backgroundColor: theme.colors.border, borderRadius: 4, overflow: 'hidden' as const },
  milestoneFill: { height: '100%' as const, backgroundColor: theme.colors.primary, borderRadius: 4 },
  milestoneCount: { fontSize: 14, fontWeight: '600' as const, color: theme.colors.text },
  milestoneReward: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 8 },
  listHeader: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.text, marginBottom: 12, marginTop: 8 },
  referralItem: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, backgroundColor: theme.colors.card, borderRadius: 12, padding: 14, marginBottom: 8 },
  referralInfo: { flex: 1 },
  referralName: { fontSize: 15, fontWeight: '500' as const, color: theme.colors.text },
  referralDate: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '600' as const },
  emptyState: { alignItems: 'center' as const, paddingVertical: 48 },
  emptyText: { fontSize: 15, color: theme.colors.textTertiary, marginTop: 12 },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/app/referral.tsx
git commit -m "feat(mobile): add referral details screen (ABA-66)"
```

---

## Task 13: Mobile — Settings + Subscription Integration

**Files:**
- Modify: `apps/mobile/app/settings/index.tsx` (lines 26-87)
- Modify: `apps/mobile/app/subscription.tsx` (lines 159-200)

- [ ] **Step 1: Add "Invite Friends" to settings**

In `apps/mobile/app/settings/index.tsx`, add a new entry to the `categories` array (after the `about` entry, before the closing `];` at line 87):

```typescript
    {
      icon: 'people-outline',
      label: t('referral.settingsTitle'),
      description: t('referral.settingsSubtitle'),
      route: '/referral',
    },
```

- [ ] **Step 2: Show bonus AI requests in subscription screen**

In `apps/mobile/app/subscription.tsx`, find the usage display (line 166-168):

```tsx
<Text style={styles.usageValue}>
  {aiRequestsUsed} / {aiRequestsLimit === Infinity ? '∞' : aiRequestsLimit}
</Text>
```

The `bonusAiRequests` value needs to come from the subscription store. First add it to the store destructuring at the top of the component (find where `aiRequestsUsed`, `aiRequestsLimit`, `percentUsed` are destructured from the store):

Add `bonusAiRequests` to the destructured values. Then update the usage display to:

```tsx
<Text style={styles.usageValue}>
  {aiRequestsUsed} / {aiRequestsLimit === Infinity ? '∞' : aiRequestsLimit}
  {bonusAiRequests > 0 ? ` (+${bonusAiRequests})` : ''}
</Text>
```

Note: The `bonusAiRequests` comes from the `getUsageStats` API response which we updated in Task 6 to include it. The subscription store's `loadUsage` method needs to store this value. Add `bonusAiRequests: number;` to the `SubscriptionState` interface and set it in `loadUsage`.

- [ ] **Step 3: Update subscription store**

In `apps/mobile/src/stores/subscriptionStore.ts`:

Add to interface (after `percentUsed: number;` line 16):
```typescript
  bonusAiRequests: number;
```

Add initial value (after `percentUsed` initial value):
```typescript
  bonusAiRequests: 0,
```

In `loadUsage` method, add to the `set()` call:
```typescript
  bonusAiRequests: usage.bonusAiRequests ?? 0,
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/settings/index.tsx apps/mobile/app/subscription.tsx apps/mobile/src/stores/subscriptionStore.ts
git commit -m "feat(mobile): add referral settings entry and bonus display (ABA-66)"
```

---

## Task 14: Mobile — i18n (all 8 locales)

**Files:**
- Modify: `apps/mobile/src/i18n/locales/en.ts`
- Modify: `apps/mobile/src/i18n/locales/ru.ts`
- Modify: `apps/mobile/src/i18n/locales/ua.ts`
- Modify: `apps/mobile/src/i18n/locales/de.ts`
- Modify: `apps/mobile/src/i18n/locales/es.ts`
- Modify: `apps/mobile/src/i18n/locales/fr.ts`
- Modify: `apps/mobile/src/i18n/locales/pl.ts`
- Modify: `apps/mobile/src/i18n/locales/be.ts`

- [ ] **Step 1: Add referral keys to en.ts**

In `apps/mobile/src/i18n/locales/en.ts`, add before the closing `} as const;` (before line 1457):

```typescript
  referral: {
    title: 'Invite Friends',
    code: 'Your Referral Code',
    share: 'Share',
    copy: 'Copy',
    copied: 'Copied!',
    codeOptional: 'Referral code (optional)',
    stats: 'Your Referrals',
    totalReferrals: 'Total',
    qualifiedReferrals: 'Active',
    pendingReferrals: 'Pending',
    bonusRequests: 'bonus AI requests',
    milestone5: 'Free month of Pro',
    milestone10: 'Ambassador badge',
    statusPending: 'Pending',
    statusQualified: 'Active',
    statusExpired: 'Expired',
    extendedTrial: '14-day extended trial',
    shareText: 'Join AI Budget Assistant with my code {{code}}! Get an extended 14-day trial.',
    settingsTitle: 'Invite Friends',
    settingsSubtitle: 'Share your code, earn bonus AI requests',
    emptyList: 'Share your code to start earning rewards',
    nextMilestone: 'Next Milestone',
    friendJoined: '{{name}} joined using your code!',
    friendQualified: '{{name}} is now active! +30 AI requests earned.',
  },
```

Also add to the `gamification.categories` section (after `savings: 'Savings',` at line 1012):
```typescript
      social: 'Social',
```

Add to `gamification.achievements` (after `netPositiveMonth` at line 1028):
```typescript
      referrals5: { title: 'Community Builder', description: 'Refer 5 friends who stay active' },
      ambassador: { title: 'Ambassador', description: 'Refer 10 friends — you are a legend!' },
```

Add to `settingsNav` (after `categoriesDesc` at line 1415):
```typescript
    referral: 'Invite Friends',
    referralDesc: 'Share your code, earn bonus AI requests',
```

- [ ] **Step 2: Add referral keys to ru.ts**

Same structure, Russian translations:

```typescript
  referral: {
    title: 'Пригласить друзей',
    code: 'Ваш реферальный код',
    share: 'Поделиться',
    copy: 'Скопировать',
    copied: '��копировано!',
    codeOptional: 'Реферальный код (необязательно)',
    stats: 'Ваши рефералы',
    totalReferrals: 'Всего',
    qualifiedReferrals: 'Активные',
    pendingReferrals: 'Ожидают',
    bonusRequests: 'бонусных AI запросов',
    milestone5: 'Бесплатный месяц Pro',
    milestone10: 'Бейдж Амбассадора',
    statusPending: 'Ожидает',
    statusQualified: 'Активный',
    statusExpired: 'Истёк',
    extendedTrial: '14-дневный расширенный пробный период',
    shareText: 'Присоединяйся к AI Budget Assistant с моим кодом {{code}}! Получи 14-дневный пробный период.',
    settingsTitle: 'Пригласить друзей',
    settingsSubtitle: 'Делитесь кодом, получайте бонусные AI запросы',
    emptyList: 'Поделитесь кодом, чтобы начать получать награды',
    nextMilestone: 'Следующая цель',
    friendJoined: '{{name}} присоединился по в��шему коду!',
    friendQualified: '{{name}} теперь активен! +30 AI запросов получено.',
  },
```

Plus gamification additions:
```typescript
      social: 'Социальное',
```
```typescript
      referrals5: { title: 'Строитель сообщества', description: 'Пригласите 5 друзей, которые останутся активными' },
      ambassador: { title: 'Амбассадор', description: 'Пригласите 10 друзей — вы легенда!' },
```

- [ ] **Step 3: Add referral keys to remaining 6 locales**

Add the same `referral` section + gamification additions to `ua.ts`, `de.ts`, `es.ts`, `fr.ts`, `pl.ts`, `be.ts` with appropriate translations for each language.

For each locale, translate:
- `ua.ts` — Ukrainian
- `de.ts` — German
- `es.ts` — Spanish
- `fr.ts` — French
- `pl.ts` — Polish
- `be.ts` — Belarusian

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/i18n/locales/
git commit -m "feat(mobile): add referral i18n keys for all 8 locales (ABA-66)"
```

---

## Task 15: Admin Dashboard — Referrals Page

**Files:**
- Create: `apps/admin/src/app/referrals/page.tsx`
- Modify: `apps/admin/src/components/layout/app-sidebar.tsx` (lines 25-33)

- [ ] **Step 1: Add Referrals to sidebar navigation**

In `apps/admin/src/components/layout/app-sidebar.tsx`:

Add import:
```typescript
import { UserPlus } from "lucide-react";
```

Add to `navItems` array (after Communications at line 30):
```typescript
  { href: "/referrals", label: "Referrals", icon: UserPlus },
```

- [ ] **Step 2: Create referrals admin page**

Create `apps/admin/src/app/referrals/page.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Users, CheckCircle, Clock, Gift, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";

interface ReferralStats {
  totalReferrals: number;
  qualifiedReferrals: number;
  pendingReferrals: number;
  expiredReferrals: number;
  qualifiedRate: number;
  totalBonusAiRequests: number;
  activeReferrers: number;
}

interface ReferralItem {
  id: string;
  referrerName: string;
  referrerEmail: string;
  referredName: string;
  referredEmail: string;
  code: string;
  status: "pending" | "qualified" | "expired";
  bonusGranted: boolean;
  createdAt: string;
  qualifiedAt: string | null;
}

export default function ReferralsPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const { data: stats } = useQuery<ReferralStats>({
    queryKey: ["admin", "referrals", "stats"],
    queryFn: () => apiClient.get("admin/referrals/stats").json(),
  });

  const { data: referrals } = useQuery<{
    data: ReferralItem[];
    total: number;
    page: number;
    totalPages: number;
  }>({
    queryKey: ["admin", "referrals", statusFilter, page],
    queryFn: () =>
      apiClient
        .get("admin/referrals", {
          searchParams: {
            ...(statusFilter !== "all" && { status: statusFilter }),
            page: String(page),
            limit: "20",
          },
        })
        .json(),
  });

  const statusVariant = (status: string) => {
    switch (status) {
      case "qualified": return "default";
      case "pending": return "secondary";
      case "expired": return "outline";
      default: return "outline";
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Referrals</h1>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Referrals</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalReferrals ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Qualified Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.qualifiedRate ?? 0}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Bonus AI Requests</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalBonusAiRequests ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Referrers</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeReferrers ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter + Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Referral List</CardTitle>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="qualified">Qualified</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referrer</TableHead>
                <TableHead>Referred</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Qualified</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referrals?.data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.referrerName}</div>
                    <div className="text-sm text-muted-foreground">{r.referrerEmail}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{r.referredName}</div>
                    <div className="text-sm text-muted-foreground">{r.referredEmail}</div>
                  </TableCell>
                  <TableCell>
                    <code className="text-sm">{r.code}</code>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.qualifiedAt
                      ? formatDistanceToNow(new Date(r.qualifiedAt), { addSuffix: true })
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {(!referrals?.data || referrals.data.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No referrals found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {referrals && referrals.totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {referrals.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(referrals.totalPages, p + 1))}
                disabled={page === referrals.totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/referrals/ apps/admin/src/components/layout/app-sidebar.tsx
git commit -m "feat(admin): add referrals dashboard page (ABA-66)"
```

---

## Task 16: Final Verification

- [ ] **Step 1: TypeScript check API**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: TypeScript check shared-types**

```bash
cd packages/shared-types && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Lint check**

```bash
npm run lint
```

Fix any lint issues.

- [ ] **Step 4: Verify admin builds**

```bash
cd apps/admin && npm run build
```

Expected: Build succeeds.

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve lint and build issues for referral program (ABA-66)"
```

---

## Verification Checklist (post-implementation)

After all tasks complete, verify against the spec:

1. `cd apps/api && npx tsc --noEmit` — no errors
2. Registration with referralCode → Referral record created, trial extended
3. Registration without referralCode → works as before
4. Invalid/self-referral code → registration succeeds, code ignored
5. `GET /referrals/my-code` → 6-char code returned
6. `GET /referrals/stats` → correct counts
7. `GET /referrals/list` → referrals with status
8. Subscription limit includes `bonusAiRequests`
9. Gamification achievements include referral ones
10. Admin `/referrals` page shows stats and list
11. Mobile settings shows "Invite Friends"
12. Mobile referral screen works
13. All 8 i18n locales have referral keys
