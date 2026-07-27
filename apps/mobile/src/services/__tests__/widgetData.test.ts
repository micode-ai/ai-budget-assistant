/**
 * `refreshWidgetData` is the one split-receivable consumption surface that is a plain
 * function rather than a React hook, so it is the one that can be covered end to end:
 * the `filterConsumption` call lives *inside* it. Deleting that call makes the
 * assertions below fail, which is the whole point — a test that re-applies the filter
 * itself before calling production code proves only that arithmetic works.
 *
 * The stores are reached through late `require()` calls inside the function (to dodge a
 * circular import at module scope), which is exactly what makes them mockable here.
 */

import * as SecureStore from 'expo-secure-store';
import { refreshWidgetData } from '../widgetData';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
}));

// The function early-returns off Android, and jest-expo may run a suite under any
// platform, so pin it rather than depend on which project picked this file up.
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

jest.mock('react-native-android-widget', () => ({ requestWidgetUpdate: jest.fn() }));
jest.mock('@/widgets/BudgetWidgetSmall', () => ({ BudgetWidgetSmall: jest.fn() }));
jest.mock('@/widgets/BudgetWidgetMedium', () => ({ BudgetWidgetMedium: jest.fn() }));
jest.mock('@/widgets/BudgetWidgetLarge', () => ({ BudgetWidgetLarge: jest.fn() }));
jest.mock('@/i18n', () => ({
  default: {
    t: (key: string, opts?: { returnObjects?: boolean }) =>
      opts?.returnObjects ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : key,
  },
}));

jest.mock('@/stores/expenseStore', () => ({ useExpenseStore: { getState: jest.fn() } }));
jest.mock('@/stores/budgetStore', () => ({ useBudgetStore: { getState: jest.fn() } }));
jest.mock('@/stores/categoryStore', () => ({ useCategoryStore: { getState: jest.fn() } }));
jest.mock('@/stores/accountStore', () => ({ useAccountStore: { getState: jest.fn() } }));
jest.mock('@/stores/insightsStore', () => ({ useInsightsStore: { getState: jest.fn() } }));

import { useExpenseStore } from '@/stores/expenseStore';
import { useBudgetStore } from '@/stores/budgetStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useAccountStore } from '@/stores/accountStore';
import { useInsightsStore } from '@/stores/insightsStore';

const mockSetItem = SecureStore.setItemAsync as jest.Mock;

const expense = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'e1',
  amount: 100,
  currencyCode: 'USD',
  date: new Date().toISOString(),
  isDeleted: false,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSetItem.mockResolvedValue(undefined);
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  (useBudgetStore.getState as jest.Mock).mockReturnValue({
    budgets: [],
    getBudgetProgress: () => null,
  });
  (useCategoryStore.getState as jest.Mock).mockReturnValue({ getCategoryById: () => null });
  (useAccountStore.getState as jest.Mock).mockReturnValue({
    currentAccount: () => ({ currencyCode: 'USD' }),
  });
  (useInsightsStore.getState as jest.Mock).mockReturnValue({ safeToSpend: null });
});

/**
 * Runs the real function and returns the payload it serialized to SecureStore.
 *
 * `refreshWidgetData` swallows every error in a bare `catch {}` so a widget refresh can
 * never crash the app. A broken mock would therefore produce a silently passing test,
 * so this asserts the write actually happened before returning anything.
 */
async function runAndReadPayload(expenses: Array<Record<string, unknown>>) {
  (useExpenseStore.getState as jest.Mock).mockReturnValue({ expenses });

  await refreshWidgetData();

  expect(mockSetItem).toHaveBeenCalledTimes(1);
  return JSON.parse(mockSetItem.mock.calls[0][1] as string);
}

/** Today is the last of the seven day-bars, and `value` there is a raw number. */
const todayBarValue = (payload: { weekBars: Array<{ value: number }> }): number =>
  payload.weekBars[payload.weekBars.length - 1].value;

describe('refreshWidgetData — split-receivable exclusion', () => {
  it('reports a plain expense as spent', async () => {
    const payload = await runAndReadPayload([expense({ amount: 40 })]);
    expect(todayBarValue(payload)).toBe(40);
  });

  it('counts a 200 bill split three ways once, not 350', async () => {
    // One receipt the payer actually paid, plus a receivable row per participant.
    const payload = await runAndReadPayload([
      expense({ id: 'receipt', amount: 200 }),
      expense({ id: 'd1', amount: 50, isDebt: true, isSplitReceivable: true }),
      expense({ id: 'd2', amount: 50, isDebt: true, isSplitReceivable: true }),
      expense({ id: 'd3', amount: 50, isDebt: true, isSplitReceivable: true }),
    ]);

    expect(todayBarValue(payload)).toBe(200);
    expect(payload.todaySpent).toContain('200');
    expect(payload.todaySpent).not.toContain('350');
  });

  it('still counts a standalone cash loan — that debt row is the real outflow', async () => {
    // Only `isSplitReceivable` may be excluded. Filtering on `isDebt` would erase the
    // spending of every user who lends money without splitting a receipt.
    const payload = await runAndReadPayload([
      expense({ amount: 500, isDebt: true, debtContactName: 'Anna' }),
    ]);
    expect(todayBarValue(payload)).toBe(500);
  });
});
