/**
 * `useChildAttribution` — per-line child attribution on a saved receipt.
 *
 * - Line and whole-expense attribution are mutually exclusive: attributing a
 *   line on an expense attributed as a whole asks before anything is written.
 * - A learned suggestion is shown, never applied.
 * - "Extract items" carries attributions onto the regenerated lines through
 *   `setItemChild` and reports how many could not be carried.
 */
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { Expense, ExpenseItem } from '@budget/shared-types';

const mockSetItemChild = jest.fn().mockResolvedValue(undefined);
const mockSetExpenseChildren = jest.fn().mockResolvedValue(undefined);
const mockResolveServerChildIds = jest.fn();
const mockGetChildSuggestions = jest.fn();
const mockShowAlert = jest.fn();
const mockReadTier = jest.fn().mockResolvedValue(0);

const mockExpenseState: { expenses: Expense[]; expenseItems: Record<string, ExpenseItem[]> } = {
  expenses: [],
  expenseItems: {},
};

jest.mock('@/utils/alert', () => ({ showAlert: (...args: unknown[]) => mockShowAlert(...args) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@/stores/childStore', () => ({
  useChildStore: Object.assign(
    (sel: (s: unknown) => unknown) =>
      sel({ children: [{ id: 'kidA', name: 'A' }, { id: 'kidB', name: 'B' }] }),
    {
      getState: () => ({
        setItemChild: mockSetItemChild,
        setExpenseChildren: mockSetExpenseChildren,
        resolveServerChildIds: mockResolveServerChildIds,
        children: [{ id: 'kidA', name: 'A' }, { id: 'kidB', name: 'B' }],
      }),
    },
  ),
}));
jest.mock('@/stores/childSync', () => ({ readEncryptionTier: (...a: unknown[]) => mockReadTier(...a) }));
jest.mock('@/stores/expenseStore', () => ({
  useExpenseStore: Object.assign((sel: (s: typeof mockExpenseState) => unknown) => sel(mockExpenseState), {
    getState: () => mockExpenseState,
  }),
}));
jest.mock('@/stores/accountStore', () => ({
  useAccountStore: Object.assign((sel: (s: { currentAccountId: string }) => unknown) => sel({ currentAccountId: 'acc1' }), {
    getState: () => ({ currentAccountId: 'acc1' }),
  }),
}));
jest.mock('@/services/connectivity', () => ({
  useConnectivityStore: (sel: (s: { status: string }) => unknown) => sel({ status: 'online' }),
}));
jest.mock('@/services/api', () => ({
  api: { getChildSuggestions: (...a: unknown[]) => mockGetChildSuggestions(...a) },
}));

// eslint-disable-next-line import/first
import {
  useChildAttribution,
  applyCarriedAttribution,
  type ChildAttribution,
} from '../useChildAttribution';

const item = (over: Partial<ExpenseItem>): ExpenseItem =>
  ({
    id: 'i1',
    expenseId: 'e1',
    description: 'Pieluchy',
    quantity: 1,
    unitPrice: 10,
    totalPrice: 10,
    sortOrder: 0,
    isDeleted: false,
    ...over,
  }) as ExpenseItem;

function seed(links: string[], items: ExpenseItem[]) {
  mockExpenseState.expenses = [
    {
      id: 'e1',
      expenseChildren: links.map((childId) => ({ expenseId: 'e1', childId, share: 1 / links.length })),
    } as unknown as Expense,
  ];
  mockExpenseState.expenseItems = { e1: items };
}

async function render(expenseId = 'e1') {
  let hook!: ChildAttribution;
  function Probe() {
    hook = useChildAttribution(expenseId);
    return null;
  }
  await act(async () => {
    create(createElement(Probe));
  });
  // Let the suggestion fetch settle.
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
  mockGetChildSuggestions.mockResolvedValue({});
  mockResolveServerChildIds.mockImplementation(async (ids: string[]) => new Map(ids.map((id) => [id, id])));
  mockReadTier.mockResolvedValue(0);
});

