import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { Currency } from '@budget/shared-types';
import { formatCurrency } from '@budget/shared-utils';

/**
 * Widget data bridge — serializes financial summary data
 * for consumption by native iOS (WidgetKit) and Android widgets.
 *
 * Data is stored in a shared location accessible by widget extensions:
 * - iOS: App Groups shared UserDefaults (via expo-shared-preferences in managed workflow)
 * - Android: SharedPreferences (via react-native-android-widget task handler)
 */

export interface WidgetLabels {
  today: string;
  openApp: string;
  week: string;
  budgets: string;
  topCategories: string;
  voice: string;
  scan: string;
  add: string;
  dayNames: string[]; // [Sun, Mon, Tue, Wed, Thu, Fri, Sat]
  safeToSpend: string;
}

const DEFAULT_LABELS: WidgetLabels = {
  today: 'Today',
  openApp: 'Open app to load data',
  week: 'Week',
  budgets: 'Budgets',
  topCategories: 'Top Categories',
  voice: 'Voice',
  scan: 'Scan',
  add: 'Add',
  dayNames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  safeToSpend: 'Safe to Spend',
};

export interface WidgetSmallData {
  todaySpent: string;
  todayDelta: string; // e.g., "+12%" or "-5%"
  deltaDirection: 'up' | 'down' | 'neutral';
  currencyCode: string;
  updatedAt: string;
  labels: WidgetLabels;
  safeToSpendToday: string;
  safeToSpendLabel: string;
}

export interface WidgetMediumData extends WidgetSmallData {
  weekTotal: string;
  weekBars: {
    day: string; // Mon, Tue, ...
    value: number;
    maxValue: number;
  }[];
}

export interface WidgetLargeData extends WidgetMediumData {
  budgets: {
    name: string;
    spent: string;
    limit: string;
    percent: number;
    isOverBudget: boolean;
  }[];
  topCategories: {
    name: string;
    amount: string;
    icon: string;
  }[];
}

const WIDGET_DATA_KEY = 'widget_data';

export class WidgetDataService {
  /**
   * Compute and serialize widget data from local stores.
   * Called by background fetch and after expense operations.
   */
  static async updateWidgetData(params: {
    todayExpenses: number;
    yesterdayExpenses: number;
    weeklyExpenses: { day: string; amount: number }[];
    weekTotal: number;
    budgets: {
      name: string;
      spent: number;
      limit: number;
    }[];
    topCategories: {
      name: string;
      amount: number;
      icon: string;
    }[];
    currencyCode: Currency;
    safeToSpendToday?: number;
  }): Promise<void> {
    const {
      todayExpenses,
      yesterdayExpenses,
      weeklyExpenses,
      weekTotal,
      budgets,
      topCategories,
      currencyCode,
      safeToSpendToday,
    } = params;

    // Compute delta
    let deltaDirection: 'up' | 'down' | 'neutral' = 'neutral';
    let todayDelta = '0%';
    if (yesterdayExpenses > 0) {
      const change = ((todayExpenses - yesterdayExpenses) / yesterdayExpenses) * 100;
      deltaDirection = change > 0 ? 'up' : change < 0 ? 'down' : 'neutral';
      todayDelta = `${change >= 0 ? '+' : ''}${Math.round(change)}%`;
    }

    const maxWeekValue = Math.max(...weeklyExpenses.map((w) => w.amount), 1);
    const labels = getWidgetLabels();

    const data: WidgetLargeData = {
      todaySpent: formatCurrency(todayExpenses, currencyCode),
      todayDelta,
      deltaDirection,
      currencyCode,
      updatedAt: new Date().toISOString(),
      labels,
      safeToSpendToday: safeToSpendToday != null ? formatCurrency(safeToSpendToday, currencyCode) : '',
      safeToSpendLabel: labels.safeToSpend,
      weekTotal: formatCurrency(weekTotal, currencyCode),
      weekBars: weeklyExpenses.map((w) => ({
        day: w.day,
        value: w.amount,
        maxValue: maxWeekValue,
      })),
      budgets: budgets.map((b) => ({
        name: b.name,
        spent: formatCurrency(b.spent, currencyCode),
        limit: formatCurrency(b.limit, currencyCode),
        percent: b.limit > 0 ? Math.round((b.spent / b.limit) * 100) : 0,
        isOverBudget: b.spent > b.limit,
      })),
      topCategories: topCategories.slice(0, 3).map((c) => ({
        name: c.name,
        amount: formatCurrency(c.amount, currencyCode),
        icon: c.icon || '📦',
      })),
    };

    // Store serialized data for widget consumption
    await SecureStore.setItemAsync(WIDGET_DATA_KEY, JSON.stringify(data));
  }

