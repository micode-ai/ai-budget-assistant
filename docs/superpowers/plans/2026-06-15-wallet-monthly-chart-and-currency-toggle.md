# Wallet Monthly-Change Chart + Currency Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unreadable daily balance line on the Wallet screen with month-over-month signed delta bars (green up / red down, value on tap), and add a wallet-local display-currency toggle.

**Architecture:** A new API endpoint returns per-month net balance change per currency. The mobile wallet store loads it, a focused `WalletMonthlyChart` renders signed bars, the reworked balance card converts deltas to a chosen display currency, and the wallet screen gets a local currency-chip toggle. FX uses current rates; the toggle is not persisted. No DB schema change. The existing daily endpoint stays for already-released app versions.

**Tech Stack:** NestJS + Prisma (API), Jest (API specs), React Native + Expo + Zustand (mobile), react-native-gifted-charts `BarChart`, i18next (9 locales).

**Spec:** `docs/superpowers/specs/2026-06-15-wallet-monthly-chart-and-currency-toggle-design.md`

---

## File Structure

- `packages/shared-types/src/dto/wallet.ts` — add `WalletMonthlyDeltaPoint` + `WalletMonthlyHistoryResponse` (type-only).
- `apps/api/src/modules/wallet/wallet.service.ts` — add `getMonthlyBalanceHistory`.
- `apps/api/src/modules/wallet/wallet.service.spec.ts` — new spec for the monthly method.
- `apps/api/src/modules/wallet/wallet.controller.ts` — add `GET /wallet/balance-history/monthly`.
- `apps/mobile/src/services/wallet.api.ts` — add `getWalletMonthlyHistory`, remove `getWalletBalanceHistory`.
- `apps/mobile/src/stores/walletStore.ts` — replace daily history state with monthly.
- `apps/mobile/src/components/wallet/WalletMonthlyChart.tsx` — new signed-bar chart.
- `apps/mobile/src/components/wallet/WalletBalanceCard.tsx` — reworked from `WalletSparklineCard.tsx` (renamed).
- `apps/mobile/app/wallet/index.tsx` — currency-chip toggle + `displayCurrency` wiring.
- `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be,nl}.ts` — i18n keys.

---

## Task 1: shared-types — monthly history DTO

**Files:**
- Modify: `packages/shared-types/src/dto/wallet.ts`

- [ ] **Step 1: Add the types**

In `packages/shared-types/src/dto/wallet.ts`, immediately after the existing `WalletBalanceHistoryResponse` interface (ends ~line 110), append:

```typescript
export interface WalletMonthlyDeltaPoint {
  /** Month key 'YYYY-MM' */
  month: string;
  /** Net balance change during this month, per currency code */
  deltas: Record<string, number>;
}

export interface WalletMonthlyHistoryResponse {
  months: WalletMonthlyDeltaPoint[];
  currencies: string[];
}
```

- [ ] **Step 2: Typecheck shared-types**

Run: `cd packages/shared-types && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared-types/src/dto/wallet.ts
git commit -m "feat(shared-types): add wallet monthly history DTO"
```

---

## Task 2: API — `getMonthlyBalanceHistory` service method

**Files:**
- Modify: `apps/api/src/modules/wallet/wallet.service.ts`
- Test: `apps/api/src/modules/wallet/wallet.service.spec.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/wallet/wallet.service.spec.ts`:

```typescript
import { WalletService } from './wallet.service';

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

describe('WalletService.getMonthlyBalanceHistory', () => {
  const now = new Date();
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15));
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));

  function makeService() {
    const prisma = {
      income: { findMany: jest.fn().mockResolvedValue([{ date: thisMonth, amount: 100, currencyCode: 'PLN' }]) },
      expense: { findMany: jest.fn().mockResolvedValue([{ date: lastMonth, amount: 30, currencyCode: 'PLN' }]) },
      currencyExchange: { findMany: jest.fn().mockResolvedValue([]) },
      accountTransfer: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return new WalletService(prisma as never);
  }

  it('buckets net deltas per month and returns one entry per month in the window', async () => {
    const res = await makeService().getMonthlyBalanceHistory('a1', 3);
    expect(res.months).toHaveLength(3);
    // chronological: last entry is the current month
    expect(res.months[res.months.length - 1].month).toBe(monthKey(thisMonth));
    expect(res.months[res.months.length - 1].deltas.PLN).toBe(100);
    const prev = res.months.find((m) => m.month === monthKey(lastMonth));
    expect(prev?.deltas.PLN).toBe(-30);
    expect(res.currencies).toEqual(['PLN']);
  });

  it('clamps the window to at most 12 months', async () => {
    const res = await makeService().getMonthlyBalanceHistory('a1', 24);
    expect(res.months).toHaveLength(12);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && npx jest src/modules/wallet/wallet.service.spec.ts`
