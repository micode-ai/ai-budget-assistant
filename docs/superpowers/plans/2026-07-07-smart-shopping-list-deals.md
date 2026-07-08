# Smart Shopping List — Deal Alerts (M6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alert the user when a staple they buy is meaningfully cheaper than usual at one of their stores (a price drop), as a "Deals" strip + an opt-in daily push.

**Architecture:** A pure `detectDeals(rows, now?)` (a store's recent price ≥15% below the product's 90-day average) feeds a free `GET /shopping-list/deals` endpoint and is folded into the existing `shopping-reminder.cron.ts` (which already runs daily and sends restock reminders). A new `shopping_deal` notification type + `notifyShoppingDeals` preference gate the push. This mirrors the M3 restock machinery exactly.

**Tech Stack:** NestJS + Prisma + cron + Jest (API); Expo/RN + i18next (mobile).

## Global Constraints

- `detectDeals` is a PURE function (no Prisma), unit-tested, mirroring `restock-predictor.ts` / `basket-calculator.ts`.
- Deal detection is currency-consistent: per product, restrict to the majority currency of its price points; only compare within that currency.
- The deals endpoint is FREE (no `@RequireTier`); `JwtAuthGuard + AccountContextGuard`, `accountId` from `req`.
- Notification plumbing follows the M3 `shopping_reminder` pattern EXACTLY: new `NotificationType` member, new `User.notify*` column, a `sendToUser` select+gate line, `notification-i18n` entries in all 9 languages, a preference field in `GET/PATCH /users/me/notification-preferences`.
- The cron fold: the daily `shopping-reminder.cron.ts` sends AT MOST one `shopping_deal` push per account per run (naming the top deal), gated by `notifyShoppingDeals` — naturally ≤1/day/account. `sendToUser(...).catch(() => {})` fire-and-forget.
- Mobile: `console.warn` not `console.error`; new i18n keys in all 9 locales.
- Import shared-types with `import type` in the API.

---

### Task 1: Shared types — notification type, DealSuggestion, preference

**Files:**
- Modify: `packages/shared-types/src/entities/primitives.ts` (`NotificationType`)
- Modify: `packages/shared-types/src/dto/notification.ts` (preference DTOs)
- Modify: `packages/shared-types/src/dto/shopping-list.ts` (`DealSuggestion`)

- [ ] **Step 1:** In `primitives.ts`, add `'shopping_deal'` to the `NotificationType` union (after `'shopping_reminder'`).
- [ ] **Step 2:** In `notification.ts`, add `shoppingDeals?: boolean;` to `UpdateNotificationPreferencesDto` and `shoppingDeals: boolean;` to `NotificationPreferencesResponse`.
- [ ] **Step 3:** Append to `shopping-list.ts`:

```ts
export interface DealSuggestion {
  canonicalName: string;
  merchant: string;
  price: number;      // the current (recent) low price
  avgPrice: number;   // the 90-day average
  dropPct: number;    // e.g. 18 = 18% below average
  currency: string;
}
```

- [ ] **Step 4:** `cd packages/shared-types && npx tsc --noEmit` → PASS. Commit `feat(shared-types): shopping_deal type + DealSuggestion + preference field`.

---

### Task 2: Prisma — notifyShoppingDeals column

**Files:** Modify `apps/api/prisma/schema.prisma` (`User`).

- [ ] **Step 1:** Add `notifyShoppingDeals Boolean @default(true) @map("notify_shopping_deals")` next to `notifyShoppingReminders`.
- [ ] **Step 2:** `cd apps/api && npx prisma migrate dev --name add_shopping_deal_notification && npx prisma generate` (single `ALTER TABLE "users" ADD COLUMN "notify_shopping_deals" BOOLEAN NOT NULL DEFAULT true;`; if drift on an unrelated migration, STOP + report BLOCKED).
- [ ] **Step 3:** Commit `feat(db): add notify_shopping_deals user preference column`.

---

### Task 3: deal-detector pure function + tests

**Files:**
- Create: `apps/api/src/modules/shopping-list/deal-detector.ts`
- Test: `apps/api/src/modules/shopping-list/deal-detector.spec.ts`

