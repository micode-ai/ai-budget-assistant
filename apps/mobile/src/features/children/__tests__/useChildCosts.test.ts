/**
 * `useChildCosts(childId)` — one child's costs for the Child costs screen.
 *
 * - Same spend predicate as the Analytics tab: `filterConsumption` drops split
 *   receivables, and planned expenses are never spend (ruling R1).
 * - Coverage is null when the child has no 800+ income at all.
 * - An archived child keeps its attributions, so it still has a summary.
 * - While a source is still loading, the hook says so instead of a 0 total.
 * - An amount in a currency without a rate is left out and flagged.
 */
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { Child, Expense, Income } from '@budget/shared-types';

const NOW = new Date(2026, 10, 12, 12, 0, 0); // 12 Nov 2026

const mockChildren: { list: Child[]; isLoaded: boolean; loadFailed: boolean } = {
  list: [],
  isLoaded: true,
  loadFailed: false,
};
const mockExpenseState: { expenses: Expense[]; expenseItems: Record<string, unknown[]>; lastPullAt: number | null } = {
  expenses: [],
  expenseItems: {},
  lastPullAt: 1,
};
const mockIncomeState: { incomes: Income[]; lastPullAt: number | null } = { incomes: [], lastPullAt: 1 };
const mockRateState = {
  rates: { PLN: 1, EUR: 0.25 } as Record<string, number>,
  baseCurrency: 'PLN',
  isLoading: false,
  loadRates: jest.fn(),
};
const mockGetChildLineItems = jest.fn().mockResolvedValue([]);

jest.mock('@/utils/consumption', () => {
  const actual = jest.requireActual('@/utils/consumption');
  return { ...actual, filterConsumption: jest.fn(actual.filterConsumption) };
});
jest.mock('@/hooks/useAccountChildren', () => ({
  useAccountChildren: () => ({
    children: mockChildren.list,
    activeChildren: mockChildren.list.filter((c) => !c.archivedAt),
    archivedChildren: mockChildren.list.filter((c) => !!c.archivedAt),
    isLoaded: mockChildren.isLoaded,
    isLoading: !mockChildren.isLoaded,
    loadFailed: mockChildren.loadFailed,
    reload: jest.fn(),
  }),
}));
jest.mock('@/stores/expenseStore', () => ({
  useExpenseStore: Object.assign((sel: (s: typeof mockExpenseState) => unknown) => sel(mockExpenseState), {
    getState: () => mockExpenseState,
  }),
}));
jest.mock('@/stores/incomeStore', () => ({
  useIncomeStore: Object.assign((sel: (s: typeof mockIncomeState) => unknown) => sel(mockIncomeState), {
    getState: () => mockIncomeState,
  }),
}));
jest.mock('@/stores/exchangeRateStore', () => ({
  useExchangeRateStore: Object.assign((sel: (s: typeof mockRateState) => unknown) => sel(mockRateState), {
    getState: () => mockRateState,
  }),
}));
jest.mock('@/stores/authStore', () => ({
  useAuthStore: (sel: (s: { user: { currencyCode: string } }) => unknown) => sel({ user: { currencyCode: 'PLN' } }),
}));
jest.mock('@/stores/accountStore', () => ({
  useAccountStore: Object.assign((sel: (s: { currentAccountId: string }) => unknown) => sel({ currentAccountId: 'acc1' }), {
    getState: () => ({ currentAccountId: 'acc1' }),
  }),
}));
jest.mock('@/stores/hydrateTransactions', () => ({ hydrateTransactions: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/db/expenseItemRepository', () => ({
  getChildLineItems: (...a: unknown[]) => mockGetChildLineItems(...a),
}));

// eslint-disable-next-line import/first
import { Platform } from 'react-native';
// eslint-disable-next-line import/first
import { hydrateTransactions } from '@/stores/hydrateTransactions';
// eslint-disable-next-line import/first
import { filterConsumption } from '@/utils/consumption';
// eslint-disable-next-line import/first
import { useChildCosts, type ChildCostsState } from '../useChildCosts';

const child = (over: Partial<Child> = {}): Child => ({ id: 'kidA', accountId: 'acc1', name: 'A', ...over });