Expected: FAIL — `getMonthlyBalanceHistory is not a function`. (Jest startup can take minutes — be patient, generous timeout.)

- [ ] **Step 3: Implement the method**

In `apps/api/src/modules/wallet/wallet.service.ts`, add this method immediately after the existing `getBalanceHistory` method (after its closing `}` at ~line 270, before the class closing brace):

```typescript
  async getMonthlyBalanceHistory(accountId: string, months: number) {
    const cappedMonths = Math.min(Math.max(1, months), 12);

    const now = new Date();
    // First day of the earliest month in the window (UTC)
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (cappedMonths - 1), 1, 0, 0, 0, 0),
    );
    // Last day of the current month (UTC)
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    );

    const [incomes, expenses, exchanges, transfersOut, transfersIn] = await Promise.all([
      this.prisma.income.findMany({
        where: { accountId, isDeleted: false, date: { gte: start, lte: end } },
        select: { date: true, amount: true, currencyCode: true },
      }),
      this.prisma.expense.findMany({
        where: { accountId, isDeleted: false, date: { gte: start, lte: end } },
        select: { date: true, amount: true, currencyCode: true },
      }),
      this.prisma.currencyExchange.findMany({
        where: { accountId, isDeleted: false, date: { gte: start, lte: end } },
        select: { date: true, fromAmount: true, toAmount: true, fromCurrency: true, toCurrency: true },
      }),
      this.prisma.accountTransfer.findMany({
        where: { fromAccountId: accountId, isDeleted: false, date: { gte: start, lte: end } },
        select: { date: true, fromAmount: true, fromCurrency: true },
      }),
      this.prisma.accountTransfer.findMany({
        where: { toAccountId: accountId, isDeleted: false, countAsIncome: false, date: { gte: start, lte: end } },
        select: { date: true, toAmount: true, toCurrency: true },
      }),
    ]);

    const monthKey = (date: Date): string =>
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

    // monthKey -> currency -> net delta
    const monthMap = new Map<string, Map<string, number>>();
    const currencySet = new Set<string>();
    const add = (date: Date, currency: string, delta: number) => {
      const key = monthKey(new Date(date));
      if (!monthMap.has(key)) monthMap.set(key, new Map());
      const m = monthMap.get(key)!;
      m.set(currency, (m.get(currency) ?? 0) + delta);
      currencySet.add(currency);
    };

    for (const r of incomes) add(r.date, r.currencyCode, Number(r.amount));
    for (const r of expenses) add(r.date, r.currencyCode, -Number(r.amount));
    for (const r of exchanges) {
      add(r.date, r.fromCurrency, -Number(r.fromAmount));
      add(r.date, r.toCurrency, Number(r.toAmount));
    }
    for (const r of transfersOut) add(r.date, r.fromCurrency, -Number(r.fromAmount));
    for (const r of transfersIn) add(r.date, r.toCurrency, Number(r.toAmount));

    // Emit one entry per month in the window, chronological, including empty months
    const result: { month: string; deltas: Record<string, number> }[] = [];
    for (let i = 0; i < cappedMonths; i++) {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
      const key = monthKey(d);
      const m = monthMap.get(key);
      const deltas: Record<string, number> = {};
      if (m) for (const [c, v] of m) deltas[c] = v;
      result.push({ month: key, deltas });
    }

    return { months: result, currencies: Array.from(currencySet) };
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && npx jest src/modules/wallet/wallet.service.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/wallet/wallet.service.ts apps/api/src/modules/wallet/wallet.service.spec.ts
git commit -m "feat(wallet): add getMonthlyBalanceHistory (per-month net deltas)"
```

---

## Task 3: API — monthly endpoint

**Files:**
- Modify: `apps/api/src/modules/wallet/wallet.controller.ts`

- [ ] **Step 1: Add the route**

In `apps/api/src/modules/wallet/wallet.controller.ts`, immediately after the existing `getBalanceHistory` method (ends ~line 48), add:

```typescript
  @Get('balance-history/monthly')
  async getMonthlyBalanceHistory(
    @Req() req: AuthenticatedRequest,
    @Query('months') months?: string,
  ) {
    const parsedMonths = months ? parseInt(months, 10) : 6;
    const safeMonths = Number.isNaN(parsedMonths) ? 6 : parsedMonths;
    return this.walletService.getMonthlyBalanceHistory(req.accountId, safeMonths);
  }
```

- [ ] **Step 2: Typecheck the API**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the wallet suite**

Run: `cd apps/api && npx jest src/modules/wallet`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/wallet/wallet.controller.ts
git commit -m "feat(wallet): add GET /wallet/balance-history/monthly endpoint"
```

---

## Task 4: Mobile — API client method

**Files:**
- Modify: `apps/mobile/src/services/wallet.api.ts`

- [ ] **Step 1: Update the import**

In `apps/mobile/src/services/wallet.api.ts`, change the type import block (lines 2-10) to replace `WalletBalanceHistoryResponse` with `WalletMonthlyHistoryResponse`:

```typescript
import type {
  CreateWalletBalanceDto,
  CreateCurrencyExchangeDto,
  UpdateCurrencyExchangeDto,
  WalletSummaryResponse,
  WalletMonthlyHistoryResponse,
  ExchangeRatesResponse,
  DebtSummaryResponse,
} from '@budget/shared-types';
```

- [ ] **Step 2: Replace the method**

In the same file, replace the `getWalletBalanceHistory` method (lines ~65-69) with:

```typescript
  getWalletMonthlyHistory(months: number = 6) {
    return httpClient.request<WalletMonthlyHistoryResponse>(
      `/wallet/balance-history/monthly?months=${months}`,
    );
  },
```

- [ ] **Step 3: Typecheck mobile**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: errors ONLY in `walletStore.ts` / `WalletSparklineCard.tsx` referencing the removed method/type — those are fixed in Tasks 5–7. If any OTHER file references `getWalletBalanceHistory`, stop and report (none expected).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/services/wallet.api.ts
git commit -m "feat(mobile): wallet api getWalletMonthlyHistory (replace daily)"
```

---

## Task 5: Mobile — wallet store monthly state

**Files:**
- Modify: `apps/mobile/src/stores/walletStore.ts`

- [ ] **Step 1: Update the type import**

In `apps/mobile/src/stores/walletStore.ts`, find the import of `WalletBalanceHistoryPoint` from `@budget/shared-types` and replace that name with `WalletMonthlyDeltaPoint` (keep the other imported names intact).

- [ ] **Step 2: Replace the state fields in the interface**

Replace the interface lines:

```typescript
  balanceHistory: WalletBalanceHistoryPoint[];
  selectedHistoryDays: 30 | 60 | 90;
```

with:

```typescript
  monthlyHistory: WalletMonthlyDeltaPoint[];
  selectedMonths: 6 | 12;
```

And replace the action signature:

```typescript
  loadBalanceHistory: (days: 30 | 60 | 90) => Promise<void>;
```

with:

```typescript
  loadMonthlyHistory: (months: 6 | 12) => Promise<void>;
```

(Leave `isHistoryLoading: boolean` as-is.)

- [ ] **Step 3: Replace the initial state**

Replace:

```typescript
    balanceHistory: [],
    selectedHistoryDays: 30,
```

with:

```typescript
    monthlyHistory: [],
    selectedMonths: 6,
```

- [ ] **Step 4: Replace the action implementation**

Replace the `loadBalanceHistory` implementation (lines ~113-121):

```typescript
    loadBalanceHistory: async (days) => {
      set({ isHistoryLoading: true, selectedHistoryDays: days });
      try {
        const result = await api.getWalletBalanceHistory(days);
        set({ balanceHistory: result.points, isHistoryLoading: false });
      } catch {
        set({ isHistoryLoading: false });
      }
    },
```

with:

```typescript
    loadMonthlyHistory: async (months) => {
      set({ isHistoryLoading: true, selectedMonths: months });
      try {
        const result = await api.getWalletMonthlyHistory(months);
        set({ monthlyHistory: result.months, isHistoryLoading: false });
      } catch {
        set({ isHistoryLoading: false });
      }
    },
```

- [ ] **Step 5: Update `reset()`**

