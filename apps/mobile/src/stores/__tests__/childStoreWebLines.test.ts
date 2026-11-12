/**
 * Web keeps no line rows on the device: the list pull marks an expense with
 * `hasLineChildren`, and a bulk "Assign to child" skips expenses carrying it.
 * Clearing the LAST attributed line must drop the flag, or the expense is
 * skipped until the next pull.
 */
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('../../db/childRepository', () => ({}));
jest.mock('../../db/expenseItemRepository', () => ({}));
jest.mock('../../db/client', () => ({ withTransaction: (task: () => Promise<void>) => task() }));
jest.mock('../../services/api', () => ({ api: { setItemChild: jest.fn().mockResolvedValue(undefined) } }));
jest.mock('../../services/encryptionHelper', () => ({ maybeDecrypt: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('../childSync', () => ({
  buildChildSyncChange: jest.fn(),
  drainChildQueue: jest.fn(),
  readEncryptionTier: jest.fn(),
  resetChildSyncState: jest.fn(),
}));
jest.mock('../accountStore', () => ({
  useAccountStore: { getState: () => ({ currentAccountId: 'acc-1' }) },
}));

type Line = { id: string; childId?: string | null; isDeleted?: boolean };
type Exp = { id: string; hasLineChildren?: boolean; expenseChildren?: unknown[] };
const mockState: { expenses: Exp[]; expenseItems: Record<string, Line[]> } = { expenses: [], expenseItems: {} };
jest.mock('../expenseStore', () => ({
  useExpenseStore: {
    getState: () => mockState,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setState: (patch: any) => {
      Object.assign(mockState, typeof patch === 'function' ? patch(mockState) : patch);
    },
  },
}));

// eslint-disable-next-line import/first
import { useChildStore } from '../childStore';

beforeEach(() => {
  mockState.expenses = [{ id: 'e-1', hasLineChildren: true, expenseChildren: [] }];
  mockState.expenseItems = {
    'e-1': [
      { id: 'i-1', childId: 'c-1' },
      { id: 'i-2', childId: 'c-2' },
    ],
  };
});

describe('childStore.setItemChild on web', () => {
  it('keeps hasLineChildren while another line is still attributed', async () => {
    await useChildStore.getState().setItemChild('e-1', 'i-1', null);
    expect(mockState.expenseItems['e-1'][0].childId).toBeNull();
    expect(mockState.expenses[0].hasLineChildren).toBe(true);
  });

  it('drops hasLineChildren when the last attributed line is cleared, leaving the links alone', async () => {
    mockState.expenses[0].expenseChildren = [{ marker: true }];
    await useChildStore.getState().setItemChild('e-1', 'i-1', null);
    await useChildStore.getState().setItemChild('e-1', 'i-2', null);
    expect(mockState.expenses[0].hasLineChildren).toBe(false);
    expect(mockState.expenses[0].expenseChildren).toEqual([{ marker: true }]);
  });
});
