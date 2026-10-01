const mockLoadExpenses = jest.fn();
const mockLoadIncomes = jest.fn();
let mockAccountId: string | null = 'acc-1';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('../expenseStore', () => ({
  useExpenseStore: { getState: () => ({ loadExpenses: mockLoadExpenses }) },
}));
jest.mock('../incomeStore', () => ({
  useIncomeStore: { getState: () => ({ loadIncomes: mockLoadIncomes }) },
}));
jest.mock('../accountStore', () => ({
  useAccountStore: { getState: () => ({ currentAccountId: mockAccountId }) },
}));

import { hydrateTransactions, useHydrationStore } from '../hydrateTransactions';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

describe('hydrateTransactions force handling', () => {
  beforeEach(() => {
    mockLoadExpenses.mockReset();
    mockLoadIncomes.mockReset().mockResolvedValue(undefined);
    mockAccountId = 'acc-1';
  });

  it('collapses concurrent non-forced calls into one cycle', async () => {
    const d = deferred();
    mockLoadExpenses.mockReturnValue(d.promise);
    const a = hydrateTransactions();
    const b = hydrateTransactions();
    d.resolve();
    await Promise.all([a, b]);
    expect(mockLoadExpenses).toHaveBeenCalledTimes(1);
  });

  it('runs one forced follow-up when force arrives during a non-forced cycle', async () => {
    const d = deferred();
    mockLoadExpenses.mockImplementationOnce(() => d.promise).mockResolvedValue(undefined);
    const plain = hydrateTransactions();
    await flush();
    let forcedDone = false;
    const forced = hydrateTransactions({ force: true }).then(() => { forcedDone = true; });
    expect(mockLoadExpenses).toHaveBeenCalledTimes(1);
    d.resolve();
    await plain;
    await forced;
    expect(forcedDone).toBe(true);
    expect(mockLoadExpenses).toHaveBeenCalledTimes(2);
    expect(mockLoadExpenses).toHaveBeenLastCalledWith({ force: true });
    expect(mockLoadIncomes).toHaveBeenLastCalledWith({ force: true });
    expect(useHydrationStore.getState().isHydrating).toBe(false);
  });

  it('coalesces several forced calls into exactly one follow-up', async () => {
    const d = deferred();
    mockLoadExpenses.mockImplementationOnce(() => d.promise).mockResolvedValue(undefined);
    const plain = hydrateTransactions();
    await flush();
    const f1 = hydrateTransactions({ force: true });
    const f2 = hydrateTransactions({ force: true });
    expect(f2).toBe(f1);
    d.resolve();
    await Promise.all([plain, f1, f2]);
    expect(mockLoadExpenses).toHaveBeenCalledTimes(2);
  });

  it('does not queue a follow-up when the running cycle is already forced', async () => {
    const d = deferred();
    mockLoadExpenses.mockImplementationOnce(() => d.promise).mockResolvedValue(undefined);
    const first = hydrateTransactions({ force: true });
    await flush();
    const second = hydrateTransactions({ force: true });
    d.resolve();
    await Promise.all([first, second]);
    expect(mockLoadExpenses).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh cycle after everything settled', async () => {
    mockLoadExpenses.mockResolvedValue(undefined);
    await hydrateTransactions();
    await hydrateTransactions({ force: true });
    expect(mockLoadExpenses).toHaveBeenCalledTimes(2);
  });
});