In the `reset:` action (~line 724), replace `balanceHistory: [], selectedHistoryDays: 30,` with `monthlyHistory: [], selectedMonths: 6,`.

- [ ] **Step 6: Typecheck mobile**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: errors ONLY in `WalletSparklineCard.tsx` (fixed in Task 7). If `WalletBalanceHistoryPoint` is still referenced elsewhere, stop and report.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/stores/walletStore.ts
git commit -m "feat(mobile): wallet store monthly history state"
```

---

## Task 6: Mobile — `WalletMonthlyChart` component

**Files:**
- Create: `apps/mobile/src/components/wallet/WalletMonthlyChart.tsx`

- [ ] **Step 1: Create the component**

Create `apps/mobile/src/components/wallet/WalletMonthlyChart.tsx`:

```tsx
import React, { useState, useCallback } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { useTheme, useStyles, type Theme } from '@/theme';

export interface MonthlyDeltaBar {
  /** Month key 'YYYY-MM' (for keys / tooltip secondary use) */
  month: string;
  /** Localized short x-axis label, e.g. 'Jun' */
  label: string;
  /** Signed value already converted to the display currency */
  value: number;
}

interface Props {
  data: MonthlyDeltaBar[];
  formatValue: (v: number) => string;
  height?: number;
}

export function WalletMonthlyChart({ data, formatValue, height = 150 }: Props) {
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { width: screenWidth } = useWindowDimensions();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handlePress = useCallback((index: number) => {
    setSelectedIndex((prev) => (prev === index ? null : index));
  }, []);

  // Layout mirrors InteractiveBarChart: container(32) + card(32) padding + y labels
  const yAxisLabelWidth = 48;
  const chartWidth = screenWidth - 64 - yAxisLabelWidth;
  const n = Math.max(data.length, 1);
  const spacing = Math.min(chartWidth / (3 * n + 1), 24);
  const barWidth = Math.min(36, (chartWidth - (n + 1) * spacing) / n);

  const barData = data.map((d, index) => ({
    value: d.value,
    label: d.label,
    frontColor: d.value < 0 ? theme.colors.danger : theme.colors.success,
    onPress: () => handlePress(index),
  }));

  const maxAbs = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const hasNegative = data.some((d) => d.value < 0);
  const selected = selectedIndex !== null ? data[selectedIndex] : null;

  return (
    <View style={styles.container}>
      {selected && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipLabel}>{selected.label}</Text>
          <Text
            style={[
              styles.tooltipValue,
              { color: selected.value < 0 ? theme.colors.danger : theme.colors.success },
            ]}
          >
            {selected.value >= 0 ? '+' : ''}
            {formatValue(selected.value)}
          </Text>
        </View>
      )}
      <BarChart
        data={barData}
        width={chartWidth}
        height={height}
        barWidth={barWidth}
        spacing={spacing}
        isAnimated={false}
        maxValue={maxAbs * 1.15}
        mostNegativeValue={hasNegative ? -maxAbs * 1.15 : undefined}
        noOfSections={hasNegative ? 2 : 4}
        noOfSectionsBelowXAxis={hasNegative ? 2 : 0}
        yAxisThickness={0}
        xAxisThickness={1}
        xAxisColor={theme.colors.border}
        yAxisTextStyle={styles.axisText}
        yAxisLabelWidth={yAxisLabelWidth}
        xAxisLabelTextStyle={styles.axisText}
        rulesColor={theme.colors.borderLight}
        rulesType="dashed"
        barBorderRadius={theme.borderRadius.sm}
        disablePress={false}
        disableScroll
      />
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    width: '100%' as const,
    alignItems: 'center' as const,
    overflow: 'hidden' as const,
  },
  tooltip: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    marginBottom: theme.spacing[2],
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tooltipLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
  tooltipValue: {
    ...theme.textStyles.bodySmMedium,
    marginTop: theme.spacing[0.5],
  },
  axisText: {
    ...theme.textStyles.caption,
    fontSize: 10,
    color: theme.colors.textTertiary,
  },
});
```

- [ ] **Step 2: Typecheck mobile**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no NEW errors from this file (pre-existing `WalletSparklineCard.tsx` error from Task 5 may remain until Task 7). If gifted-charts rejects `mostNegativeValue` / `noOfSectionsBelowXAxis` as unknown props, stop and report (these are valid in the installed version; do not guess alternatives).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/wallet/WalletMonthlyChart.tsx
git commit -m "feat(mobile): WalletMonthlyChart signed delta bar chart"
```

