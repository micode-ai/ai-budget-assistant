# Proactive Anomaly Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On-write anomaly detection (duplicate charge, subscription price increase, "looks like a subscription", category spike) with a persistent in-app alerts feed + push notifications.

**Architecture:** New `modules/anomaly/` NestJS module. `AnomalyService.checkExpense()` is called fire-and-forget from `ExpensesService.create` (covers app/voice/OCR/bots) and from both import commits (batch variant). Findings are stored in a new `anomaly_alerts` table whose `@@unique([accountId, dedupKey])` doubles as the "already alerted" dedup. Push goes through the existing `NotificationsService` (`spending_anomaly` type) capped at 3/day/account. Mobile gets a bell icon on the home hero header, an `/alerts` feed screen, an `alertStore`, and an `alerts.api.ts` client.

**Tech Stack:** NestJS 10 + Prisma 5, Jest (plain-mock pattern from `expenses.service.spec.ts`), Expo Router + Zustand, i18next (9 locales).

**Spec:** `docs/superpowers/specs/2026-06-10-anomaly-alerts-design.md`

---

## File map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `apps/api/prisma/schema.prisma` | `AnomalyAlert` model, `User.notifyAnomalyAlerts`, `Account.anomalyAlerts` relation |
| Create | `apps/api/src/modules/anomaly/anomaly.module.ts` | Module wiring |
| Create | `apps/api/src/modules/anomaly/anomaly.service.ts` | Detectors + feed queries + dedup + push cap |
| Create | `apps/api/src/modules/anomaly/anomaly.controller.ts` | `GET/PATCH/DELETE /alerts` |
| Create | `apps/api/src/modules/anomaly/dto/index.ts` | (empty barrel for pattern consistency — no body DTOs needed) |
| Create | `apps/api/src/modules/anomaly/anomaly.service.spec.ts` | Detector unit tests |
| Create | `apps/api/src/modules/anomaly/anomaly.controller.spec.ts` | Route-order + scoping tests |
| Modify | `apps/api/src/modules/budgets/budget-alert.service.ts` | DELETE `checkSpendingAnomalies` |
| Modify | `apps/api/src/modules/expenses/expenses.{service,module,controller}.ts` (+2 specs) | Hook + remove old call |
| Modify | `apps/api/src/modules/import-bank/import-bank.{service,module}.ts` | Batch hook |
| Modify | `apps/api/src/modules/import-wise/import-wise.{service,module}.ts` | Batch hook |
| Modify | `apps/api/src/modules/notifications/notification-i18n.ts` | 3 new title/body pairs × 9 langs |
| Modify | `apps/api/src/modules/notifications/notifications.service.ts` | Gate `spending_anomaly` by `notifyAnomalyAlerts` |
| Modify | `apps/api/src/modules/users/users.service.ts` | `anomalyAlerts` preference |
| Modify | `apps/api/src/app.module.ts` | Register `AnomalyModule` |
| Modify | `packages/shared-types/src/entities/index.ts` + `dto/notification.ts` | `AnomalyAlert` entity, prefs response |
| Create | `apps/mobile/src/services/alerts.api.ts` | API client |
| Modify | `apps/mobile/src/services/api.ts` | Barrel |
| Create | `apps/mobile/src/stores/alertStore.ts` | Zustand store |
| Create | `apps/mobile/app/alerts/index.tsx` | Feed screen |
| Modify | `apps/mobile/app/_layout.tsx` | Screen registration (header!) |
| Modify | `apps/mobile/app/(tabs)/index.tsx` | Bell icon + badge |
| Modify | `apps/mobile/src/services/notifications.ts` | Deep-link case |
| Modify | `apps/mobile/app/settings/notifications.tsx` | Preference toggle |
| Modify | `apps/mobile/src/i18n/locales/*.ts` (9 files) | `alerts.*` + `notifications.anomalyAlerts*` keys |

Naming note: mobile API methods must be globally unique across the `api` barrel (it spreads objects) — hence `listAlerts`, `markAlertRead`, `markAllAlertsRead`, `dismissAlert`.

---

### Task 1: Prisma schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add `notifyAnomalyAlerts` to `User`**

After the line `notifySubscriptionRenewals Boolean @default(true) @map("notify_subscription_renewals")` (≈line 95) add:

```prisma
  notifyAnomalyAlerts     Boolean   @default(true) @map("notify_anomaly_alerts")
```

- [ ] **Step 2: Add back-relation to `Account`**

In `model Account`, after `userSubscriptions UserSubscription[]` (≈line 219) add:

```prisma
  anomalyAlerts           AnomalyAlert[]
```

- [ ] **Step 3: Add the `AnomalyAlert` model**

Append after `model UserSubscription` (≈line 1416):

```prisma
model AnomalyAlert {
  id          String    @id @default(uuid())
  accountId   String    @map("account_id")
  userId      String    @map("user_id")
  type        String
  dedupKey    String    @map("dedup_key")
  params      Json
  expenseId   String?   @map("expense_id")
  categoryId  String?   @map("category_id")
  pushSent    Boolean   @default(false) @map("push_sent")
  readAt      DateTime? @map("read_at")
  dismissedAt DateTime? @map("dismissed_at")
  createdAt   DateTime  @default(now()) @map("created_at")

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@unique([accountId, dedupKey])
  @@index([accountId, createdAt])
  @@map("anomaly_alerts")
}
```

(No FK on `expenseId`/`categoryId` — alerts must survive hard deletes of their source rows; they are soft references for deep-links only.)

- [ ] **Step 4: Migrate + generate**

