# Referral Program Design Spec

**Issue:** ABA-66 (GitHub #63)
**Date:** 2026-03-28

## Overview

Each user gets a unique 6-char referral code. When a new user registers with this code:
- **Referrer** gets +30 bonus AI requests (stacking, permanent)
- **Referred user** gets extended trial: 14 days instead of 7
- At 5 qualified referrals: referrer gets 1 month Pro free (Stripe coupon)
- At 10 qualified referrals: referrer gets "Ambassador" badge (via gamification system)

A "qualified referral" = referred user stays active for 7+ days after registration.

---

## Database Schema

### New Prisma model: `Referral`

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

  @@map("referrals")
}

enum ReferralStatus {
  pending
  qualified
  expired

  @@map("referral_status")
}
```

### User model additions

```prisma
referralCode   String?    @unique @map("referral_code")  // e.g. "MIKH7X"
referralsMade  Referral[] @relation("ReferralsMade")
referredBy     Referral?  @relation("ReferredBy")
```

### Subscription model addition

```prisma
bonusAiRequests Int @default(0) @map("bonus_ai_requests")
```

---

## API Module: `apps/api/src/modules/referrals/`

### Files

| File | Purpose |
|---|---|
| `referrals.module.ts` | Module, imports UsersModule, SubscriptionsModule, MailModule, NotificationsModule, GamificationModule |
| `referrals.service.ts` | Core logic |
| `referrals.controller.ts` | REST endpoints |
| `dto/index.ts` | DTOs |
| `referral-qualification.cron.ts` | Daily cron: qualify pending referrals |

### Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET /referrals/my-code` | JWT | Get or generate current user's referral code |
| `GET /referrals/stats` | JWT | Stats: total, qualified, pending, bonus AI requests |
| `GET /referrals/list` | JWT | List referrals made (name, date, status) |

### Service Methods

```
generateCode(userId) — 6-char alphanumeric, idempotent (returns existing if present)
applyReferralCode(referredUserId, code) — validate, create Referral, extend trial to 14 days
qualifyPendingReferrals() — daily cron, pending -> qualified after 7 days of activity
grantReferralBonus(referralId) — +30 bonusAiRequests to referrer's subscription
checkMilestones(referrerUserId) — 5 qualified -> Stripe coupon; 10 qualified -> Ambassador badge
getStats(userId) — aggregated stats for user
getList(userId) — paginated referrals list
```

### Code Generation

6-char uppercase alphanumeric (`crypto.randomBytes(4).toString('base64url').substring(0, 6).toUpperCase()`). Retry on collision (unique constraint).

---

## Auth Integration

### RegisterDto addition

```typescript
@IsOptional()
@IsString()
@MaxLength(10)
referralCode?: string;
```

### auth.service.ts `register()` change

After user creation, if `dto.referralCode` is provided:
- Call `referralsService.applyReferralCode(user.id, dto.referralCode)`
- If code is invalid or self-referral — log warning, do NOT block registration

### auth.module.ts

Import `ReferralsModule` (use `forwardRef` if needed for circular dependency).

---

## Subscription Integration

### AI request limit check

In `subscriptions.service.ts`, method `trackAiUsage()` at line 336:

**Current:** `const limit = current.customAiLimit ?? tierLimit;`
**Updated:** `const limit = (current.customAiLimit ?? tierLimit) + (current.bonusAiRequests ?? 0);`

Same change in `getUsageStats()` at line 111.

Bonus requests do NOT reset monthly — they stack permanently.

### `getUsageStats()` response addition

Add `bonusAiRequests: refreshedSub?.bonusAiRequests ?? 0` to the returned object.

### Extended trial for referred users

In `applyReferralCode()`: find the referred user's subscription, if `trialEnd` exists, extend by 7 days (total 14).

---

## Stripe Coupon Integration (5 Referrals Milestone)

In `checkMilestones()`, when user reaches 5 qualified referrals:

1. Create a Stripe promotion code via `stripe.promotionCodes.create()` with a 100% off coupon for 1 month of Pro
2. Send email to referrer with the promo code
3. Send push notification

Implementation:
- Create coupon once at app start or on-demand: `stripe.coupons.create({ percent_off: 100, duration: 'once', name: 'Referral: 1 Month Pro Free' })`
- Store coupon ID in env: `STRIPE_REFERRAL_COUPON_ID`
- Generate unique promotion code per user: `stripe.promotionCodes.create({ coupon: couponId, max_redemptions: 1 })`

---

## Gamification Integration (10 Referrals Milestone — Ambassador Badge)

### achievement-definitions.ts

Add new category `'social'` to the AchievementDef interface:

```typescript
category: 'budget' | 'tracking' | 'streak' | 'milestone' | 'savings' | 'social';
```

Add two new achievements:

```typescript
{ id: 'referrals_5', category: 'social', icon: '🤝', rarity: 'epic', threshold: 5, xpReward: 150,
  titleKey: 'gamification.achievements.referrals5.title',
  descriptionKey: 'gamification.achievements.referrals5.description' },
{ id: 'referrals_10_ambassador', category: 'social', icon: '🏅', rarity: 'legendary', threshold: 10, xpReward: 500,
  titleKey: 'gamification.achievements.ambassador.title',
  descriptionKey: 'gamification.achievements.ambassador.description' },
```

### gamification.service.ts

Add referral count check in `checkAchievements()`:
- Query `Referral` count where `referrerUserId = userId` and `status = 'qualified'`
- Evaluate `referrals_5` and `referrals_10_ambassador` achievements

The Ambassador badge is cosmetic — shown in the user's gamification profile alongside other achievements. No special badge field needed, it's just a legendary achievement.

---

## Cron Job: `referral-qualification.cron.ts`

Using `@nestjs/schedule`, daily at 3:00 AM UTC:

```
@Cron('0 3 * * *')
async qualifyPendingReferrals()
```

Logic:
1. Find referrals with `status = pending` AND `createdAt <= 7 days ago`
2. For each, check if referred user `isActive = true`
3. If active: update to `qualified`, set `qualifiedAt = now`, call `grantReferralBonus()`, call `checkMilestones()`
4. If not active: update to `expired`
5. Send notifications for each qualification

---

## Notifications

### Push
- Referral signed up: "Your friend {name} joined using your referral code!"
- Referral qualified: "Your referral {name} is now active! You earned +30 AI requests."
- Milestone 5: "5 referrals! You earned a free month of Pro."
- Milestone 10: "10 referrals! You earned the Ambassador badge!"

### Email
- Referral bonus earned: HTML email with stats summary and share CTA
- Milestone 5: email with Stripe promo code

### Admin
- Telegram channel: log referral signups and qualifications
- Admin dashboard: new referrals section (see Admin section below)

---

## Admin Dashboard

### New page: `/referrals`

Add to admin sidebar navigation. Page contains:

1. **KPI cards**: Total referrals, Qualified rate (%), Total bonus AI requests granted, Active referrers count
2. **Referrals table**: Paginated list with columns — Referrer (name/email), Referred (name/email), Code, Status badge, Created date, Qualified date
3. **Filters**: Status (all/pending/qualified/expired), date range
4. **Top referrers**: Leaderboard of users with most qualified referrals

### Admin API endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET /admin/referrals` | Admin JWT | Paginated referral list with filters |
| `GET /admin/referrals/stats` | Admin JWT | Aggregate referral stats |

These go in the existing `admin.controller.ts` / `admin.service.ts`.

---

## Mobile App

### Shared Types (`packages/shared-types/src/dto/index.ts`)

```typescript
interface ReferralStatsDto {
  referralCode: string;
  totalReferrals: number;
  qualifiedReferrals: number;
  pendingReferrals: number;
  bonusAiRequests: number;
  nextMilestone: { count: number; reward: string } | null;
}

interface ReferralListItemDto {
  id: string;
  referredName: string;
  status: 'pending' | 'qualified' | 'expired';
  createdAt: string;
  qualifiedAt: string | null;
}
```

### API Client (`apps/mobile/src/services/api.ts`)

```typescript
getReferralCode(): Promise<{ code: string }>
getReferralStats(): Promise<ReferralStatsDto>
getReferralList(): Promise<ReferralListItemDto[]>
```

### Store: `apps/mobile/src/stores/referralStore.ts`

Zustand store with: code, stats, referrals list, isLoading, error.
Methods: loadCode, loadStats, loadReferrals, shareCode (native share sheet).

### RegisterDto update (`packages/shared-types`)

Add `referralCode?: string` to RegisterDto.

### Registration Screen (`apps/mobile/app/(auth)/register.tsx`)

Add optional "Referral code" text input below the existing form fields, before the register button. State: `referralCode`. Pass to `register()` call.

### Settings Screen (`apps/mobile/app/settings/index.tsx`)

Add "Invite Friends" section in the settings list (under existing sections):
- Icon: people/share icon
- Subtitle: "X friends invited, +Y bonus AI requests" (or "Share your referral code")
- Tap: navigate to `/referral`

### Referral Screen (`apps/mobile/app/referral.tsx`)