---

## Task 7: Mobile — rework balance card to monthly + display-currency prop

**Files:**
- Create: `apps/mobile/src/components/wallet/WalletBalanceCard.tsx`
- Delete: `apps/mobile/src/components/wallet/WalletSparklineCard.tsx`

- [ ] **Step 1: Create the reworked card**

Create `apps/mobile/src/components/wallet/WalletBalanceCard.tsx`:

```tsx
import React, { useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useWalletStore } from '@/stores/walletStore';
import { useExchangeRateStore } from '@/stores/exchangeRateStore';
import { formatCurrency } from '@budget/shared-utils';
import { getIntlLocale } from '@/i18n';
import { WalletMonthlyChart, type MonthlyDeltaBar } from './WalletMonthlyChart';

const MONTH_WINDOWS: Array<6 | 12> = [6, 12];

function toBaseAmount(
  balances: Record<string, number>,
  baseCurrency: string,
  rates: Record<string, number>,
): number {
  let total = 0;
  for (const [currency, amount] of Object.entries(balances)) {
    if (currency === baseCurrency) {
      total += amount;
    } else {
      const rate = rates[currency];
      total += rate && rate !== 0 ? amount / rate : amount;
    }
  }
  return total;
}

/** 'YYYY-MM' -> localized short month label, e.g. 'Jun'. */
function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString(getIntlLocale(), { month: 'short' });
}

interface Props {
  displayCurrency: string;
}

export function WalletBalanceCard({ displayCurrency }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const { monthlyHistory, selectedMonths, isHistoryLoading, loadMonthlyHistory, walletSummary } =
    useWalletStore();
  const rates = useExchangeRateStore((s) => s.rates);

  useEffect(() => {
    if (walletSummary.length > 0) {
      loadMonthlyHistory(selectedMonths);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletSummary.length]);

  const handleWindowChange = useCallback(
    (months: 6 | 12) => {
      if (months !== selectedMonths) loadMonthlyHistory(months);
    },
    [selectedMonths, loadMonthlyHistory],
  );

  if (walletSummary.length === 0) return null;

  const bars: MonthlyDeltaBar[] = monthlyHistory.map((p) => ({
    month: p.month,
    label: monthLabel(p.month),
    value: toBaseAmount(p.deltas, displayCurrency, rates),
  }));

  const latest = bars[bars.length - 1];
  const latestValue = latest?.value ?? 0;
  const latestColor = latestValue >= 0 ? theme.colors.success : theme.colors.danger;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('wallet.balanceHistory')}</Text>
        <View style={styles.periodSelector}>
          {MONTH_WINDOWS.map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.periodChip, selectedMonths === m && { backgroundColor: theme.colors.primary }]}
              onPress={() => handleWindowChange(m)}
              activeOpacity={0.7}
            >
              <Text style={[styles.periodChipText, selectedMonths === m && { color: '#fff' }]}>
                {t('wallet.monthsWindow', { count: m })}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {isHistoryLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : bars.length < 1 ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.emptyText}>{t('wallet.noHistoryYet')}</Text>
        </View>
      ) : (
        <>
          {latest && (
            <View style={styles.deltaRow}>
              <Text style={[styles.deltaText, { color: latestColor }]}>
                {latestValue >= 0 ? '+' : ''}
                {formatCurrency(latestValue, displayCurrency)}
              </Text>
              <Text style={styles.deltaMonth}>{t('wallet.monthlyChange', { month: latest.label })}</Text>
            </View>
          )}
          <WalletMonthlyChart data={bars} formatValue={(v) => formatCurrency(v, displayCurrency)} />
        </>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  periodSelector: {
    flexDirection: 'row' as const,
    gap: theme.spacing[1],
  },
  periodChip: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  periodChipText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
  loadingContainer: {
    height: 120,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  emptyText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
  deltaRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'baseline' as const,
    marginBottom: theme.spacing[2],
  },
  deltaText: {
    ...theme.textStyles.bodyLargeSemiBold,
  },
  deltaMonth: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
});
```

- [ ] **Step 2: Delete the old component**

```bash
git rm apps/mobile/src/components/wallet/WalletSparklineCard.tsx
```

