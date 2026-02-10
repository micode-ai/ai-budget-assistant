import * as SecureStore from 'expo-secure-store';
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

export interface WidgetSmallData {
  todaySpent: string;
  todayDelta: string; // e.g., "+12%" or "-5%"
  deltaDirection: 'up' | 'down' | 'neutral';
  currencyCode: string;
  updatedAt: string;
}

export interface WidgetMediumData extends WidgetSmallData {
  weekTotal: string;
  weekBars: Array<{
    day: string; // Mon, Tue, ...
    value: number;
    maxValue: number;
  }>;
}

export interface WidgetLargeData extends WidgetMediumData {
  budgets: Array<{
    name: string;
    spent: string;
    limit: string;
    percent: number;
    isOverBudget: boolean;
  }>;
  topCategories: Array<{
    name: string;
    amount: string;
    icon: string;
  }>;
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
    weeklyExpenses: Array<{ day: string; amount: number }>;
    weekTotal: number;
    budgets: Array<{
      name: string;
      spent: number;
      limit: number;
    }>;
    topCategories: Array<{
      name: string;
      amount: number;
      icon: string;
    }>;
    currencyCode: Currency;
  }): Promise<void> {
    const {
      todayExpenses,
      yesterdayExpenses,
      weeklyExpenses,
      weekTotal,
      budgets,
      topCategories,
      currencyCode,
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

    const data: WidgetLargeData = {
      todaySpent: formatCurrency(todayExpenses, currencyCode),
      todayDelta,
      deltaDirection,
      currencyCode,
      updatedAt: new Date().toISOString(),
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
      weekTotal: data.weekTotal,
      weekBars: data.weekBars,
    };
  }
}