**Interfaces:**
- Produces: `interface DealRow { resolvedName: string; date: Date; unitPrice: number; merchant: string; currency: string; }`; `detectDeals(rows: DealRow[], now?: Date): DealSuggestion[]`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/modules/shopping-list/deal-detector.spec.ts
import { detectDeals, DealRow } from './deal-detector';

const d = (s: string) => new Date(s);
const NOW = d('2026-07-08');

function r(name: string, merchant: string, price: number, date: string, currency = 'PLN'): DealRow {
  return { resolvedName: name, merchant, unitPrice: price, date: d(date), currency };
}

describe('detectDeals', () => {
  it('flags a store whose recent price is >=15% below the 90-day average', () => {
    // avg ~5.0; recent Lidl price 4.0 = 20% below → deal
    const rows = [
      r('Milk', 'Biedronka', 5.0, '2026-05-01'), r('Milk', 'Biedronka', 5.0, '2026-06-01'),
      r('Milk', 'Lidl', 5.0, '2026-06-10'), r('Milk', 'Lidl', 4.0, '2026-07-05'),
    ];
    const deals = detectDeals(rows, NOW);
    const milk = deals.find((x) => x.canonicalName === 'Milk' && x.merchant === 'Lidl');
    expect(milk).toBeDefined();
    expect(milk!.dropPct).toBeGreaterThanOrEqual(15);
    expect(milk!.price).toBe(4.0);
  });

  it('does not flag a small (<15%) drop', () => {
    const rows = [
      r('Bread', 'Lidl', 4.0, '2026-05-01'), r('Bread', 'Lidl', 4.0, '2026-06-01'),
      r('Bread', 'Lidl', 3.8, '2026-07-05'), // 5% below avg ~3.93
    ];
    expect(detectDeals(rows, NOW)).toEqual([]);
  });

  it('ignores products with fewer than 3 price points', () => {
    const rows = [r('Rare', 'Lidl', 10, '2026-06-01'), r('Rare', 'Lidl', 4, '2026-07-05')];
    expect(detectDeals(rows, NOW)).toEqual([]);
  });

  it('ignores an old low price outside the recent window', () => {
    // low price is 60 days ago (outside the 14-day recent window) → not a current deal
    const rows = [
      r('Eggs', 'Lidl', 10, '2026-04-15'), r('Eggs', 'Lidl', 10, '2026-05-15'),
      r('Eggs', 'Lidl', 6, '2026-05-09'), // >14 days before NOW
    ];
    expect(detectDeals(rows, NOW)).toEqual([]);
  });

  it('sorts by drop percentage descending', () => {
    const rows = [
      r('A', 'S1', 10, '2026-05-01'), r('A', 'S1', 10, '2026-06-01'), r('A', 'S1', 8, '2026-07-05'), // 20%
      r('B', 'S2', 10, '2026-05-01'), r('B', 'S2', 10, '2026-06-01'), r('B', 'S2', 5, '2026-07-05'), // 50%
    ];
    const deals = detectDeals(rows, NOW);
    expect(deals[0].canonicalName).toBe('B');
  });
});
```

- [ ] **Step 2:** Run → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/shopping-list/deal-detector.ts
import type { DealSuggestion } from '@budget/shared-types';

export interface DealRow {
  resolvedName: string;
  date: Date;
  unitPrice: number;
  merchant: string;
  currency: string;
}

const DAY_MS = 86_400_000;
const DROP = 0.15;
const RECENT_DAYS = 14;
const BASELINE_DAYS = 90;
const MIN_POINTS = 3;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function majorityCurrency(rows: DealRow[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.currency, (counts.get(r.currency) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

export function detectDeals(rows: DealRow[], now: Date = new Date()): DealSuggestion[] {
  const baselineStart = new Date(now.getTime() - BASELINE_DAYS * DAY_MS);
  const recentStart = new Date(now.getTime() - RECENT_DAYS * DAY_MS);

  const byProduct = new Map<string, DealRow[]>();
  for (const row of rows) {
    if (row.date < baselineStart) continue;
    const arr = byProduct.get(row.resolvedName) ?? [];
    arr.push(row);
    byProduct.set(row.resolvedName, arr);
  }

  const deals: DealSuggestion[] = [];
  for (const [name, prs] of byProduct.entries()) {
    const currency = majorityCurrency(prs);
    const pts = prs.filter((p) => p.currency === currency);
    if (pts.length < MIN_POINTS) continue;
    const avg = pts.reduce((s, p) => s + p.unitPrice, 0) / pts.length;
    if (avg <= 0) continue;

    const latestByStore = new Map<string, { price: number; date: Date }>();
    for (const p of pts) {
      if (p.date < recentStart) continue;
      const cur = latestByStore.get(p.merchant);
      if (!cur || p.date > cur.date) latestByStore.set(p.merchant, { price: p.unitPrice, date: p.date });
    }

    for (const [merchant, l] of latestByStore.entries()) {
      if (l.price <= avg * (1 - DROP)) {
        deals.push({
          canonicalName: name,
          merchant,
          price: round2(l.price),
          avgPrice: round2(avg),
          dropPct: Math.round((1 - l.price / avg) * 100),
          currency,
        });
      }
    }
  }

  return deals.sort((a, b) => b.dropPct - a.dropPct);
}
```