const expense = (over: Partial<Expense>): Expense =>
  ({
    id: 'e1',
    localId: 'e1',
    userId: 'u1',
    accountId: 'acc1',
    amount: 100,
    currencyCode: 'PLN',
    categoryId: 'food',
    date: new Date(2026, 10, 3),
    source: 'manual',
    isRecurring: false,
    isDebt: false,
    isDeleted: false,
    syncStatus: 'synced',
    syncVersion: 0,
    createdAt: new Date(2026, 10, 3),
    updatedAt: new Date(2026, 10, 3),
    expenseChildren: [{ expenseId: over.id ?? 'e1', childId: 'kidA', share: 1 }],
    ...over,
  }) as Expense;

const income = (over: Partial<Income>): Income =>
  ({
    id: 'i1',
    localId: 'i1',
    userId: 'u1',
    accountId: 'acc1',
    amount: 800,
    currencyCode: 'PLN',
    date: new Date(2026, 10, 1),
    source: 'manual',
    isDebt: false,
    isDebtRepayment: false,
    isDeleted: false,
    syncStatus: 'synced',
    syncVersion: 0,
    createdAt: new Date(2026, 10, 1),
    updatedAt: new Date(2026, 10, 1),
    ...over,
  }) as Income;

async function render(childId = 'kidA') {
  let hook!: ChildCostsState;
  function Probe() {
    hook = useChildCosts(childId, NOW);
    return null;
  }
  await act(async () => {
    create(createElement(Probe));
  });
  // Let the line-item read settle.
  await act(async () => {
    await Promise.resolve();
  });
  return {
    get current() {
      return hook;
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetChildLineItems.mockResolvedValue([]);
  mockChildren.list = [child()];
  mockChildren.isLoaded = true;
  mockChildren.loadFailed = false;
  mockExpenseState.expenses = [];
  mockExpenseState.expenseItems = {};
  mockExpenseState.lastPullAt = 1;
  mockIncomeState.incomes = [];
  mockIncomeState.lastPullAt = 1;
  mockRateState.rates = { PLN: 1, EUR: 0.25 };
  mockRateState.isLoading = false;
  mockRateState.loadRates.mockImplementation(() => undefined);
  (hydrateTransactions as jest.Mock).mockResolvedValue(undefined);
});

describe('useChildCosts', () => {
  it('useChildCosts excludes split receivables via filterConsumption', async () => {
    mockExpenseState.expenses = [
      expense({ id: 'e1', amount: 100 }),
      expense({ id: 'e2', amount: 50, isSplitReceivable: true }),
      expense({ id: 'e3', amount: 30, isPlanned: true }),
    ];
    const hook = await render();
    expect(filterConsumption).toHaveBeenCalled();
    expect(hook.current.loading).toBe(false);
    expect(hook.current.summary?.monthTotal).toBe(100);
    expect(hook.current.summary?.yearTotal).toBe(100);
  });

  it('returns coverage null when no benefit income', async () => {
    mockExpenseState.expenses = [expense({ amount: 400 })];
    mockIncomeState.incomes = [income({ childBenefitChildId: null, description: 'Salary' })];
    const hook = await render();
    expect(hook.current.summary?.yearTotal).toBe(400);
    expect(hook.current.coverage).toBeNull();
  });

  it('returns coverage when the child has benefit income this year', async () => {
    mockExpenseState.expenses = [expense({ amount: 400 })];
    mockIncomeState.incomes = [income({ childBenefitChildId: 'kidA', amount: 800 })];
    const hook = await render();
    expect(hook.current.coverage).toEqual({ benefit: 800, spending: 400, percent: 200 });
  });

  it('archived child still yields a summary', async () => {
    mockChildren.list = [child({ archivedAt: '2026-06-01T00:00:00.000Z' })];
    mockExpenseState.expenses = [expense({ amount: 75 })];
    const hook = await render();
    expect(hook.current.child?.archivedAt).toBeTruthy();
    expect(hook.current.summary?.monthTotal).toBe(75);
  });

  it('reports loading, never a 0 total, while children are not loaded', async () => {
    mockChildren.isLoaded = false;
    mockExpenseState.expenses = [expense({ amount: 75 })];
    const hook = await render();
    expect(hook.current.loading).toBe(true);
    expect(hook.current.summary).toBeNull();
  });

  it('a failed children load is an error, not an empty child', async () => {
    mockChildren.isLoaded = false;
    mockChildren.loadFailed = true;
    const hook = await render();
    expect(hook.current.error).toBe(true);
    expect(hook.current.summary).toBeNull();
  });

  it('leaves out an amount without a rate and flags it', async () => {
    mockExpenseState.expenses = [
      expense({ id: 'e1', amount: 100 }),
      expense({ id: 'e2', amount: 10, currencyCode: 'EUR' }),
      expense({ id: 'e3', amount: 999, currencyCode: 'XYZ' as Expense['currencyCode'] }),
    ];
    const hook = await render();
    // 10 EUR at 0.25 EUR per PLN = 40 PLN; XYZ has no rate.
    expect(hook.current.summary?.monthTotal).toBe(140);
    expect(hook.current.summary?.fxApproximate).toBe(true);
  });

  it('splits a whole-attributed expense across its category splits', async () => {
    mockExpenseState.expenses = [
      expense({
        id: 'e1',
        amount: 100,
        categoryId: 'food',
        splits: [
          { id: 's1', expenseId: 'e1', categoryId: 'food', amount: 60, percentage: 60, isDeleted: false } as never,
          { id: 's2', expenseId: 'e1', categoryId: 'toys', amount: 40, percentage: 40, isDeleted: false } as never,
        ],
      }),
    ];
    const hook = await render();
    expect(hook.current.summary?.monthTotal).toBe(100);
    expect(hook.current.summary?.byCategory).toEqual([
      { categoryId: 'food', amount: 60 },
      { categoryId: 'toys', amount: 40 },
    ]);
  });

  it('counts only the attributed receipt lines of a line-attributed expense', async () => {
    mockExpenseState.expenses = [expense({ id: 'e1', amount: 100, expenseChildren: [] })];
    mockGetChildLineItems.mockResolvedValue([
      { id: 'l1', expenseId: 'e1', totalPrice: 30, childId: 'kidA', isDeleted: false },
      { id: 'l2', expenseId: 'e1', totalPrice: 70, childId: null, isDeleted: false },
    ]);
    const hook = await render();
    expect(hook.current.summary?.monthTotal).toBe(30);
  });

  it('flags the notice when an 800+ payment has no exchange rate', async () => {
    mockExpenseState.expenses = [expense({ amount: 400 })];
    mockIncomeState.incomes = [
      income({ id: 'i1', childBenefitChildId: 'kidA', amount: 800 }),
      income({ id: 'i2', childBenefitChildId: 'kidA', amount: 200, currencyCode: 'XYZ' as Income['currencyCode'] }),
    ];
    const hook = await render();
    expect(hook.current.coverage?.benefit).toBe(800);
    expect(hook.current.summary?.fxApproximate).toBe(true);
  });

  it('skips the receipt-line read when the account has no children', async () => {
    mockChildren.list = [];
    const hook = await render();
    expect(mockGetChildLineItems).not.toHaveBeenCalled();
    expect(hook.current.loading).toBe(false);
    expect(hook.current.notFound).toBe(true);
  });

  it('stays loading until a rates load has run, instead of dropping foreign amounts', async () => {
    mockRateState.rates = {};
    mockRateState.loadRates.mockImplementation(() => {
      mockRateState.isLoading = true;
    });
    mockExpenseState.expenses = [expense({ amount: 10, currencyCode: 'EUR' })];
    const hook = await render();
    expect(mockRateState.loadRates).toHaveBeenCalledTimes(1);
    expect(hook.current.loading).toBe(true);
    expect(hook.current.summary).toBeNull();
  });

  describe('on web', () => {
    const originalOS = Platform.OS;
    beforeEach(() => {
      Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    });
    afterEach(() => {
      Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    });

    it('a pull that finished with nothing pulled is an error with a retry, not a spinner', async () => {
      mockExpenseState.lastPullAt = null;
      mockExpenseState.expenses = [expense({ amount: 75 })];
      const hook = await render();
      expect(hydrateTransactions).toHaveBeenCalledWith(undefined);
      expect(hook.current.error).toBe(true);
      expect(hook.current.loading).toBe(false);
      expect(hook.current.summary).toBeNull();

      // Retry forces a new pull; once it lands, the figures appear.
      (hydrateTransactions as jest.Mock).mockImplementation(async () => {
        mockExpenseState.lastPullAt = 2;
      });
      await act(async () => {
        hook.current.retry();
        await Promise.resolve();
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(hydrateTransactions).toHaveBeenLastCalledWith({ force: true });
      expect(hook.current.error).toBe(false);
      expect(hook.current.summary?.monthTotal).toBe(75);
    });

    it('is loading, not an error, while the pull is still in flight', async () => {
      mockExpenseState.lastPullAt = null;
      (hydrateTransactions as jest.Mock).mockImplementation(() => new Promise(() => undefined));
      const hook = await render();
      expect(hook.current.loading).toBe(true);
      expect(hook.current.error).toBe(false);
    });
  });
});