New screen:
- **Header**: "Invite Friends"
- **Code card**: Referral code with Copy + Share buttons
- **Stats row**: Total / Qualified / Pending counts
- **Bonus display**: "+{N} bonus AI requests earned"
- **Milestone progress**: Progress bar "X/5 to free Pro month" or "X/10 to Ambassador badge"
- **Referrals list**: FlatList with status badges (pending=yellow, qualified=green, expired=gray)
- **Empty state**: Illustration + "Share your code to start earning rewards"

### Subscription Screen (`apps/mobile/app/subscription.tsx`)

In AI usage display, show bonus: `"142 / 200 (+90 bonus)"`

### i18n (all 8 locales)

Keys to add:

```
referral.title
referral.code
referral.share
referral.copy
referral.copied
referral.stats
referral.totalReferrals
referral.qualifiedReferrals
referral.pendingReferrals
referral.bonusRequests
referral.milestone5
referral.milestone10
referral.statusPending
referral.statusQualified
referral.statusExpired
referral.extendedTrial
referral.shareText          // "Join AI Budget Assistant with my code {code}! ..."
referral.settingsTitle
referral.settingsSubtitle
referral.emptyList
referral.nextMilestone
referral.friendJoined       // push notification text
referral.friendQualified    // push notification text
```

---

## Files Summary

### Create (8 files)

| File | Purpose |
|---|---|
| `apps/api/src/modules/referrals/referrals.module.ts` | Module |
| `apps/api/src/modules/referrals/referrals.service.ts` | Business logic |
| `apps/api/src/modules/referrals/referrals.controller.ts` | REST API |
| `apps/api/src/modules/referrals/dto/index.ts` | DTOs |
| `apps/api/src/modules/referrals/referral-qualification.cron.ts` | Daily cron |
| `apps/mobile/src/stores/referralStore.ts` | Zustand store |
| `apps/mobile/app/referral.tsx` | Referral details screen |
| `apps/admin/src/app/referrals/page.tsx` | Admin referrals page |

### Modify (~17 files)

| File | Change |
|---|---|
| `apps/api/prisma/schema.prisma` | Add Referral model, ReferralStatus enum, User fields, Subscription.bonusAiRequests |
| `apps/api/src/modules/auth/dto/index.ts` | Add referralCode to RegisterDto |
| `apps/api/src/modules/auth/auth.service.ts` | Apply referral code on registration |
| `apps/api/src/modules/auth/auth.module.ts` | Import ReferralsModule |
| `apps/api/src/modules/subscriptions/subscriptions.service.ts` | Add bonusAiRequests to limit calculation + getUsageStats |
| `apps/api/src/modules/gamification/achievement-definitions.ts` | Add 'social' category, referrals_5, ambassador achievements |
| `apps/api/src/modules/gamification/gamification.service.ts` | Add referral count check in checkAchievements |
| `apps/api/src/modules/admin/admin.service.ts` | Add referral stats + list methods |
| `apps/api/src/modules/admin/admin.controller.ts` | Add referral endpoints |
| `apps/api/src/app.module.ts` | Import ReferralsModule |
| `apps/mobile/src/services/api.ts` | Add referral API methods |
| `apps/mobile/app/(auth)/register.tsx` | Add referral code input |
| `apps/mobile/app/settings/index.tsx` | Add "Invite Friends" section |
| `apps/mobile/app/subscription.tsx` | Show bonus AI requests |
| `apps/mobile/src/i18n/locales/*.ts` | Add referral keys (x8 files) |
| `packages/shared-types/src/dto/index.ts` | Add ReferralStatsDto, ReferralListItemDto, update RegisterDto |
| `apps/admin/src/components/layout/sidebar.tsx` | Add referrals nav item |

### Prisma migration

```bash
cd apps/api && npx prisma migrate dev --name add-referral-program
```

---

## Verification Checklist

1. `cd apps/api && npx tsc --noEmit` — builds without errors
2. POST /auth/register with referralCode -> Referral record created, trial extended to 14 days
3. POST /auth/register without referralCode -> works as before (no regression)
4. Invalid/self-referral code -> registration succeeds, code silently ignored
5. GET /referrals/my-code -> generates and returns 6-char code
6. GET /referrals/stats -> returns correct counts
7. GET /referrals/list -> returns referrals with status
8. Cron: after 7 days, pending -> qualified, bonus +30 AI requests granted
9. AI limit: user with bonusAiRequests=90 and Pro plan -> limit = 300+90 = 390
10. 5th qualified referral -> Stripe promotion code created, email sent
11. 10th qualified referral -> Ambassador achievement unlocked
12. Mobile: settings shows invite section, share works, referral screen loads
13. Admin: /referrals page shows stats and referral list