describe('useChildAttribution', () => {
  it('setLine on a whole-attributed expense requires confirmation', async () => {
    seed(['kidA'], [item({ id: 'i1' })]);
    const hook = await render();
    expect(hook.current.mode).toBe('whole');

    await act(async () => {
      await hook.current.setLine('i1', 'kidB');
    });
    // Asked first, nothing written yet.
    expect(mockShowAlert).toHaveBeenCalledTimes(1);
    expect(mockSetItemChild).not.toHaveBeenCalled();

    // Confirming writes the line.
    const buttons = mockShowAlert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    const replace = buttons.find((b) => b.text === 'children.replaceLinesConfirm');
    expect(replace).toBeDefined();
    await act(async () => {
      replace!.onPress!();
      await Promise.resolve();
    });
    expect(mockSetItemChild).toHaveBeenCalledWith('e1', 'i1', 'kidB');
  });

  it('setLine on an unattributed expense writes without asking', async () => {
    seed([], [item({ id: 'i1' })]);
    const hook = await render();
    await act(async () => {
      await hook.current.setLine('i1', 'kidA');
    });
    expect(mockShowAlert).not.toHaveBeenCalled();
    expect(mockSetItemChild).toHaveBeenCalledWith('e1', 'i1', 'kidA');
  });

  it('suggestions are not applied automatically', async () => {
    seed([], [item({ id: 'i1', description: 'Pieluchy Pampers 4' }), item({ id: 'i2', description: 'Mleko', sortOrder: 1 })]);
    mockGetChildSuggestions.mockResolvedValue({ pieluchypampers4: 'srvKidA' });
    mockResolveServerChildIds.mockResolvedValue(new Map([['srvKidA', 'kidA']]));

    const hook = await render();
    await act(async () => {
      await Promise.resolve();
    });

    // Product names only — never a child name.
    expect(mockGetChildSuggestions).toHaveBeenCalledTimes(1);
    expect(mockGetChildSuggestions.mock.calls[0][0]).toEqual(['Pieluchy Pampers 4', 'Mleko']);
    expect(hook.current.suggestions).toEqual({ i1: 'kidA' });
    expect(mockSetItemChild).not.toHaveBeenCalled();
    expect(mockSetExpenseChildren).not.toHaveBeenCalled();
  });

  it('no suggestion request on an encrypted account', async () => {
    seed([], [item({ id: 'i1' })]);
    mockReadTier.mockResolvedValue(1);
    const hook = await render();
    expect(mockGetChildSuggestions).not.toHaveBeenCalled();
    expect(hook.current.suggestions).toEqual({});
  });
});

describe('applyCarriedAttribution', () => {
  it('regeneration applies carried childIds and reports lost', async () => {
    const oldItems = [
      item({ id: 'o1', description: 'Pieluchy', canonicalName: 'Pieluchy Pampers', childId: 'kidA' }),
      item({ id: 'o2', description: 'Kredki', childId: 'kidB', sortOrder: 1 }),
      item({ id: 'o3', description: 'Chleb', childId: null, sortOrder: 2 }),
    ];
    const scanned = [
      { description: 'PIELUCHY', canonicalName: 'pieluchy  pampers' },
      { description: 'Chleb' },
    ];
    const newIds = ['n1', 'n2'];

    const setLine = jest.fn().mockResolvedValue(undefined);
    const result = await applyCarriedAttribution({
      expenseId: 'e1',
      oldItems,
      scanned,
      resolveItemId: async (index) => newIds[index],
      setItemChild: setLine,
    });

    expect(setLine).toHaveBeenCalledTimes(1);
    expect(setLine).toHaveBeenCalledWith('e1', 'n1', 'kidA');
    // Kredki (kidB) has no regenerated line to land on.
    expect(result).toEqual({ applied: 1, lost: 1 });
  });

  it('a line whose write fails counts as lost', async () => {
    const oldItems = [item({ id: 'o1', description: 'Pieluchy', childId: 'kidA' })];
    const setLine = jest.fn().mockRejectedValue(new Error('offline'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await applyCarriedAttribution({
      expenseId: 'e1',
      oldItems,
      scanned: [{ description: 'Pieluchy' }],
      resolveItemId: async () => 'n1',
      setItemChild: setLine,
    });
    expect(result).toEqual({ applied: 0, lost: 1 });
    warn.mockRestore();
  });

  it('a regenerated line that never got an id counts as lost', async () => {
    const oldItems = [item({ id: 'o1', description: 'Pieluchy', childId: 'kidA' })];
    const setLine = jest.fn();
    const result = await applyCarriedAttribution({
      expenseId: 'e1',
      oldItems,
      scanned: [{ description: 'Pieluchy' }],
      resolveItemId: async () => null,
      setItemChild: setLine,
    });
    expect(setLine).not.toHaveBeenCalled();
    expect(result).toEqual({ applied: 0, lost: 1 });
  });
});