- [ ] **Step 4:** Run → PASS (5). Commit `feat(shopping-list): pure deal detector (price-drop) with tests`.

---

### Task 4: Service getDeals + endpoint

**Files:**
- Modify: `apps/api/src/modules/shopping-list/shopping-list.service.ts` (`getDeals`)
- Modify: `apps/api/src/modules/shopping-list/shopping-list.controller.ts` (`GET deals`)
- Test: `apps/api/src/modules/shopping-list/shopping-list.service.spec.ts`

- [ ] **Step 1: Write the failing service test**

```ts
it('getDeals flags a recent price drop', async () => {
  prisma.productAlias.findMany.mockResolvedValue([]);
  prisma.expenseItem.findMany.mockResolvedValue([
    { canonicalName: 'Milk', unitPrice: 5, quantity: 1, totalPrice: 5, expense: { date: new Date('2026-05-01'), merchant: 'Lidl', currencyCode: 'PLN' } },
    { canonicalName: 'Milk', unitPrice: 5, quantity: 1, totalPrice: 5, expense: { date: new Date('2026-06-01'), merchant: 'Lidl', currencyCode: 'PLN' } },
    { canonicalName: 'Milk', unitPrice: 4, quantity: 1, totalPrice: 4, expense: { date: new Date(Date.now() - 3 * 86400000), merchant: 'Lidl', currencyCode: 'PLN' } },
  ]);
  const deals = await service.getDeals('a1');
  expect(deals.some((x) => x.canonicalName === 'Milk')).toBe(true);
});
```
(Note: the recent point uses `Date.now() - 3d` so it's inside the 14-day window relative to the detector's default `now`.)

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement `getDeals`** (mirror `getRestockSuggestions`'s query + alias resolution, but build `DealRow[]` with `unitPrice`/`merchant`/`currency`)

```ts
  async getDeals(accountId: string): Promise<DealSuggestion[]> {
    const aliases: Array<{ rawName: string; canonicalName: string }> =
      await (this.prisma as any).productAlias.findMany({ where: { accountId }, select: { rawName: true, canonicalName: true } });
    const aliasMap = new Map(aliases.map((a) => [a.rawName, a.canonicalName]));

    const items: Array<{ canonicalName: string; unitPrice: number; quantity: number; totalPrice: number; expense: { date: Date; merchant: string | null; currencyCode: string } }> =
      await (this.prisma as any).expenseItem.findMany({
        where: { expense: { accountId, isDeleted: false }, canonicalName: { not: null }, isDeleted: false },
        select: { canonicalName: true, unitPrice: true, quantity: true, totalPrice: true, expense: { select: { date: true, merchant: true, currencyCode: true } } },
      });

    const rows: DealRow[] = [];
    for (const it of items) {
      const resolved = aliasMap.get(it.canonicalName) ?? it.canonicalName;
      if (resolved === '__ignored__') continue;
      const q = Number(it.quantity);
      rows.push({
        resolvedName: resolved,
        date: it.expense.date,
        unitPrice: q > 1 ? Number(it.totalPrice) / q : Number(it.unitPrice),
        merchant: it.expense.merchant ?? 'Unknown',
        currency: it.expense.currencyCode ?? 'PLN',
      });
    }
    return detectDeals(rows);
  }
```
Add imports `import { detectDeals, DealRow } from './deal-detector';` and `import type { DealSuggestion } from '@budget/shared-types';`.

- [ ] **Step 4: Endpoint** — in the controller, alongside `GET suggestions` (before dynamic `:id`):

```ts
  @Get('deals')
  getDeals(@Req() req: AuthenticatedRequest) {
    return this.service.getDeals(req.accountId);
  }
```

- [ ] **Step 5:** Run test + `npx tsc --noEmit` → PASS. Commit `feat(shopping-list): deal suggestions service + GET /deals`.

---

### Task 5: Notification plumbing (gate, preferences, i18n)

**Files:** `notifications.service.ts`, `users.service.ts`, `users.controller.ts`, `notification-i18n.ts` (mirror the M3 `shopping_reminder` wiring EXACTLY).

- [ ] **Step 1:** `sendToUser` — add `notifyShoppingDeals: true` to the `select`; add `if (notificationType === 'shopping_deal' && !user.notifyShoppingDeals) return false;` after the `shopping_reminder` gate.
- [ ] **Step 2:** `users.service.ts` — `getNotificationPreferences` select + `shoppingDeals: user?.notifyShoppingDeals ?? true`; `updateNotificationPreferences` param + `if (prefs.shoppingDeals !== undefined) data.notifyShoppingDeals = prefs.shoppingDeals;`. `users.controller.ts` PATCH body += `shoppingDeals?: boolean`.
- [ ] **Step 3:** `notification-i18n.ts` — interface `shoppingDealTitle: () => string` + `shoppingDealBody: (product: string, merchant: string, dropPct: number) => string`; a GENUINE translation in each of the 9 language blocks; 2 exported accessors. English:
  - `shoppingDealTitle: () => 'Price drop!'`
  - `shoppingDealBody: (product, merchant, dropPct) => \`${product} is ${dropPct}% cheaper at ${merchant} right now.\``
- [ ] **Step 4:** `npx tsc --noEmit` → PASS. Commit `feat(notifications): shopping_deal gate, preference, 9-lang i18n`.

---

### Task 6: Cron fold + tests

**Files:**
- Modify: `apps/api/src/modules/shopping-list/shopping-reminder.cron.ts`
- Test: `apps/api/src/modules/shopping-list/shopping-reminder.cron.spec.ts`

- [ ] **Step 1: Write the failing test** — extend the cron spec: when `getDeals` returns a deal for an account with a member who has `notifyShoppingDeals: true`, `sendToUser` is called with `'shopping_deal'` as the 5th arg.

```ts
it('sends a shopping_deal push when there is a deal', async () => {
  // reuse the harness; svc.getRestockSuggestions → [] (no reminder), svc.getDeals → [{canonicalName:'Milk', merchant:'Lidl', dropPct:20, price:4, avgPrice:5, currency:'PLN'}]
  // members include a user with notifyShoppingDeals:true
  // assert sendToUser called with 5th arg 'shopping_deal'
});
```
(Model the mock exactly on the existing `shopping_reminder` cron test; add `getDeals` to the `ShoppingListService` mock and a `notifyShoppingDeals: true` field to the member's user.)

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Fold into the cron** — inside the per-account loop of `handleShoppingReminders`, after the restock push, also:

```ts
      let deals;
      try {
        deals = await this.shoppingListService.getDeals(account.id);
      } catch { deals = []; }
      if (deals.length) {
        const top = deals[0];
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
```
(`members` is already fetched for the reminder path — reuse it; if the reminder path early-`continue`s when there are no due products, restructure so the deal check still runs: fetch `members` once, then send reminder push and/or deal push independently.)

- [ ] **Step 4:** Run tests + `npx tsc --noEmit` + `npm run build` → PASS. Commit `feat(shopping-list): fold deal alerts into the daily cron`.

---

### Task 7: Mobile — deals strip, api, deep-link, toggle

**Files:** `shoppingLists.api.ts`, `users.api.ts`, `shoppingListStore.ts`, `app/shopping-list/index.tsx`, `src/services/notifications.ts`, `app/settings/notifications.tsx`.

- [ ] **Step 1:** `shoppingLists.api.ts` — `getDeals() { return httpClient.request<DealSuggestion[]>('/shopping-list/deals'); }`. `users.api.ts` — add `shoppingDeals?: boolean` to both preference inline types.
- [ ] **Step 2:** `shoppingListStore.ts` — `deals: DealSuggestion[]` state + `loadDeals()` (`console.warn` on failure), reset in `hydrate()` (like `suggestions`) and called in `hydrate()`.
- [ ] **Step 3:** `app/shopping-list/index.tsx` — a "Deals" strip (below the restock strip) shown when `deals.length > 0`: each chip/row shows `canonicalName` + `-{dropPct}%` + `merchant`; tapping adds it to the list (`addItem(deal.canonicalName, deal.canonicalName, 1)` + optimistic dismiss like the restock chip). Not `canEdit`-gated.
- [ ] **Step 4:** `src/services/notifications.ts` — `case 'shopping_deal': router.push('/shopping-list' as any); break;` before `default`.
- [ ] **Step 5:** `app/settings/notifications.tsx` — a `shoppingDeals` toggle (state + load from `prefs.shoppingDeals ?? true` + optimistic handler + master aggregate + Switch row), mirroring the `shoppingReminders` toggle.
- [ ] **Step 6:** `npx tsc --noEmit` → PASS; eslint clean. Commit `feat(mobile): deals strip + deal-alert toggle + deep-link`.

---

### Task 8: Mobile i18n

**Files:** all 9 `apps/mobile/src/i18n/locales/*.ts`.

- [ ] **Step 1:** Add under `shoppingList`: `dealsTitle: 'Deals for you'`, `dealDrop: '-{{pct}}%'`. Add under `notifications`: `shoppingDeals: 'Deal alerts'`, `shoppingDealsDesc: 'Get notified when a regular item drops in price'`.
- [ ] **Step 2:** Propagate to all 9 locales (genuine translations, preserve `{{pct}}`) via the `i18n-add-strings` skill; verify parity.
- [ ] **Step 3:** `npx tsc --noEmit` → PASS. Commit `feat(mobile): deal-alert i18n across 9 locales`.

---

### Task 9: Final verification

- [ ] **Step 1:** `cd apps/api && npx tsc --noEmit && npx jest src/modules/shopping-list src/modules/notifications` — shopping-list (incl deal-detector + cron) + notifications green; price-history baseline = the 2 known failures only.
- [ ] **Step 2:** `cd apps/api && npm run build` → succeeds.
- [ ] **Step 3:** `cd apps/mobile && npx tsc --noEmit` → 0 errors; `npx jest` → only known baseline failures.
- [ ] **Step 4:** i18n parity: all 9 mobile locales have the 4 new keys; all 9 API `notification-i18n` blocks have `shoppingDealTitle`/`Body`.

---

## Self-Review

**Spec coverage (M6):** pure price-drop `detectDeals` + tests (Task 3) · free `GET /shopping-list/deals` (Task 4) · `shopping_deal` type + `notifyShoppingDeals` pref + 9-lang i18n + pref API (Tasks 1,2,5) · deal push folded into the daily cron (Task 6) · mobile deals strip + toggle + deep-link + i18n (Tasks 7,8). ✓

**Placeholder scan:** detector + service + notification plumbing + cron fold have complete code; mobile UI mirrors the M3 restock strip/toggle.

**Type consistency:** `detectDeals(DealRow[], now?) → DealSuggestion[]` used in Task 3/4; `DealSuggestion` shape consistent across shared-types/service/cron/mobile; `shopping_deal` string identical in NotificationType, gate, cron arg, deep-link.

## Roadmap
This is the final milestone (M1–M6). After it: create the ABA-{N} issue, update CLAUDE.md + user_docs, and (with approval) push.