- [ ] **Step 3: Update the import in the wallet screen**

In `apps/mobile/app/wallet/index.tsx`, change the import line:

```tsx
import { WalletSparklineCard } from '@/components/wallet/WalletSparklineCard';
```

to:

```tsx
import { WalletBalanceCard } from '@/components/wallet/WalletBalanceCard';
```

And change the usage `<WalletSparklineCard />` (~line 81) to `<WalletBalanceCard displayCurrency={userCurrency} />`. (The `displayCurrency` local state replaces `userCurrency` here in Task 8 — for now pass `userCurrency` so the file compiles.)

- [ ] **Step 4: Typecheck mobile**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors (the `wallet.monthlyChange` / `wallet.monthsWindow` i18n keys are added in Task 9; `t()` typechecks regardless).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/wallet/WalletBalanceCard.tsx apps/mobile/app/wallet/index.tsx
git rm apps/mobile/src/components/wallet/WalletSparklineCard.tsx
git commit -m "feat(mobile): WalletBalanceCard renders monthly delta bars"
```

---

## Task 8: Mobile — wallet-local currency toggle

**Files:**
- Modify: `apps/mobile/app/wallet/index.tsx`

- [ ] **Step 1: Add the imports + state + helpers**

In `apps/mobile/app/wallet/index.tsx`:

Add to the React import (line 2): include `useMemo` →
`import { useState, useCallback, useEffect, useMemo } from 'react';`

Add the constants import near the other `@budget/shared-utils` import (line 10):
`import { formatCurrency, SUPPORTED_CURRENCIES } from '@budget/shared-utils';`

Inside `WalletScreen`, after `const userCurrency = ...` (line 23), add:

```tsx
  const [displayCurrency, setDisplayCurrency] = useState(userCurrency);
```

- [ ] **Step 2: Convert the total to the display currency**

Replace the `totalBalanceInUserCurrency` block (lines ~33-42) with:

```tsx
  const hasMultipleCurrencies = walletSummary.length > 1;
  const hasRates = Object.keys(rates).length > 0;
  const totalInDisplayCurrency = useMemo(
    () =>
      walletSummary.reduce((sum, s) => {
        if (s.currencyCode === displayCurrency) return sum + s.currentBalance;
        const rate = rates[s.currencyCode];
        if (!rate || rate === 0) return sum + s.currentBalance;
        return sum + s.currentBalance / rate;
      }, 0),
    [walletSummary, displayCurrency, rates],
  );
  const showTotalCard =
    hasRates &&
    walletSummary.length > 0 &&
    (hasMultipleCurrencies || displayCurrency !== walletSummary[0]?.currencyCode);