  /**
   * Read the last-stored widget data.
   */
  static async getWidgetData(): Promise<WidgetLargeData | null> {
    try {
      const raw = await SecureStore.getItemAsync(WIDGET_DATA_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /**
   * Extract small widget data from full data.
   */
  static toSmallData(data: WidgetLargeData): WidgetSmallData {
    return {
      todaySpent: data.todaySpent,
      todayDelta: data.todayDelta,
      deltaDirection: data.deltaDirection,
      currencyCode: data.currencyCode,
      updatedAt: data.updatedAt,
      labels: data.labels ?? DEFAULT_LABELS,
      safeToSpendToday: data.safeToSpendToday ?? '',
      safeToSpendLabel: data.safeToSpendLabel ?? (data.labels ?? DEFAULT_LABELS).safeToSpend,
    };
  }

  /**
   * Extract medium widget data from full data.
   */
  static toMediumData(data: WidgetLargeData): WidgetMediumData {
    return {
      todaySpent: data.todaySpent,
      todayDelta: data.todayDelta,
      deltaDirection: data.deltaDirection,
      currencyCode: data.currencyCode,
      updatedAt: data.updatedAt,
      labels: data.labels ?? DEFAULT_LABELS,
      safeToSpendToday: data.safeToSpendToday ?? '',
      safeToSpendLabel: data.safeToSpendLabel ?? (data.labels ?? DEFAULT_LABELS).safeToSpend,
      weekTotal: data.weekTotal,
      weekBars: data.weekBars,
    };
  }
}

function getWidgetLabels(): WidgetLabels {
  try {
    const i18n = require('@/i18n').default;
    const t = (key: string) => i18n.t(key);
    const dayNames = i18n.t('widgets.dayNames', { returnObjects: true });
    return {
      today: t('widgets.today'),
      openApp: t('widgets.openApp'),
      week: t('widgets.week'),
      budgets: t('widgets.budgets'),
      topCategories: t('widgets.topCategories'),
      voice: t('widgets.voice'),
      scan: t('widgets.scan'),
      add: t('widgets.add'),
      dayNames: Array.isArray(dayNames) ? dayNames : DEFAULT_LABELS.dayNames,
      safeToSpend: t('safeToSpend.widgetLabel'),
    };
  } catch {
    return DEFAULT_LABELS;
  }
}

/**
 * Collect data from Zustand stores, persist to SecureStore, and re-render
 * all Android home-screen widgets so they display up-to-date numbers.
 */
export async function refreshWidgetData(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    // Late imports to avoid circular dependency at module level
    const { useExpenseStore } = require('@/stores/expenseStore');
    const { useBudgetStore } = require('@/stores/budgetStore');
    const { useCategoryStore } = require('@/stores/categoryStore');
    const { useAccountStore } = require('@/stores/accountStore');
    const { useInsightsStore } = require('@/stores/insightsStore');

    const expenses = useExpenseStore.getState().expenses.filter(
      (e: any) => !e.isDeleted,
    );
    const account = useAccountStore.getState().currentAccount?.();
    const currencyCode: Currency = account?.currencyCode || 'USD';

    // Filter expenses by account currency
    const currencyExpenses = expenses.filter(
      (e: any) => e.currencyCode === currencyCode,
    );

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

    // Today
    const todayExpenses = currencyExpenses
      .filter((e: any) => new Date(e.date) >= todayStart)
      .reduce((s: number, e: any) => s + e.amount, 0);

    // Yesterday
    const yesterdayExpenses = currencyExpenses
      .filter((e: any) => {
        const d = new Date(e.date);
        return d >= yesterdayStart && d < todayStart;
      })
      .reduce((s: number, e: any) => s + e.amount, 0);

    // Weekly (last 7 days, one bar per day)
    const localDayNames = getWidgetLabels().dayNames;
    const weeklyExpenses: { day: string; amount: number }[] = [];
    let weekTotal = 0;
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(todayStart.getTime() - i * 24 * 60 * 60 * 1000);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const amount = currencyExpenses
        .filter((e: any) => {
          const d = new Date(e.date);
          return d >= dayStart && d < dayEnd;
        })
        .reduce((s: number, e: any) => s + e.amount, 0);
      weeklyExpenses.push({ day: localDayNames[dayStart.getDay()] ?? localDayNames[0], amount });
      weekTotal += amount;
    }

    // Budget progress
    const budgets = useBudgetStore
      .getState()
      .budgets.filter((b: any) => b.isActive && !b.isDeleted)
      .slice(0, 3)
      .map((b: any) => {
        const progress = useBudgetStore.getState().getBudgetProgress(b.id);
        return {
          name: b.name,
          spent: progress?.spent ?? 0,
          limit: b.amount,
        };
      });

    // Top categories (this month)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const categoryMap = new Map<string, { amount: number; icon: string; name: string }>();
    const catStore = useCategoryStore.getState();
    for (const e of currencyExpenses) {
      if (new Date(e.date) < monthStart) continue;
      const cat = e.categoryId ? catStore.getCategoryById(e.categoryId) : null;
      const key = e.categoryId || '__uncategorized';
      const prev = categoryMap.get(key) || {
        amount: 0,
        icon: cat?.icon || '📦',
        name: cat?.name || 'Other',
      };
      categoryMap.set(key, { ...prev, amount: prev.amount + e.amount });
    }
    const topCategories = Array.from(categoryMap.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);

    // Safe-to-spend from the insights store (MMKV-cached; may be null)
    const safeToSpendData = useInsightsStore.getState().safeToSpend;
    const safeToSpendToday = safeToSpendData ? safeToSpendData.safeToSpendToday : undefined;

    await WidgetDataService.updateWidgetData({
      todayExpenses,
      yesterdayExpenses,
      weeklyExpenses,
      weekTotal,
      budgets,
      topCategories,
      currencyCode,
      safeToSpendToday,
    });

    // Re-render all data widgets on the home screen
    const { requestWidgetUpdate } = require('react-native-android-widget');
    const { BudgetWidgetSmall } = require('@/widgets/BudgetWidgetSmall');
    const { BudgetWidgetMedium } = require('@/widgets/BudgetWidgetMedium');
    const { BudgetWidgetLarge } = require('@/widgets/BudgetWidgetLarge');

    const data = await WidgetDataService.getWidgetData();

    await Promise.all([
      requestWidgetUpdate({
        widgetName: 'BudgetWidgetSmall',
        renderWidget: () =>
          BudgetWidgetSmall({ data: data ? WidgetDataService.toSmallData(data) : null }),
      }),
      requestWidgetUpdate({
        widgetName: 'BudgetWidgetMedium',
        renderWidget: () =>
          BudgetWidgetMedium({ data: data ? WidgetDataService.toMediumData(data) : null }),
      }),
      requestWidgetUpdate({
        widgetName: 'BudgetWidgetLarge',
        renderWidget: () =>
          BudgetWidgetLarge({ data }),
      }),
    ]);
  } catch {
    // ignore — widget stays with stale data
  }
}