Run from `apps/api/`:
```bash
npx prisma migrate dev --name add_anomaly_alerts
npx prisma generate
```
Expected: new folder `prisma/migrations/<timestamp>_add_anomaly_alerts/` with `CREATE TABLE "anomaly_alerts"` and `ALTER TABLE "users" ADD COLUMN "notify_anomaly_alerts"`. (Requires local Postgres from `docker-compose.yml` running.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma
git commit -m "ABA-242 Add anomaly_alerts table + notify_anomaly_alerts preference"
```
(Replace 242 with the actual next ABA number at execution time — `gh issue list --limit 1`; the issue itself is created in the final task. Use the same number in all commits of this plan.)

---

### Task 2: Shared types

**Files:**
- Modify: `packages/shared-types/src/entities/index.ts`
- Modify: `packages/shared-types/src/dto/notification.ts`

- [ ] **Step 1: Add entity types**

In `packages/shared-types/src/entities/index.ts`, append at the end:

```typescript
// ---- Anomaly alerts ----

export type AnomalyAlertType =
  | 'category_spike'
  | 'price_increase'
  | 'duplicate_charge'
  | 'recurring_suggestion';

export interface AnomalyAlert {
  id: string;
  accountId: string;
  userId: string;
  type: AnomalyAlertType;
  params: Record<string, unknown>;
  expenseId: string | null;
  categoryId: string | null;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
}

export interface AnomalyAlertListResponse {
  alerts: AnomalyAlert[];
  unreadCount: number;
}
```

- [ ] **Step 2: Extend `NotificationPreferencesResponse`**

`packages/shared-types/src/dto/notification.ts` — the interface currently only has 3 of the 5 fields the API already returns; bring it in sync and add the new one:

```typescript
export interface NotificationPreferencesResponse {
  budgetAlerts: boolean;
  sharedAccountActivity: boolean;
  debtReminders: boolean;
  recurringExpenses: boolean;
  subscriptionRenewals: boolean;
  anomalyAlerts: boolean;
}
```

- [ ] **Step 3: Typecheck + commit**

Run from repo root: `npm run typecheck`
Expected: PASS (mobile `settings/notifications.tsx` uses `prefs.recurringExpenses ?? true` so the newly-required fields don't break it).

```bash
git add packages/shared-types
git commit -m "ABA-242 Shared types: AnomalyAlert entity + full notification preferences DTO"
```

---

### Task 3: Server push i18n + preference gate + prefs endpoint

**Files:**
- Modify: `apps/api/src/modules/notifications/notification-i18n.ts`
- Modify: `apps/api/src/modules/notifications/notifications.service.ts`
- Modify: `apps/api/src/modules/users/users.service.ts`

- [ ] **Step 1: Add param interfaces + signature entries to `notification-i18n.ts`**

After `interface ChatMentionParams { ... }` add:

```typescript
interface PriceIncreaseParams {
  merchant: string;
  oldAmount: string;
  newAmount: string;
  currencyCode: string;
  percent: number;
}

interface DuplicateChargeParams {
  merchant: string;
  amount: string;
  currencyCode: string;
}

interface RecurringSuggestionParams {
  merchant: string;
  amount: string;
  currencyCode: string;
}
```

In the `translations` record type, after `chatMentionBody: (p: ChatMentionParams) => string;` add:

```typescript
  priceIncreaseTitle: (p: PriceIncreaseParams) => string;
  priceIncreaseBody: (p: PriceIncreaseParams) => string;
  duplicateChargeTitle: (p: DuplicateChargeParams) => string;
  duplicateChargeBody: (p: DuplicateChargeParams) => string;
  recurringSuggestionTitle: (p: RecurringSuggestionParams) => string;
  recurringSuggestionBody: (p: RecurringSuggestionParams) => string;
```

- [ ] **Step 2: Add the strings to all 9 languages**

Append inside each language object (the file has `en`, `ru`, `ua`, `pl`, `es`, `fr`, `de`, `be`, `nl` — verify the exact set with `grep -E "^  [a-z]{2}: \{" notification-i18n.ts` and cover every one):

```typescript
    // en
    priceIncreaseTitle: ({ merchant }) => `${merchant} got more expensive`,
    priceIncreaseBody: ({ merchant, oldAmount, newAmount, currencyCode, percent }) =>
      `${merchant} charged ${currencyCode} ${newAmount}, up from ${currencyCode} ${oldAmount} (+${percent}%).`,
    duplicateChargeTitle: () => 'Possible duplicate charge',
    duplicateChargeBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} charged ${currencyCode} ${amount} twice within two days. Worth checking.`,
    recurringSuggestionTitle: ({ merchant }) => `${merchant} looks like a subscription`,
    recurringSuggestionBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} charges ${currencyCode} ${amount} regularly. Track it as a subscription?`,

    // ru
    priceIncreaseTitle: ({ merchant }) => `${merchant} подорожал`,
    priceIncreaseBody: ({ merchant, oldAmount, newAmount, currencyCode, percent }) =>
      `${merchant} списал ${currencyCode} ${newAmount} вместо ${currencyCode} ${oldAmount} (+${percent}%).`,
    duplicateChargeTitle: () => 'Возможен повторный платёж',
    duplicateChargeBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} списал ${currencyCode} ${amount} дважды за два дня. Стоит проверить.`,
    recurringSuggestionTitle: ({ merchant }) => `${merchant} похож на подписку`,
    recurringSuggestionBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} регулярно списывает ${currencyCode} ${amount}. Отслеживать как подписку?`,

    // ua
    priceIncreaseTitle: ({ merchant }) => `${merchant} подорожчав`,
    priceIncreaseBody: ({ merchant, oldAmount, newAmount, currencyCode, percent }) =>
      `${merchant} списав ${currencyCode} ${newAmount} замість ${currencyCode} ${oldAmount} (+${percent}%).`,
    duplicateChargeTitle: () => 'Можливий повторний платіж',
    duplicateChargeBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} списав ${currencyCode} ${amount} двічі за два дні. Варто перевірити.`,
    recurringSuggestionTitle: ({ merchant }) => `${merchant} схожий на підписку`,
    recurringSuggestionBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} регулярно списує ${currencyCode} ${amount}. Відстежувати як підписку?`,

    // pl
    priceIncreaseTitle: ({ merchant }) => `${merchant} podrożał`,
    priceIncreaseBody: ({ merchant, oldAmount, newAmount, currencyCode, percent }) =>
      `${merchant} pobrał ${currencyCode} ${newAmount} zamiast ${currencyCode} ${oldAmount} (+${percent}%).`,
    duplicateChargeTitle: () => 'Możliwa podwójna płatność',
    duplicateChargeBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} pobrał ${currencyCode} ${amount} dwa razy w ciągu dwóch dni. Warto sprawdzić.`,
    recurringSuggestionTitle: ({ merchant }) => `${merchant} wygląda na subskrypcję`,
    recurringSuggestionBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} regularnie pobiera ${currencyCode} ${amount}. Śledzić jako subskrypcję?`,

    // es
    priceIncreaseTitle: ({ merchant }) => `${merchant} ha subido de precio`,
    priceIncreaseBody: ({ merchant, oldAmount, newAmount, currencyCode, percent }) =>
      `${merchant} cobró ${currencyCode} ${newAmount}, antes ${currencyCode} ${oldAmount} (+${percent}%).`,
    duplicateChargeTitle: () => 'Posible cargo duplicado',
    duplicateChargeBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} cobró ${currencyCode} ${amount} dos veces en dos días. Conviene revisarlo.`,
    recurringSuggestionTitle: ({ merchant }) => `${merchant} parece una suscripción`,
    recurringSuggestionBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} cobra ${currencyCode} ${amount} con regularidad. ¿Quieres seguirla como suscripción?`,

    // fr
    priceIncreaseTitle: ({ merchant }) => `${merchant} a augmenté`,
    priceIncreaseBody: ({ merchant, oldAmount, newAmount, currencyCode, percent }) =>
      `${merchant} a prélevé ${currencyCode} ${newAmount} au lieu de ${currencyCode} ${oldAmount} (+${percent} %).`,
    duplicateChargeTitle: () => 'Possible double prélèvement',
    duplicateChargeBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} a prélevé ${currencyCode} ${amount} deux fois en deux jours. À vérifier.`,
    recurringSuggestionTitle: ({ merchant }) => `${merchant} ressemble à un abonnement`,
    recurringSuggestionBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} prélève ${currencyCode} ${amount} régulièrement. Le suivre comme abonnement ?`,

    // de
    priceIncreaseTitle: ({ merchant }) => `${merchant} ist teurer geworden`,
    priceIncreaseBody: ({ merchant, oldAmount, newAmount, currencyCode, percent }) =>
      `${merchant} hat ${currencyCode} ${newAmount} statt ${currencyCode} ${oldAmount} abgebucht (+${percent} %).`,
    duplicateChargeTitle: () => 'Mögliche doppelte Abbuchung',
    duplicateChargeBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} hat ${currencyCode} ${amount} zweimal innerhalb von zwei Tagen abgebucht. Bitte prüfen.`,
    recurringSuggestionTitle: ({ merchant }) => `${merchant} sieht nach einem Abo aus`,
    recurringSuggestionBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} bucht regelmäßig ${currencyCode} ${amount} ab. Als Abo verfolgen?`,

    // be
    priceIncreaseTitle: ({ merchant }) => `${merchant} падаражэў`,
    priceIncreaseBody: ({ merchant, oldAmount, newAmount, currencyCode, percent }) =>
      `${merchant} спісаў ${currencyCode} ${newAmount} замест ${currencyCode} ${oldAmount} (+${percent}%).`,
    duplicateChargeTitle: () => 'Магчымы паўторны плацёж',
    duplicateChargeBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} спісаў ${currencyCode} ${amount} двойчы за два дні. Варта праверыць.`,
    recurringSuggestionTitle: ({ merchant }) => `${merchant} падобны на падпіску`,
    recurringSuggestionBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} рэгулярна спісвае ${currencyCode} ${amount}. Адсочваць як падпіску?`,

    // nl
    priceIncreaseTitle: ({ merchant }) => `${merchant} is duurder geworden`,
    priceIncreaseBody: ({ merchant, oldAmount, newAmount, currencyCode, percent }) =>
      `${merchant} rekende ${currencyCode} ${newAmount} af in plaats van ${currencyCode} ${oldAmount} (+${percent}%).`,
    duplicateChargeTitle: () => 'Mogelijk dubbele afschrijving',
    duplicateChargeBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} schreef ${currencyCode} ${amount} twee keer af binnen twee dagen. Controleer dit even.`,
    recurringSuggestionTitle: ({ merchant }) => `${merchant} lijkt op een abonnement`,
    recurringSuggestionBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} schrijft regelmatig ${currencyCode} ${amount} af. Volgen als abonnement?`,
```

- [ ] **Step 3: Add exported helper functions**

At the bottom of `notification-i18n.ts`, after `export function chatMentionBody...` (follow the existing pattern):

```typescript
export function priceIncreaseTitle(lang: Lang, params: PriceIncreaseParams): string {
  return t(lang).priceIncreaseTitle(params);
}

export function priceIncreaseBody(lang: Lang, params: PriceIncreaseParams): string {
  return t(lang).priceIncreaseBody(params);
}

export function duplicateChargeTitle(lang: Lang, params: DuplicateChargeParams): string {
  return t(lang).duplicateChargeTitle(params);
}

export function duplicateChargeBody(lang: Lang, params: DuplicateChargeParams): string {
  return t(lang).duplicateChargeBody(params);
}

export function recurringSuggestionTitle(lang: Lang, params: RecurringSuggestionParams): string {
  return t(lang).recurringSuggestionTitle(params);
}

export function recurringSuggestionBody(lang: Lang, params: RecurringSuggestionParams): string {
  return t(lang).recurringSuggestionBody(params);
}
```

- [ ] **Step 4: Gate `spending_anomaly` by the new preference**

`apps/api/src/modules/notifications/notifications.service.ts`:

In `sendToUser` — add `notifyAnomalyAlerts: true,` to the `select` block (after `notifySubscriptionRenewals: true,`) and change line 51:

```typescript
    if (notificationType === 'spending_anomaly' && !user.notifyAnomalyAlerts) return false;
```

In `sendToUsers` — add `notifyAnomalyAlerts: true,` to its `select` block and change the same condition (line ≈107):

```typescript
      if (notificationType === 'spending_anomaly' && !u.notifyAnomalyAlerts) return false;
```

- [ ] **Step 5: Add the preference to users.service.ts**

In `getNotificationPreferences`: add `notifyAnomalyAlerts: true,` to the select and `anomalyAlerts: user?.notifyAnomalyAlerts ?? true,` to the return object.

In `updateNotificationPreferences`: extend the `prefs` type with `anomalyAlerts?: boolean` and add:

```typescript
    if (prefs.anomalyAlerts !== undefined) data.notifyAnomalyAlerts = prefs.anomalyAlerts;
```

- [ ] **Step 6: Build + commit**

Run from `apps/api/`: `npx tsc --noEmit -p tsconfig.json` (or `npm run build`)
Expected: PASS.

```bash
git add apps/api/src/modules/notifications apps/api/src/modules/users
git commit -m "ABA-242 Anomaly push i18n (9 langs) + notifyAnomalyAlerts preference gate"
```

---

### Task 4: AnomalyService skeleton — module, pure helpers, createAlert (dedup + push cap)

**Files:**
- Create: `apps/api/src/modules/anomaly/anomaly.module.ts`
- Create: `apps/api/src/modules/anomaly/anomaly.service.ts`
- Create: `apps/api/src/modules/anomaly/dto/index.ts`
- Create: `apps/api/src/modules/anomaly/anomaly.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing tests for pure helpers + createAlert**

`apps/api/src/modules/anomaly/anomaly.service.spec.ts`:

```typescript
import { AnomalyService, detectCycle, normalizeMerchant, monthKey } from './anomaly.service';

function makeService(overrides: {
  alertCreate?: jest.Mock;
  alertCount?: jest.Mock;
  sendToUser?: jest.Mock;
} = {}) {
  const prisma: any = {
    anomalyAlert: {
      create: overrides.alertCreate ?? jest.fn().mockResolvedValue({ id: 'alert-1' }),
      count: overrides.alertCount ?? jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    expense: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn() },
    userSubscription: { findMany: jest.fn().mockResolvedValue([]) },
    category: { findUnique: jest.fn().mockResolvedValue({ name: 'Food' }) },
  };
  const notifications: any = {
    sendToUser: overrides.sendToUser ?? jest.fn().mockResolvedValue(true),
  };
  const service = new AnomalyService(prisma, notifications);
  return { service, prisma, notifications };
}

describe('pure helpers', () => {
  it('normalizeMerchant trims and lowercases', () => {
    expect(normalizeMerchant('  Netflix ')).toBe('netflix');
  });

  it('monthKey formats UTC year-month', () => {
    expect(monthKey(new Date(Date.UTC(2026, 5, 10)))).toBe('2026-06');
  });

  it('detectCycle: 3 charges ~30 days apart → monthly', () => {
    expect(detectCycle([new Date('2026-04-01'), new Date('2026-05-01'), new Date('2026-05-31')])).toBe('monthly');
  });

  it('detectCycle: 3 charges 7 days apart → weekly', () => {
    expect(detectCycle([new Date('2026-05-17'), new Date('2026-05-24'), new Date('2026-05-31')])).toBe('weekly');
  });

  it('detectCycle: gap of 24 days → null (below monthly window)', () => {
    expect(detectCycle([new Date('2026-04-07'), new Date('2026-05-01'), new Date('2026-05-31')])).toBe(null);
  });

  it('detectCycle: gap of 36 days → null (above monthly window)', () => {
    expect(detectCycle([new Date('2026-03-26'), new Date('2026-05-01'), new Date('2026-05-31')])).toBe(null);
  });

  it('detectCycle: fewer than 3 dates → null', () => {
    expect(detectCycle([new Date('2026-05-01'), new Date('2026-05-31')])).toBe(null);
  });
});

describe('createAlert', () => {
  const input = {
    accountId: 'acc-1',
    userId: 'user-1',
    type: 'duplicate_charge' as const,
    dedupKey: 'dup:e-1',
    params: { merchant: 'Netflix' },
    expenseId: 'e-1',
    pushTitle: () => 'title',
    pushBody: () => 'body',
  };

  it('creates the row and sends push when under the daily cap', async () => {
    const { service, prisma, notifications } = makeService();
    await service.createAlert(input);
    expect(prisma.anomalyAlert.create).toHaveBeenCalledTimes(1);
    expect(notifications.sendToUser).toHaveBeenCalledTimes(1);
    // pushSent stamped after a successful send
    expect(prisma.anomalyAlert.update).toHaveBeenCalledWith({
      where: { id: 'alert-1' },
      data: { pushSent: true },
    });
  });

  it('silently skips on dedupKey collision (P2002)', async () => {
    const err: any = new Error('unique');
    err.code = 'P2002';
    const { service, notifications } = makeService({ alertCreate: jest.fn().mockRejectedValue(err) });
    await expect(service.createAlert(input)).resolves.toBeUndefined();
    expect(notifications.sendToUser).not.toHaveBeenCalled();
  });

  it('creates the feed row but skips push when the daily cap is reached', async () => {
    const { service, prisma, notifications } = makeService({ alertCount: jest.fn().mockResolvedValue(3) });
    await service.createAlert(input);
    expect(prisma.anomalyAlert.create).toHaveBeenCalledTimes(1);
    expect(notifications.sendToUser).not.toHaveBeenCalled();
  });

  it('does not stamp pushSent when the push fails', async () => {
    const { service, prisma } = makeService({ sendToUser: jest.fn().mockResolvedValue(false) });
    await service.createAlert(input);
    expect(prisma.anomalyAlert.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `apps/api/`: `npx jest src/modules/anomaly/anomaly.service.spec.ts`
Expected: FAIL — `Cannot find module './anomaly.service'`.

- [ ] **Step 3: Implement the skeleton**

`apps/api/src/modules/anomaly/anomaly.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AnomalyAlertType } from '@budget/shared-types';

const PUSH_DAILY_CAP = 3;
export const PRICE_INCREASE_FACTOR = 1.1;
export const SPIKE_THRESHOLD_PERCENT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeMerchant(merchant: string): string {
  return merchant.trim().toLowerCase();
}

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * 3+ same-amount charges form a series when every gap between the 3 most
 * recent consecutive charges falls in the monthly (25–35 d) or weekly (6–8 d) window.
 */
export function detectCycle(dates: Date[]): 'monthly' | 'weekly' | null {
  if (dates.length < 3) return null;
  const last = dates.slice(-3);
  const gaps = [
    (last[1].getTime() - last[0].getTime()) / DAY_MS,
    (last[2].getTime() - last[1].getTime()) / DAY_MS,
  ];
  if (gaps.every((g) => g >= 25 && g <= 35)) return 'monthly';
  if (gaps.every((g) => g >= 6 && g <= 8)) return 'weekly';
  return null;
}

export interface CreateAlertInput {
  accountId: string;
  userId: string;
  type: AnomalyAlertType;
  dedupKey: string;
  params: Record<string, unknown>;
  expenseId?: string;
  categoryId?: string;
  pushTitle: (lang: string) => string;
  pushBody: (lang: string) => string;
}