```

- [ ] **Step 3: Render the currency chips + total card**

Replace the total-balance card block (lines ~84-93, the `{hasMultipleCurrencies && hasRates && (...)}` block) with:

```tsx
              {hasRates && (
                <View style={styles.currencyRow}>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <TouchableOpacity
                      key={c.code}
                      style={[styles.currencyChip, displayCurrency === c.code && styles.currencyChipActive]}
                      onPress={() => setDisplayCurrency(c.code)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.currencyChipText,
                          displayCurrency === c.code && styles.currencyChipTextActive,
                        ]}
                      >
                        {c.code}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {showTotalCard && (
                <View style={styles.totalBalanceCard}>
                  <Text style={styles.totalBalanceLabel}>
                    {t('wallet.totalBalance', { currency: displayCurrency })}
                  </Text>
                  <Text style={[styles.totalBalanceAmount, totalInDisplayCurrency < 0 && { color: '#FF6B6B' }]}>
                    {formatCurrency(totalInDisplayCurrency, displayCurrency)}
                  </Text>
                </View>
              )}
```

- [ ] **Step 4: Pass the display currency to the balance card**

Change `<WalletBalanceCard displayCurrency={userCurrency} />` to `<WalletBalanceCard displayCurrency={displayCurrency} />`.

- [ ] **Step 5: Add the chip styles**

In `createStyles`, add these entries (e.g. after `totalBalanceAmount`):

```tsx
  currencyRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  currencyChip: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  currencyChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  currencyChipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  currencyChipTextActive: {
    color: '#FFFFFF',
  },
```

- [ ] **Step 6: Typecheck mobile**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors. (`SUPPORTED_CURRENCIES[].code` is `Currency`; `displayCurrency` is `string` from `useState(userCurrency)` where `userCurrency: string` — assignment is fine.)

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/app/wallet/index.tsx
git commit -m "feat(mobile): wallet-local display-currency toggle"
```

---

## Task 9: i18n — wallet keys (9 locales)

**Files:**
- Modify: `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be,nl}.ts`

- [ ] **Step 1: Add/remove keys**

Inside the `wallet: { ... }` object in EVERY locale file:
- **Remove** `historyDays: '...'` (no longer used after the daily chips were removed).
- **Add** these three keys (English source — translate per locale, keep `{{count}}` / `{{month}}` tokens):

```typescript
    monthsWindow: '{{count}}M',
    monthlyChange: 'in {{month}}',
    displayCurrency: 'Display currency',
```

Invoke the **i18n-add-strings** skill to apply these changes consistently across all 9 locale files with correct translations (e.g. RU `monthsWindow: '{{count}} мес.'`, `monthlyChange: 'за {{month}}'`, `displayCurrency: 'Валюта отображения'`).

- [ ] **Step 2: Verify `historyDays` is gone and not referenced**

Run (project root):

```bash
grep -rn "historyDays" apps/mobile/src apps/mobile/app || echo "OK: no references"
```

Expected: `OK: no references`.

- [ ] **Step 3: Verify key parity**

Run (project root):

```bash
node -e "const l=['en','de','es','fr','pl','ru','ua','be','nl'];const need=['monthsWindow','monthlyChange','displayCurrency'];for(const x of l){const s=require('fs').readFileSync('apps/mobile/src/i18n/locales/'+x+'.ts','utf8');const miss=need.filter(k=>!new RegExp('\\\\b'+k+'\\\\s*:').test(s));console.log(x, miss.length?('MISSING '+miss.join(',')):'ok');}"
```

Expected: every locale prints `ok`.

- [ ] **Step 4: Typecheck mobile**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/i18n/locales
git commit -m "i18n(wallet): monthly chart + display-currency keys (9 locales)"
```

---

## Task 10: Full verification + finish

**Files:** none (verification only)

- [ ] **Step 1: Run affected test suites**

Run: `cd apps/api && npx jest src/modules/wallet` — Expected: PASS.

- [ ] **Step 2: Typecheck all changed packages**

Run: `cd packages/shared-types && npx tsc --noEmit` — Expected: no errors.
Run: `cd apps/api && npx tsc --noEmit` — Expected: no errors.
Run: `cd apps/mobile && npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no NEW errors in changed files (pre-existing `packages/shared-types` lint errors are unrelated).

- [ ] **Step 4: Manual smoke test (mobile web)**

Start `npm run dev:web` from root, open the Wallet screen:
1. The balance-history card shows monthly bars (green up / red down), no overlapping value labels; tapping a bar shows a tooltip with the signed amount.
2. Toggling 6M / 12M reloads the window.
3. Tapping a currency chip (e.g. EUR) changes the total-balance amount/label and the chart values to that currency; per-currency cards stay in their own currency.
4. Re-entering the screen resets the display currency to the base currency.

- [ ] **Step 5: Finish the task**

Invoke the **finish-aba-task** skill to create the ABA-{N} GitHub issue (replace `ABA-XXX` in the spec) and update `CLAUDE.md` (wallet section: monthly endpoint, `WalletBalanceCard` + `WalletMonthlyChart`, wallet-local currency toggle) + `user_docs/` (wallet help section, if one exists) for all 9 locales.

---

## Self-Review Notes

- **Spec coverage:** A→Tasks 1–3; B→Tasks 4–5; C→Tasks 6–7; D→Task 8; E→Task 9; FX-current-rates is inherent in `toBaseAmount` (Task 7); non-persistent toggle is local `useState` (Task 8). All covered.
- **Type consistency:** `WalletMonthlyDeltaPoint { month, deltas }` (Task 1) used in store (Task 5) and card (Task 7); `getWalletMonthlyHistory` (Task 4) ↔ `loadMonthlyHistory` (Task 5); `WalletMonthlyChart`/`MonthlyDeltaBar` (Task 6) consumed in Task 7; `displayCurrency` prop flows index→card→chart.
- **No schema change** — confirmed; monthly deltas are computed from existing rows.
- **Backward compat** — daily server endpoint kept (Task 3 only adds a route); only the mobile client drops the daily call.