@Injectable()
export class AnomalyService {
  private readonly logger = new Logger(AnomalyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Insert a feed row (dedupKey collision = already alerted, silent skip) and
   * push it unless the account already received PUSH_DAILY_CAP pushes today.
   */
  async createAlert(input: CreateAlertInput): Promise<void> {
    let alert: { id: string };
    try {
      alert = await this.prisma.anomalyAlert.create({
        data: {
          accountId: input.accountId,
          userId: input.userId,
          type: input.type,
          dedupKey: input.dedupKey,
          params: input.params as object,
          expenseId: input.expenseId ?? null,
          categoryId: input.categoryId ?? null,
        },
        select: { id: true },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') return; // already alerted for this dedupKey
      throw err;
    }

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const sentToday = await this.prisma.anomalyAlert.count({
      where: { accountId: input.accountId, pushSent: true, createdAt: { gte: todayStart } },
    });
    if (sentToday >= PUSH_DAILY_CAP) return;

    const sentOk = await this.notifications.sendToUser(
      input.userId,
      input.pushTitle,
      input.pushBody,
      { alertId: alert.id, anomalyType: input.type, expenseId: input.expenseId },
      'spending_anomaly',
    );
    if (sentOk) {
      await this.prisma.anomalyAlert.update({ where: { id: alert.id }, data: { pushSent: true } });
    }
  }
}
```

(Push `data` uses `anomalyType`, not `type` — `NotificationsService` spreads `{ ...data, type: notificationType }`, so a `type` key would be overwritten.)

- [ ] **Step 4: Run tests to verify they pass**

Run from `apps/api/`: `npx jest src/modules/anomaly/anomaly.service.spec.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Create module + dto barrel, register in AppModule**

`apps/api/src/modules/anomaly/dto/index.ts`:

```typescript
// No body DTOs — /alerts has no POST/PATCH payloads. Kept for module-structure consistency.
export {};
```

`apps/api/src/modules/anomaly/anomaly.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AnomalyService } from './anomaly.service';

@Module({
  providers: [AnomalyService],
  exports: [AnomalyService],
})
export class AnomalyModule {}
```

(Controller is added to this module in Task 9. `PrismaService` and `NotificationsService` come from global modules.)

In `apps/api/src/app.module.ts` add to imports (alphabetically with the others):

```typescript
import { AnomalyModule } from './modules/anomaly/anomaly.module';
// ... in @Module imports array:
    AnomalyModule,
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/anomaly apps/api/src/app.module.ts
git commit -m "ABA-242 AnomalyService skeleton: createAlert with dedup + daily push cap"
```

---

### Task 5: duplicate_charge detector

**Files:**
- Modify: `apps/api/src/modules/anomaly/anomaly.service.ts`
- Modify: `apps/api/src/modules/anomaly/anomaly.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Append to `anomaly.service.spec.ts`:

```typescript
function expenseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e-new',
    accountId: 'acc-1',
    merchant: 'Netflix',
    amount: 43, // Prisma Decimal arrives as Decimal; the service always wraps with Number()
    currencyCode: 'PLN',
    date: new Date('2026-06-10'),
    description: 'Netflix',
    recurringId: null,
    isRecurring: false,
    categoryId: 'cat-1',
    importBatchId: null,
    ...overrides,
  };
}

describe('detectDuplicateCharge', () => {
  it('alerts when another same-merchant same-amount expense exists within ±1 day', async () => {
    const { service, prisma } = makeService();
    prisma.expense.findFirst = jest.fn().mockResolvedValue({ id: 'e-old' });
    const createSpy = jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);

    await service.detectDuplicateCharge('acc-1', 'user-1', expenseRow() as any);

    expect(createSpy).toHaveBeenCalledTimes(1);
    const arg = createSpy.mock.calls[0][0];
    expect(arg.type).toBe('duplicate_charge');
    expect(arg.dedupKey).toBe('dup:e-new');
    expect(arg.expenseId).toBe('e-new');
    // the candidate query excludes the expense itself and matches merchant case-insensitively
    const where = (prisma.expense.findFirst as jest.Mock).mock.calls[0][0].where;
    expect(where.id).toEqual({ not: 'e-new' });
    expect(where.merchant).toEqual({ equals: 'Netflix', mode: 'insensitive' });
  });

  it('does nothing without a merchant', async () => {
    const { service } = makeService();
    const createSpy = jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);
    await service.detectDuplicateCharge('acc-1', 'user-1', expenseRow({ merchant: null }) as any);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('does nothing when no candidate is found', async () => {
    const { service, prisma } = makeService();
    prisma.expense.findFirst = jest.fn().mockResolvedValue(null);
    const createSpy = jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);
    await service.detectDuplicateCharge('acc-1', 'user-1', expenseRow() as any);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('excludes rows from the same import batch', async () => {
    const { service, prisma } = makeService();
    prisma.expense.findFirst = jest.fn().mockResolvedValue(null);
    jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);
    await service.detectDuplicateCharge('acc-1', 'user-1', expenseRow({ importBatchId: 'batch-1' }) as any);
    const where = (prisma.expense.findFirst as jest.Mock).mock.calls[0][0].where;
    expect(where.NOT).toEqual({ importBatchId: 'batch-1' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/modules/anomaly/anomaly.service.spec.ts`
Expected: FAIL — `detectDuplicateCharge is not a function`.

- [ ] **Step 3: Implement**

Add to `AnomalyService` (and add `import * as ni18n from '../notifications/notification-i18n';` at the top):

```typescript
  /** Same merchant + amount + currency within ±1 calendar day → possible double billing. */
  async detectDuplicateCharge(accountId: string, userId: string, expense: any): Promise<void> {
    const merchant: string | null = expense.merchant?.trim() ? expense.merchant : null;
    if (!merchant) return;

    const other = await this.prisma.expense.findFirst({
      where: {
        accountId,
        isDeleted: false,
        id: { not: expense.id },
        merchant: { equals: merchant, mode: 'insensitive' },
        amount: expense.amount,
        currencyCode: expense.currencyCode,
        date: {
          gte: new Date(expense.date.getTime() - DAY_MS),
          lte: new Date(expense.date.getTime() + DAY_MS),
        },
        ...(expense.importBatchId ? { NOT: { importBatchId: expense.importBatchId } } : {}),
      },
      select: { id: true },
    });
    if (!other) return;

    const params = {
      merchant,
      amount: Number(expense.amount).toFixed(2),
      currencyCode: expense.currencyCode,
      otherExpenseId: other.id,
    };
    await this.createAlert({
      accountId,
      userId,
      type: 'duplicate_charge',
      dedupKey: `dup:${expense.id}`,
      params,
      expenseId: expense.id,
      pushTitle: (lang) => ni18n.duplicateChargeTitle(lang, params),
      pushBody: (lang) => ni18n.duplicateChargeBody(lang, params),
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/modules/anomaly/anomaly.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/anomaly
git commit -m "ABA-242 Anomaly detector: duplicate charge"
```

---

### Task 6: price_increase detector

**Files:**
- Modify: `apps/api/src/modules/anomaly/anomaly.service.ts`
- Modify: `apps/api/src/modules/anomaly/anomaly.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Append:

```typescript
describe('detectPriceIncrease', () => {
  it('alerts when expense exceeds a tracked subscription amount by >10%', async () => {
    const { service, prisma } = makeService();
    prisma.userSubscription.findMany = jest.fn().mockResolvedValue([
      { id: 'sub-1', name: 'netflix', amount: 29 },
    ]);
    const createSpy = jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);

    await service.detectPriceIncrease('acc-1', 'user-1', expenseRow({ amount: 43 }) as any);

    expect(createSpy).toHaveBeenCalledTimes(1);
    const arg = createSpy.mock.calls[0][0];
    expect(arg.type).toBe('price_increase');
    expect(arg.dedupKey).toBe('price:netflix:2026-06');
    expect(arg.params).toMatchObject({ oldAmount: '29.00', newAmount: '43.00', percent: 48 });
  });

  it('does NOT alert at exactly +10%', async () => {
    const { service, prisma } = makeService();
    prisma.userSubscription.findMany = jest.fn().mockResolvedValue([
      { id: 'sub-1', name: 'netflix', amount: 100 },
    ]);
    const createSpy = jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);
    await service.detectPriceIncrease('acc-1', 'user-1', expenseRow({ amount: 110 }) as any);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('falls back to the recurringId series when no subscription matches', async () => {
    const { service, prisma } = makeService();
    prisma.userSubscription.findMany = jest.fn().mockResolvedValue([]);
    prisma.expense.findFirst = jest.fn().mockResolvedValue({ amount: 30 });
    const createSpy = jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);

    await service.detectPriceIncrease(
      'acc-1',
      'user-1',
      expenseRow({ amount: 40, merchant: null, description: 'Gym', recurringId: 'rec-9' }) as any,
    );

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy.mock.calls[0][0].dedupKey).toBe('price:rec-9:2026-06');
  });

  it('does nothing when neither subscription nor series matches', async () => {
    const { service, prisma } = makeService();
    prisma.userSubscription.findMany = jest.fn().mockResolvedValue([]);
    const createSpy = jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);
    await service.detectPriceIncrease('acc-1', 'user-1', expenseRow() as any);
    expect(createSpy).not.toHaveBeenCalled();
  });
});
```

(Convention across all detectors: `params` amounts are always `Number(x).toFixed(2)` strings — Prisma Decimals are never passed through raw.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/modules/anomaly/anomaly.service.spec.ts`
Expected: FAIL — `detectPriceIncrease is not a function`.

- [ ] **Step 3: Implement**

```typescript
  /** A tracked subscription or recurring series charged >10% more than before. */
  async detectPriceIncrease(accountId: string, userId: string, expense: any): Promise<void> {
    const amount = Number(expense.amount);
    if (amount <= 0) return;
    const merchantNorm = expense.merchant?.trim() ? normalizeMerchant(expense.merchant) : null;
    const descNorm = expense.description?.trim() ? normalizeMerchant(expense.description) : null;

    let prevAmount: number | null = null;
    let seriesKey: string | null = null;

    // 1) active tracked subscription matched by name vs merchant or description
    if (merchantNorm || descNorm) {
      const subs = await this.prisma.userSubscription.findMany({
        where: { accountId, isActive: true, currencyCode: expense.currencyCode },
        select: { id: true, name: true, amount: true },
      });
      const sub = subs.find((s: { name: string }) => {
        const n = normalizeMerchant(s.name);
        return n === merchantNorm || n === descNorm;
      });
      if (sub) {
        prevAmount = Number(sub.amount);
        seriesKey = merchantNorm ?? sub.id;
      }
    }

    // 2) else: previous expense of the same recurring series
    if (prevAmount === null && expense.recurringId) {
      const prev = await this.prisma.expense.findFirst({
        where: {
          accountId,
          isDeleted: false,
          recurringId: expense.recurringId,
          currencyCode: expense.currencyCode,
          id: { not: expense.id },
          date: { lt: expense.date },
        },
        orderBy: { date: 'desc' },
        select: { amount: true },
      });
      if (prev) {
        prevAmount = Number(prev.amount);
        seriesKey = merchantNorm ?? expense.recurringId;
      }
    }

    if (prevAmount === null || prevAmount <= 0 || !seriesKey) return;
    if (amount <= prevAmount * PRICE_INCREASE_FACTOR) return;

    const params = {
      merchant: expense.merchant ?? expense.description ?? '',
      oldAmount: prevAmount.toFixed(2),
      newAmount: amount.toFixed(2),
      currencyCode: expense.currencyCode,
      percent: Math.round(((amount - prevAmount) / prevAmount) * 100),
    };
    await this.createAlert({
      accountId,
      userId,
      type: 'price_increase',
      dedupKey: `price:${seriesKey}:${monthKey(expense.date)}`,
      params,
      expenseId: expense.id,
      pushTitle: (lang) => ni18n.priceIncreaseTitle(lang, params),
      pushBody: (lang) => ni18n.priceIncreaseBody(lang, params),
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/modules/anomaly/anomaly.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/anomaly
git commit -m "ABA-242 Anomaly detector: subscription/series price increase"
```

---

### Task 7: recurring_suggestion detector

**Files:**
- Modify: `apps/api/src/modules/anomaly/anomaly.service.ts`
- Modify: `apps/api/src/modules/anomaly/anomaly.service.spec.ts`

- [ ] **Step 1: Write failing tests**

```typescript
describe('detectRecurringSuggestion', () => {
  const monthlyDates = [
    { date: new Date('2026-04-10') },
    { date: new Date('2026-05-10') },
    { date: new Date('2026-06-10') },
  ];

  it('alerts on the 3rd same-amount monthly charge of an untracked merchant', async () => {
    const { service, prisma } = makeService();
    prisma.userSubscription.findMany = jest.fn().mockResolvedValue([]);
    prisma.expense.findMany = jest.fn().mockResolvedValue(monthlyDates);
    const createSpy = jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);

    await service.detectRecurringSuggestion('acc-1', 'user-1', expenseRow() as any);

    expect(createSpy).toHaveBeenCalledTimes(1);
    const arg = createSpy.mock.calls[0][0];
    expect(arg.type).toBe('recurring_suggestion');
    expect(arg.dedupKey).toBe('recur:netflix');
    expect(arg.params).toMatchObject({ merchant: 'Netflix', cycle: 'monthly' });
  });

  it('skips when a tracked subscription already matches the merchant', async () => {
    const { service, prisma } = makeService();
    prisma.userSubscription.findMany = jest.fn().mockResolvedValue([{ name: 'NETFLIX' }]);
    const createSpy = jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);
    await service.detectRecurringSuggestion('acc-1', 'user-1', expenseRow() as any);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('skips expenses that are already part of a recurring series', async () => {
    const { service } = makeService();
    const createSpy = jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);
    await service.detectRecurringSuggestion('acc-1', 'user-1', expenseRow({ recurringId: 'rec-1' }) as any);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('skips with fewer than 3 charges', async () => {
    const { service, prisma } = makeService();
    prisma.userSubscription.findMany = jest.fn().mockResolvedValue([]);
    prisma.expense.findMany = jest.fn().mockResolvedValue(monthlyDates.slice(1));
    const createSpy = jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);
    await service.detectRecurringSuggestion('acc-1', 'user-1', expenseRow() as any);
    expect(createSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/modules/anomaly/anomaly.service.spec.ts`
Expected: FAIL — `detectRecurringSuggestion is not a function`.

- [ ] **Step 3: Implement**

```typescript
  /** 3+ regular same-amount charges from an untracked merchant → suggest tracking as a subscription. */
  async detectRecurringSuggestion(accountId: string, userId: string, expense: any): Promise<void> {
    if (!expense.merchant?.trim()) return;
    if (expense.isRecurring || expense.recurringId) return;
    const merchantNorm = normalizeMerchant(expense.merchant);

    const subs = await this.prisma.userSubscription.findMany({
      where: { accountId, isActive: true },
      select: { name: true },
    });
    if (subs.some((s: { name: string }) => normalizeMerchant(s.name) === merchantNorm)) return;

    const charges = await this.prisma.expense.findMany({
      where: {
        accountId,
        isDeleted: false,
        merchant: { equals: expense.merchant, mode: 'insensitive' },
        amount: expense.amount,
        currencyCode: expense.currencyCode,
        date: { gte: new Date(expense.date.getTime() - 100 * DAY_MS), lte: expense.date },
      },
      orderBy: { date: 'asc' },
      select: { date: true },
    });
    if (charges.length < 3) return;

    const cycle = detectCycle(charges.map((c: { date: Date }) => c.date));
    if (!cycle) return;

    const params = {
      merchant: expense.merchant,
      amount: Number(expense.amount).toFixed(2),
      currencyCode: expense.currencyCode,
      cycle,
    };
    await this.createAlert({
      accountId,
      userId,
      type: 'recurring_suggestion',
      dedupKey: `recur:${merchantNorm}`,
      params,
      expenseId: expense.id,
      pushTitle: (lang) => ni18n.recurringSuggestionTitle(lang, params),
      pushBody: (lang) => ni18n.recurringSuggestionBody(lang, params),
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/modules/anomaly/anomaly.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/anomaly
git commit -m "ABA-242 Anomaly detector: looks-like-a-subscription suggestion"
```

---

### Task 8: category_spike detector + retire the old implementation

**Files:**
- Modify: `apps/api/src/modules/anomaly/anomaly.service.ts` (+spec)
- Modify: `apps/api/src/modules/budgets/budget-alert.service.ts`
- Modify: `apps/api/src/modules/expenses/expenses.controller.ts`
- Modify: `apps/api/src/modules/expenses/expenses.controller.spec.ts`

- [ ] **Step 1: Write failing tests**

```typescript
describe('detectCategorySpike', () => {
  function spikeService(currentSum: number, prevRows: Array<{ amount: number; date: Date }>) {
    const { service, prisma } = makeService();
    prisma.expense.aggregate = jest.fn().mockResolvedValue({ _sum: { amount: currentSum } });
    prisma.expense.findMany = jest.fn().mockResolvedValue(prevRows);
    const createSpy = jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);
    return { service, prisma, createSpy };
  }

  // two previous months, 100 each → avg 100
  const twoMonths = [
    { amount: 100, date: new Date('2026-04-15') },
    { amount: 100, date: new Date('2026-05-15') },
  ];

  it('alerts when current month is ≥30% above the previous average (no budget required)', async () => {
    const { service, createSpy } = spikeService(150, twoMonths);
    await service.detectCategorySpike('acc-1', 'user-1', 'cat-1');
    expect(createSpy).toHaveBeenCalledTimes(1);
    const arg = createSpy.mock.calls[0][0];
    expect(arg.type).toBe('category_spike');
    expect(arg.dedupKey).toMatch(/^spike:cat-1:\d{4}-\d{2}$/);
    expect(arg.params).toMatchObject({ categoryName: 'Food', percent: 50 });
  });

  it('does not alert below the 30% threshold', async () => {
    const { service, createSpy } = spikeService(129, twoMonths);
    await service.detectCategorySpike('acc-1', 'user-1', 'cat-1');
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('requires at least 2 months of history', async () => {
    const { service, createSpy } = spikeService(150, [{ amount: 100, date: new Date('2026-05-15') }]);
    await service.detectCategorySpike('acc-1', 'user-1', 'cat-1');
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('no-ops on null categoryId', async () => {
    const { service, createSpy } = spikeService(150, twoMonths);
    await service.detectCategorySpike('acc-1', 'user-1', null);
    expect(createSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/modules/anomaly/anomaly.service.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
  /** Current-month category total ≥30% above the avg of the previous ≤3 months (≥2 required). */
  async detectCategorySpike(accountId: string, userId: string, categoryId: string | null): Promise<void> {
    if (!categoryId) return;
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const current = await this.prisma.expense.aggregate({
      _sum: { amount: true },
      where: { accountId, categoryId, isDeleted: false, date: { gte: currentMonthStart } },
    });
    const currentAmount = Number(current._sum.amount ?? 0);
    if (currentAmount <= 0) return;

    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const previous = await this.prisma.expense.findMany({
      where: { accountId, categoryId, isDeleted: false, date: { gte: threeMonthsAgo, lt: currentMonthStart } },
      select: { amount: true, date: true },
    });
    const byMonth = new Map<string, number>();
    for (const e of previous) {
      const k = `${e.date.getFullYear()}-${e.date.getMonth()}`;
      byMonth.set(k, (byMonth.get(k) ?? 0) + Number(e.amount));
    }
    if (byMonth.size < 2) return;
    const avg = [...byMonth.values()].reduce((a, b) => a + b, 0) / byMonth.size;
    if (avg <= 0) return;

    const percent = Math.round(((currentAmount - avg) / avg) * 100);
    if (percent < SPIKE_THRESHOLD_PERCENT) return;

    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { name: true },
    });
    const params = { categoryId, categoryName: category?.name ?? 'Uncategorized', percent };
    await this.createAlert({
      accountId,
      userId,
      type: 'category_spike',
      dedupKey: `spike:${categoryId}:${monthKey(now)}`,
      params,
      categoryId,
      pushTitle: (lang) => ni18n.anomalyTitle(lang, params),
      pushBody: (lang) => ni18n.anomalyBody(lang, params),
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/modules/anomaly/anomaly.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Delete the old implementation**

- `apps/api/src/modules/budgets/budget-alert.service.ts`: delete the whole `checkSpendingAnomalies` method (lines ≈40–152). Keep `checkBudgetsForAccount` and everything else.
- `apps/api/src/modules/expenses/expenses.controller.ts`: delete the call block

```typescript
      this.budgetAlertService.checkSpendingAnomalies(req.accountId, req.user.id)
        .catch(e => this.logger.error('Spending anomaly check failed', e));
```

- `apps/api/src/modules/expenses/expenses.controller.spec.ts`: remove the `checkSpendingAnomalies: jest.fn()...` mock line and any assertion referencing it.

- [ ] **Step 6: Run the full API test suite**

Run from `apps/api/`: `npx jest`
Expected: PASS (no remaining references — verify with `grep -r checkSpendingAnomalies apps/api/src` → no matches).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/anomaly apps/api/src/modules/budgets apps/api/src/modules/expenses
git commit -m "ABA-242 Anomaly detector: category spike (no budget required); retire BudgetAlertService.checkSpendingAnomalies"
```

---

### Task 9: Orchestration hooks + feed endpoints

**Files:**
- Modify: `apps/api/src/modules/anomaly/anomaly.service.ts` (+spec)
- Create: `apps/api/src/modules/anomaly/anomaly.controller.ts` (+spec)
- Modify: `apps/api/src/modules/anomaly/anomaly.module.ts`
- Modify: `apps/api/src/modules/expenses/expenses.service.ts`, `expenses.module.ts`, `expenses.service.spec.ts`
- Modify: `apps/api/src/modules/import-bank/import-bank.service.ts`, `import-bank.module.ts`
- Modify: `apps/api/src/modules/import-wise/import-wise.service.ts`, `import-wise.module.ts`

- [ ] **Step 1: Add orchestrators + feed methods to AnomalyService**

```typescript
  /** Entry point for a single new expense. Never throws. */
  async checkExpense(accountId: string, userId: string, expenseId: string): Promise<void> {
    try {
      const expense = await this.prisma.expense.findFirst({
        where: { id: expenseId, accountId, isDeleted: false },
      });
      if (!expense) return;
      // duplicate first — highest priority for the daily push cap
      await this.detectDuplicateCharge(accountId, userId, expense);
      await this.detectPriceIncrease(accountId, userId, expense);
      await this.detectRecurringSuggestion(accountId, userId, expense);
      await this.detectCategorySpike(accountId, userId, expense.categoryId);
    } catch (error) {
      this.logger.error(`checkExpense failed: ${error}`);
    }
  }

  /** Entry point for import commits. Skips the duplicate detector (preview already dedups). */
  async checkExpenseBatch(accountId: string, userId: string, expenseIds: string[]): Promise<void> {
    try {
      if (expenseIds.length === 0) return;
      const expenses = await this.prisma.expense.findMany({
        where: { id: { in: expenseIds }, accountId, isDeleted: false },
      });
      const categoryIds = new Set<string>();
      for (const expense of expenses) {
        await this.detectPriceIncrease(accountId, userId, expense);
        await this.detectRecurringSuggestion(accountId, userId, expense);
        if (expense.categoryId) categoryIds.add(expense.categoryId);
      }
      for (const categoryId of categoryIds) {
        await this.detectCategorySpike(accountId, userId, categoryId);
      }
    } catch (error) {
      this.logger.error(`checkExpenseBatch failed: ${error}`);
    }
  }

  // ---- Feed ----

  async findAll(accountId: string, unreadOnly: boolean) {
    const [alerts, unreadCount] = await Promise.all([
      this.prisma.anomalyAlert.findMany({
        where: { accountId, dismissedAt: null, ...(unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.anomalyAlert.count({
        where: { accountId, dismissedAt: null, readAt: null },
      }),
    ]);
    return { alerts, unreadCount };
  }

  async markRead(accountId: string, id: string) {
    await this.prisma.anomalyAlert.updateMany({
      where: { id, accountId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }

  async markAllRead(accountId: string) {
    await this.prisma.anomalyAlert.updateMany({
      where: { accountId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }

  async dismiss(accountId: string, id: string) {
    await this.prisma.anomalyAlert.updateMany({
      where: { id, accountId },
      data: { dismissedAt: new Date() },
    });
    return { success: true };
  }
```

Add a spec for the orchestrator's batch behavior (append to `anomaly.service.spec.ts`):

```typescript
describe('checkExpenseBatch', () => {
  it('skips the duplicate detector and dedups category checks', async () => {
    const { service, prisma } = makeService();
    prisma.expense.findMany = jest.fn().mockResolvedValue([
      expenseRow({ id: 'e-1', categoryId: 'cat-1' }),
      expenseRow({ id: 'e-2', categoryId: 'cat-1' }),
    ]);
    const dup = jest.spyOn(service, 'detectDuplicateCharge').mockResolvedValue(undefined);
    const price = jest.spyOn(service, 'detectPriceIncrease').mockResolvedValue(undefined);
    const recur = jest.spyOn(service, 'detectRecurringSuggestion').mockResolvedValue(undefined);
    const spike = jest.spyOn(service, 'detectCategorySpike').mockResolvedValue(undefined);

    await service.checkExpenseBatch('acc-1', 'user-1', ['e-1', 'e-2']);

    expect(dup).not.toHaveBeenCalled();
    expect(price).toHaveBeenCalledTimes(2);
    expect(recur).toHaveBeenCalledTimes(2);
    expect(spike).toHaveBeenCalledTimes(1); // same category checked once
  });
});
```

Run: `npx jest src/modules/anomaly/anomaly.service.spec.ts` → PASS.

- [ ] **Step 2: Controller + route-order spec**

`apps/api/src/modules/anomaly/anomaly.controller.ts`:

```typescript
import { Controller, Get, Patch, Delete, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AnomalyService } from './anomaly.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { AuthenticatedRequest } from '../../common/types';

@Controller('alerts')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class AnomalyController {
  constructor(private readonly service: AnomalyService) {}

  @Get()
  findAll(@Req() req: AuthenticatedRequest, @Query('unread') unread?: string) {
    return this.service.findAll(req.accountId, unread === 'true');
  }

  // `read-all` MUST be declared before the `:id` routes below — Express matches
  // in declaration order (same lesson as /expenses/bulk, ABA-166).
  @Patch('read-all')
  @UseGuards(new ViewerBlockGuard())
  markAllRead(@Req() req: AuthenticatedRequest) {
    return this.service.markAllRead(req.accountId);
  }

  @Patch(':id/read')
  @UseGuards(new ViewerBlockGuard())
  markRead(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.markRead(req.accountId, id);
  }

  @Delete(':id')
  @UseGuards(new ViewerBlockGuard())
  dismiss(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.dismiss(req.accountId, id);
  }
}
```

Write endpoints (`read-all`, `:id/read`, `DELETE :id`) carry `ViewerBlockGuard` — read/dismiss state is account-wide, so a viewer mutating it would affect all members. `GET /alerts` stays viewer-accessible.

`apps/api/src/modules/anomaly/anomaly.controller.spec.ts`:

```typescript
import { AnomalyController } from './anomaly.controller';

describe('AnomalyController', () => {
  const service: any = {
    findAll: jest.fn().mockResolvedValue({ alerts: [], unreadCount: 0 }),
    markRead: jest.fn().mockResolvedValue({ success: true }),
    markAllRead: jest.fn().mockResolvedValue({ success: true }),
    dismiss: jest.fn().mockResolvedValue({ success: true }),
  };
  const controller = new AnomalyController(service);
  const req: any = { accountId: 'acc-1', user: { id: 'user-1' } };

  it('read-all is declared before :id routes (Express declaration order)', () => {
    const methods = Object.getOwnPropertyNames(AnomalyController.prototype);
    expect(methods.indexOf('markAllRead')).toBeLessThan(methods.indexOf('markRead'));
  });

  it('scopes every call to req.accountId', async () => {
    await controller.findAll(req, 'true');
    expect(service.findAll).toHaveBeenCalledWith('acc-1', true);
    await controller.markRead(req, 'a-1');
    expect(service.markRead).toHaveBeenCalledWith('acc-1', 'a-1');
    await controller.markAllRead(req);
    expect(service.markAllRead).toHaveBeenCalledWith('acc-1');
    await controller.dismiss(req, 'a-1');
    expect(service.dismiss).toHaveBeenCalledWith('acc-1', 'a-1');
  });
});
```

Register the controller in `anomaly.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AnomalyController } from './anomaly.controller';
import { AnomalyService } from './anomaly.service';

@Module({
  controllers: [AnomalyController],
  providers: [AnomalyService],
  exports: [AnomalyService],
})
export class AnomalyModule {}
```

Run: `npx jest src/modules/anomaly` → PASS.

- [ ] **Step 3: Hook into ExpensesService.create**

`apps/api/src/modules/expenses/expenses.module.ts` — add `AnomalyModule` to imports:

```typescript
import { AnomalyModule } from '../anomaly/anomaly.module';
// imports: [BudgetsModule, GamificationModule, AnomalyModule],
```

`apps/api/src/modules/expenses/expenses.service.ts` — inject and call:

```typescript
import { AnomalyService } from '../anomaly/anomaly.service';
// constructor gains:
    private readonly anomalyService: AnomalyService,
```

At the end of `create(...)`, right before the final `return`, where the transaction result (`{ expense, isNew }` shape) is available:

```typescript
    if (result.isNew && result.expense) {
      this.anomalyService
        .checkExpense(accountId, userId, result.expense.id)
        .catch(() => {});
    }
```

(Anchor on the actual local variable name holding the `{ expense, isNew }` result in `create` — adapt `result` accordingly.)

Update `expenses.service.spec.ts` — `makeService` constructs the service directly; add a 4th constructor arg:

```typescript
    const anomalyService: any = { checkExpense: jest.fn().mockResolvedValue(undefined) };
    const service = new ExpensesService(prisma, gamificationService, cacheService, anomalyService);
```

- [ ] **Step 4: Hook into both import commits**

`apps/api/src/modules/import-bank/import-bank.module.ts` and `apps/api/src/modules/import-wise/import-wise.module.ts`: add `AnomalyModule` to `imports`.

In **both** services, inject `private readonly anomaly: AnomalyService` (import from `'../anomaly/anomaly.service'`).

In `import-bank.service.ts` `commit()`: collect created expense ids — change the expense branch to capture the row and push its id:

```typescript
            const created = await (tx as any).expense.create({
              data: { /* unchanged */ },
              select: { id: true },
            });
            createdExpenseIds.push(created.id);
            createdExpenses++;
```

with `const createdExpenseIds: string[] = [];` declared next to the other counters, and after the `$transaction` block resolves:

```typescript
    this.anomaly.checkExpenseBatch(accountId, userId, createdExpenseIds).catch(() => {});
```

Apply the identical pattern in `import-wise.service.ts` `commit()` (same expense-branch shape at ≈line 272).

- [ ] **Step 5: Full API verification**

Run from `apps/api/`: `npx jest` then `npx tsc --noEmit -p tsconfig.json`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src
git commit -m "ABA-242 Wire anomaly checks into expense create + import commits; /alerts feed endpoints"
```

---

### Task 10: Mobile API client + store

**Files:**
- Create: `apps/mobile/src/services/alerts.api.ts`
- Modify: `apps/mobile/src/services/api.ts`
- Create: `apps/mobile/src/stores/alertStore.ts`

- [ ] **Step 1: API client**

`apps/mobile/src/services/alerts.api.ts`:

```typescript
import { httpClient } from './http-client';
import type { AnomalyAlertListResponse } from '@budget/shared-types';

export const alertsApi = {
  listAlerts() {
    return httpClient.request<AnomalyAlertListResponse>('/alerts');
  },

  markAlertRead(id: string) {
    return httpClient.request<{ success: boolean }>(`/alerts/${id}/read`, { method: 'PATCH' });
  },

  markAllAlertsRead() {
    return httpClient.request<{ success: boolean }>('/alerts/read-all', { method: 'PATCH' });
  },

  dismissAlert(id: string) {
    return httpClient.request<{ success: boolean }>(`/alerts/${id}`, { method: 'DELETE' });
  },
};
```

- [ ] **Step 2: Barrel**

`apps/mobile/src/services/api.ts` — add `import { alertsApi } from './alerts.api';` and `...alertsApi,` at the end of the `api` object.

- [ ] **Step 3: Store**

`apps/mobile/src/stores/alertStore.ts`:

```typescript
import { create } from 'zustand';
import { api } from '@/services/api';
import type { AnomalyAlert } from '@budget/shared-types';

interface AlertState {
  alerts: AnomalyAlert[];
  unreadCount: number;
  isLoading: boolean;

  loadAlerts: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  reset: () => void;
}

export const useAlertStore = create<AlertState>((set, get) => ({
  alerts: [],
  unreadCount: 0,
  isLoading: false,

  async loadAlerts() {
    set({ isLoading: true });
    try {
      const { alerts, unreadCount } = await api.listAlerts();
      set({ alerts, unreadCount, isLoading: false });
    } catch (e) {
      // Offline or server error — keep whatever we had; feed is server-backed only.
      console.warn('Failed to load alerts:', e);
      set({ isLoading: false });
    }
  },

  async markRead(id) {
    const { alerts, unreadCount } = get();
    const target = alerts.find((a) => a.id === id);
    if (!target || target.readAt) return;
    set({
      alerts: alerts.map((a) => (a.id === id ? { ...a, readAt: new Date().toISOString() } : a)),
      unreadCount: Math.max(0, unreadCount - 1),
    });
    api.markAlertRead(id).catch((e) => console.warn('Failed to mark alert read:', e));
  },

  async markAllRead() {
    const now = new Date().toISOString();
    set((s) => ({
      alerts: s.alerts.map((a) => (a.readAt ? a : { ...a, readAt: now })),
      unreadCount: 0,
    }));
    api.markAllAlertsRead().catch((e) => console.warn('Failed to mark alerts read:', e));
  },

  async dismiss(id) {
    set((s) => {
      const target = s.alerts.find((a) => a.id === id);
      return {
        alerts: s.alerts.filter((a) => a.id !== id),
        unreadCount: target && !target.readAt ? Math.max(0, s.unreadCount - 1) : s.unreadCount,
      };
    });
    api.dismissAlert(id).catch((e) => console.warn('Failed to dismiss alert:', e));
  },

  reset() {
    set({ alerts: [], unreadCount: 0, isLoading: false });
  },
}));
```

- [ ] **Step 4: Typecheck + commit**

Run from repo root: `npm run typecheck`
Expected: PASS.

```bash
git add apps/mobile/src/services apps/mobile/src/stores/alertStore.ts
git commit -m "ABA-242 Mobile: alerts API client + alertStore"
```

---

### Task 11: Mobile UI — bell icon, alerts screen, deep-link, settings toggle

**Files:**
- Create: `apps/mobile/app/alerts/index.tsx`
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `apps/mobile/app/(tabs)/index.tsx`
- Modify: `apps/mobile/src/services/notifications.ts`
- Modify: `apps/mobile/app/settings/notifications.tsx`

- [ ] **Step 1: Alerts screen**

`apps/mobile/app/alerts/index.tsx` (uses the project's theme/i18n conventions — mirror imports from `app/subscriptions/index.tsx` for `useTheme`/`useTranslation` paths):

```tsx
import React, { useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAlertStore } from '@/stores/alertStore';
import { useTheme } from '@/theme';
import type { AnomalyAlert } from '@budget/shared-types';

const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  duplicate_charge: 'copy-outline',
  price_increase: 'trending-up-outline',
  category_spike: 'flame-outline',
  recurring_suggestion: 'repeat-outline',
};

export default function AlertsScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = createStyles(theme);
  const { alerts, isLoading, loadAlerts, markRead, markAllRead, dismiss } = useAlertStore();

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const renderBody = useCallback(
    (alert: AnomalyAlert): { title: string; body: string } => {
      const p = alert.params as Record<string, string | number>;
      switch (alert.type) {
        case 'duplicate_charge':
          return {
            title: t('alerts.duplicateTitle'),
            body: t('alerts.duplicateBody', { merchant: p.merchant, amount: p.amount, currency: p.currencyCode }),
          };
        case 'price_increase':
          return {
            title: t('alerts.priceIncreaseTitle', { merchant: p.merchant }),
            body: t('alerts.priceIncreaseBody', {
              merchant: p.merchant, oldAmount: p.oldAmount, newAmount: p.newAmount,
              currency: p.currencyCode, percent: p.percent,
            }),
          };
        case 'category_spike':
          return {
            title: t('alerts.spikeTitle'),
            body: t('alerts.spikeBody', { category: p.categoryName, percent: p.percent }),
          };
        case 'recurring_suggestion':
          return {
            title: t('alerts.recurringTitle', { merchant: p.merchant }),
            body: t('alerts.recurringBody', {
              merchant: p.merchant, amount: p.amount, currency: p.currencyCode,
              cycle: t(p.cycle === 'weekly' ? 'alerts.cycleWeekly' : 'alerts.cycleMonthly'),
            }),
          };
        default:
          return { title: String(alert.type), body: '' };
      }
    },
    [t],
  );

  const handlePress = useCallback(
    (alert: AnomalyAlert) => {
      markRead(alert.id);
      if (alert.type === 'recurring_suggestion') {
        const p = alert.params as Record<string, string>;
        router.push({
          pathname: '/subscriptions/new' as any,
          params: { name: p.merchant, amount: String(p.amount), detectedFrom: p.merchant },
        });
      } else if (alert.expenseId) {
        router.push(`/expense/${alert.expenseId}` as any);
      }
    },
    [markRead],
  );

  const renderItem = ({ item }: { item: AnomalyAlert }) => {
    const { title, body } = renderBody(item);
    return (
      <TouchableOpacity
        style={[styles.card, !item.readAt && styles.cardUnread]}
        onPress={() => handlePress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.iconBox}>
          <Ionicons name={TYPE_ICON[item.type] ?? 'alert-circle-outline'} size={22} color={theme.colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardBody}>{body}</Text>
          <Text style={styles.cardDate}>
            {new Date(item.createdAt).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })}
          </Text>
        </View>
        <TouchableOpacity onPress={() => dismiss(item.id)} hitSlop={8} style={styles.dismissBtn}>
          <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerRight: () =>
            alerts.some((a) => !a.readAt) ? (
              <TouchableOpacity onPress={markAllRead} hitSlop={8}>
                <Text style={styles.markAll}>{t('alerts.markAllRead')}</Text>
              </TouchableOpacity>
            ) : null,
        }}
      />
      <FlatList
        data={alerts}
        keyExtractor={(a) => a.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadAlerts} />}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={44} color={theme.colors.textSecondary} />
              <Text style={styles.emptyText}>{t('alerts.empty')}</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    list: { padding: 16, gap: 10 },
    card: {
      flexDirection: 'row',
      backgroundColor: theme.colors.card,
      borderRadius: 14,
      padding: 14,
      gap: 12,
      alignItems: 'flex-start',
    },
    cardUnread: { borderLeftWidth: 3, borderLeftColor: theme.colors.primary },
    iconBox: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: theme.colors.primary + '18',
      alignItems: 'center', justifyContent: 'center',
    },
    cardTitle: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
    cardBody: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
    cardDate: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 6 },
    dismissBtn: { padding: 2 },
    markAll: { color: theme.colors.primary, fontSize: 14, fontWeight: '600' },
    empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
    emptyText: { color: theme.colors.textSecondary, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  });
```

(Verify the actual theme hook/import path against `app/subscriptions/index.tsx` at execution time and match it exactly — including `colors.card` vs `colors.surface` naming.)

- [ ] **Step 2: Register the screen with a header**

`apps/mobile/app/_layout.tsx` — next to the `subscriptions/index` registration (≈line 683) add:

```tsx
        <Stack.Screen
          name="alerts/index"
          options={{
            headerShown: true,
            title: t('alerts.title'),
          }}
        />
```

- [ ] **Step 3: Bell icon + badge on the home hero header**

`apps/mobile/app/(tabs)/index.tsx` — in the hero top row, insert between the welcome text and the settings button (≈line 184):

```tsx
          <TouchableOpacity
            onPress={() => router.push('/alerts' as any)}
            style={styles.settingsButton}
          >
            <Ionicons name="notifications-outline" size={22} color="#FFFFFF" />
            {unreadAlertCount > 0 && (
              <View style={styles.alertBadge}>
                <Text style={styles.alertBadgeText}>{unreadAlertCount > 9 ? '9+' : unreadAlertCount}</Text>
              </View>
            )}
          </TouchableOpacity>
```

Wire the count + load at the top of the component (with the other store hooks):

```tsx
const unreadAlertCount = useAlertStore((s) => s.unreadCount);
const loadAlerts = useAlertStore((s) => s.loadAlerts);
```

and in the existing `useEffect` keyed on `[currentAccountId]` (the one calling `hydrateTransactions()`), add `loadAlerts();`. Import: `import { useAlertStore } from '@/stores/alertStore';`

Add styles:

```tsx
  alertBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  alertBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
```

- [ ] **Step 4: Push deep-link**

`apps/mobile/src/services/notifications.ts` — add a case to the `switch (data.type)` in `handleNotificationResponse`:

```typescript
    case 'spending_anomaly':
      router.push('/alerts' as any);
      break;
```

- [ ] **Step 5: Settings toggle**

`apps/mobile/app/settings/notifications.tsx` — mirror the `subscriptionRenewals` pattern exactly:

1. State: `const [notifAnomalyAlerts, setNotifAnomalyAlerts] = useState(true);`
2. In `loadNotificationPreferences`: `setNotifAnomalyAlerts(prefs.anomalyAlerts ?? true);`
3. Handler:

```tsx
  const handleToggleAnomalyAlerts = async (value: boolean) => {
    setNotifAnomalyAlerts(value);
    try {
      await api.updateNotificationPreferences({ anomalyAlerts: value });
    } catch (e) {
      setNotifAnomalyAlerts(!value);
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };
```

4. Add `anomalyAlerts: value` to the master toggle's `updateNotificationPreferences` call and `setNotifAnomalyAlerts(value)` / rollback lines alongside the others.
5. New row after the subscription-renewals row (same `fieldRow` + `Switch` markup) using `t('notifications.anomalyAlerts')` / `t('notifications.anomalyAlertsDesc')` and `notifAnomalyAlerts` / `handleToggleAnomalyAlerts`.

Also check `apps/mobile/src/services/users.api.ts`: the `updateNotificationPreferences` input type must accept `anomalyAlerts?: boolean` (extend it if it's an inline type).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app apps/mobile/src/services
git commit -m "ABA-242 Mobile: alerts feed screen, home bell badge, push deep-link, preference toggle"
```

---

### Task 12: Mobile i18n (9 locales)

**Files:**
- Modify: `apps/mobile/src/i18n/locales/{en,ru,ua,pl,es,fr,de,be,nl}.ts`

- [ ] **Step 1: Invoke the `i18n-add-strings` skill** (it enforces 9-file sync), adding this new top-level `alerts` section plus two keys in the existing `notifications` section. EN source:

```typescript
  alerts: {
    title: 'Alerts',
    empty: 'No alerts yet. We\'ll notify you when something unusual happens with your money.',
    markAllRead: 'Mark all read',
    duplicateTitle: 'Possible duplicate charge',
    duplicateBody: '{{merchant}} charged {{amount}} {{currency}} twice within two days.',
    priceIncreaseTitle: '{{merchant}} got more expensive',
    priceIncreaseBody: 'Was {{oldAmount}}, now {{newAmount}} {{currency}} (+{{percent}}%).',
    spikeTitle: 'Unusual spending',
    spikeBody: '{{category}} is {{percent}}% above your 3-month average.',
    recurringTitle: '{{merchant}} looks like a subscription',
    recurringBody: 'Charged {{amount}} {{currency}} {{cycle}} at least 3 times. Tap to track it.',
    cycleMonthly: 'monthly',
    cycleWeekly: 'weekly',
  },
```

and in `notifications`:

```typescript
    anomalyAlerts: 'Anomaly alerts',
    anomalyAlertsDesc: 'Unusual spending, price increases and duplicate charges',
```

Translations per locale:

| key | ru | ua | pl |
|---|---|---|---|
| title | Уведомления | Сповіщення | Alerty |
| empty | Пока нет уведомлений. Мы сообщим, когда заметим что-то необычное в ваших финансах. | Поки немає сповіщень. Ми повідомимо, коли помітимо щось незвичайне у ваших фінансах. | Brak alertów. Powiadomimy Cię, gdy zauważymy coś nietypowego w Twoich finansach. |
| markAllRead | Прочитать все | Прочитати всі | Oznacz jako przeczytane |
| duplicateTitle | Возможен повторный платёж | Можливий повторний платіж | Możliwa podwójna płatność |
| duplicateBody | {{merchant}} списал {{amount}} {{currency}} дважды за два дня. | {{merchant}} списав {{amount}} {{currency}} двічі за два дні. | {{merchant}} pobrał {{amount}} {{currency}} dwa razy w ciągu dwóch dni. |
| priceIncreaseTitle | {{merchant}} подорожал | {{merchant}} подорожчав | {{merchant}} podrożał |
| priceIncreaseBody | Было {{oldAmount}}, стало {{newAmount}} {{currency}} (+{{percent}}%). | Було {{oldAmount}}, стало {{newAmount}} {{currency}} (+{{percent}}%). | Było {{oldAmount}}, teraz {{newAmount}} {{currency}} (+{{percent}}%). |
| spikeTitle | Необычные траты | Незвичайні витрати | Nietypowe wydatki |
| spikeBody | {{category}}: на {{percent}}% выше средней за 3 месяца. | {{category}}: на {{percent}}% вище за середню за 3 місяці. | {{category}}: {{percent}}% powyżej średniej z 3 miesięcy. |
| recurringTitle | {{merchant}} похож на подписку | {{merchant}} схожий на підписку | {{merchant}} wygląda na subskrypcję |
| recurringBody | Списания {{amount}} {{currency}} {{cycle}} минимум 3 раза. Нажмите, чтобы отслеживать. | Списання {{amount}} {{currency}} {{cycle}} щонайменше 3 рази. Натисніть, щоб відстежувати. | Pobrano {{amount}} {{currency}} {{cycle}} co najmniej 3 razy. Dotknij, aby śledzić. |
| cycleMonthly | ежемесячно | щомісяця | co miesiąc |
| cycleWeekly | еженедельно | щотижня | co tydzień |
| anomalyAlerts | Аномалии | Аномалії | Anomalie |
| anomalyAlertsDesc | Необычные траты, подорожания и повторные платежи | Незвичайні витрати, подорожчання та повторні платежі | Nietypowe wydatki, podwyżki cen i podwójne płatności |

| key | es | fr | de |
|---|---|---|---|
| title | Alertas | Alertes | Hinweise |
| empty | Aún no hay alertas. Te avisaremos cuando notemos algo inusual en tus finanzas. | Pas encore d'alertes. Nous vous préviendrons en cas d'activité inhabituelle. | Noch keine Hinweise. Wir melden uns, wenn uns etwas Ungewöhnliches auffällt. |
| markAllRead | Marcar todo como leído | Tout marquer comme lu | Alle als gelesen markieren |
| duplicateTitle | Posible cargo duplicado | Possible double prélèvement | Mögliche doppelte Abbuchung |
| duplicateBody | {{merchant}} cobró {{amount}} {{currency}} dos veces en dos días. | {{merchant}} a prélevé {{amount}} {{currency}} deux fois en deux jours. | {{merchant}} hat {{amount}} {{currency}} zweimal in zwei Tagen abgebucht. |
| priceIncreaseTitle | {{merchant}} ha subido de precio | {{merchant}} a augmenté | {{merchant}} ist teurer geworden |
| priceIncreaseBody | Antes {{oldAmount}}, ahora {{newAmount}} {{currency}} (+{{percent}}%). | Avant {{oldAmount}}, maintenant {{newAmount}} {{currency}} (+{{percent}} %). | Vorher {{oldAmount}}, jetzt {{newAmount}} {{currency}} (+{{percent}} %). |
| spikeTitle | Gasto inusual | Dépense inhabituelle | Ungewöhnliche Ausgaben |
| spikeBody | {{category}}: {{percent}}% por encima de tu media de 3 meses. | {{category}} : {{percent}} % au-dessus de votre moyenne sur 3 mois. | {{category}}: {{percent}} % über deinem 3-Monats-Durchschnitt. |
| recurringTitle | {{merchant}} parece una suscripción | {{merchant}} ressemble à un abonnement | {{merchant}} sieht nach einem Abo aus |
| recurringBody | Cobró {{amount}} {{currency}} {{cycle}} al menos 3 veces. Toca para seguirla. | {{amount}} {{currency}} prélevés {{cycle}} au moins 3 fois. Touchez pour suivre. | Mindestens 3-mal {{amount}} {{currency}} {{cycle}} abgebucht. Tippe zum Verfolgen. |
| cycleMonthly | mensualmente | chaque mois | monatlich |
| cycleWeekly | semanalmente | chaque semaine | wöchentlich |
| anomalyAlerts | Alertas de anomalías | Alertes d'anomalies | Anomalie-Hinweise |
| anomalyAlertsDesc | Gastos inusuales, subidas de precio y cargos duplicados | Dépenses inhabituelles, hausses de prix et doubles prélèvements | Ungewöhnliche Ausgaben, Preiserhöhungen und doppelte Abbuchungen |

| key | be | nl |
|---|---|---|
| title | Апавяшчэнні | Meldingen |
| empty | Пакуль няма апавяшчэнняў. Мы паведамім, калі заўважым нешта незвычайнае ў вашых фінансах. | Nog geen meldingen. We laten het weten als er iets ongewoons gebeurt met je geld. |
| markAllRead | Прачытаць усе | Alles als gelezen markeren |
| duplicateTitle | Магчымы паўторны плацёж | Mogelijk dubbele afschrijving |
| duplicateBody | {{merchant}} спісаў {{amount}} {{currency}} двойчы за два дні. | {{merchant}} schreef {{amount}} {{currency}} twee keer af binnen twee dagen. |
| priceIncreaseTitle | {{merchant}} падаражэў | {{merchant}} is duurder geworden |
| priceIncreaseBody | Было {{oldAmount}}, стала {{newAmount}} {{currency}} (+{{percent}}%). | Was {{oldAmount}}, nu {{newAmount}} {{currency}} (+{{percent}}%). |
| spikeTitle | Незвычайныя выдаткі | Ongewone uitgaven |
| spikeBody | {{category}}: на {{percent}}% вышэй за сярэднюю за 3 месяцы. | {{category}}: {{percent}}% boven je 3-maands gemiddelde. |
| recurringTitle | {{merchant}} падобны на падпіску | {{merchant}} lijkt op een abonnement |
| recurringBody | Спісанні {{amount}} {{currency}} {{cycle}} мінімум 3 разы. Націсніце, каб адсочваць. | Minstens 3 keer {{amount}} {{currency}} {{cycle}} afgeschreven. Tik om te volgen. |
| cycleMonthly | штомесяц | maandelijks |
| cycleWeekly | штотыдзень | wekelijks |
| anomalyAlerts | Анамаліі | Anomaliemeldingen |
| anomalyAlertsDesc | Незвычайныя выдаткі, падаражанні і паўторныя плацяжы | Ongewone uitgaven, prijsstijgingen en dubbele afschrijvingen |

- [ ] **Step 2: Verify + commit**

Run from repo root: `npm run typecheck` and `npm run lint`
Expected: both PASS.

```bash
git add apps/mobile/src/i18n
git commit -m "ABA-242 Mobile i18n: alerts.* keys in all 9 locales"
```

---

### Task 13: Final verification, docs, issue

- [ ] **Step 1: Full verification**

From repo root:
```bash
npm run typecheck
npm run lint
npm run test
```
Expected: all PASS. Fix anything that fails before proceeding (superpowers:verification-before-completion).

- [ ] **Step 2: Manual smoke test (web)**

`npm run dev` (API) + `npm run dev:web`. Create two identical expenses with the same merchant → bell badge shows 1, `/alerts` lists a duplicate-charge card, tapping opens the expense. Toggle the new switch in Settings → Notifications.

- [ ] **Step 3: Invoke the `finish-aba-task` skill**

It covers: create the `ABA-{N}` GitHub issue (English, verify the number via `gh issue list --limit 1` + verify the URL after creation), update `CLAUDE.md` (new **Anomaly alerts** bullet under API patterns: module, detectors, dedup keys, push cap, endpoints, mobile feed; bump module count 36→37, store count 25→26, domain-api-file count 14→15, NotificationPreferences fields), and update `user_docs/` — add help section `31-anomaly-alerts` in all 9 languages via the `add-help-section` skill (markdown + `scripts/generate-help-content.js` SECTIONS + `src/help/sections.ts` + `npm run generate:help`).

- [ ] **Step 4: Final commit**

```bash
git add CLAUDE.md user_docs apps/mobile/src/help scripts docs
git commit -m "ABA-242 Docs: anomaly alerts — CLAUDE.md, help section, tech docs"
```

Do NOT push — per project rule, pushing requires explicit user approval.

---

## Self-review notes (resolved)

- Spec coverage: schema (T1), shared types (T2), push i18n + gate + prefs (T3), createAlert/dedup/cap (T4), 4 detectors (T5–T8), old detector retirement incl. controller spec (T8), hooks + batch + endpoints + route order (T9), mobile API/store (T10), bell/screen/deep-link/toggle (T11), 9-locale i18n (T12), tests + docs (T13). Out-of-scope items from the spec are untouched.
- Type consistency: `createAlert(input: CreateAlertInput)` with `pushTitle`/`pushBody` used identically in all four detectors; mobile uses `listAlerts`/`markAlertRead`/`markAllAlertsRead`/`dismissAlert` everywhere; `params` amounts are always `Number(x).toFixed(2)` strings.
- Known judgment calls an executor may adapt: exact insertion anchors (line numbers drift), the local variable name in `ExpensesService.create`, and theme color token names in the alerts screen (match `subscriptions/index.tsx`).
