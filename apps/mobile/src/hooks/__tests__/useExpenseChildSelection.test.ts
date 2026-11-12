/**
 * `useExpenseChildSelection` must never write a stale copy of an expense's
 * links: until the user touches a chip, `selected` follows the expense, and
 * `save()` writes only a selection the user actually changed.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { Expense } from '@budget/shared-types';

const mockSetExpenseChildren = jest.fn().mockResolvedValue(undefined);
const mockLoadExpenseItems = jest.fn().mockResolvedValue([]);

jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('../useAccountChildren', () => ({
  useAccountChildren: () => ({
    children: [],
    activeChildren: [],
    archivedChildren: [],
    isLoaded: true,
    isLoading: false,
    loadFailed: false,
    reload: jest.fn(),
  }),
}));
jest.mock('@/stores/childStore', () => ({
  useChildStore: { getState: () => ({ setExpenseChildren: mockSetExpenseChildren }) },
}));
jest.mock('@/stores/expenseStore', () => ({
  useExpenseStore: { getState: () => ({ loadExpenseItems: mockLoadExpenseItems }) },
}));
jest.mock('@/features/children/attributionModes', () => ({
  attributionModeOf: () => 'none',
}));

// eslint-disable-next-line import/first
import { useExpenseChildSelection, type ExpenseChildSelection } from '../useExpenseChildSelection';

const expenseWith = (childIds: string[]): Expense =>
  ({
    id: 'e1',
    expenseChildren: childIds.map((childId) => ({ expenseId: 'e1', childId, share: 1 / childIds.length })),
  }) as unknown as Expense;

function render(initial: Expense) {
  let hook!: ExpenseChildSelection;
  function Probe({ expense }: { expense: Expense }) {
    hook = useExpenseChildSelection(expense);
    return null;
  }
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(Probe, { expense: initial }));
  });
  return {
    get current() {
      return hook;
    },
    rerender: (expense: Expense) =>
      act(() => {
        renderer.update(createElement(Probe, { expense }));
      }),
  };
}

beforeEach(() => {
  mockSetExpenseChildren.mockClear();
});

describe('useExpenseChildSelection', () => {
  it('follows the expense when its links change while the chips are untouched', () => {
    const hook = render(expenseWith(['a']));
    expect(hook.current.selected).toEqual(['a']);

    // A background pull (or a line attribution) replaced the links.
    hook.rerender(expenseWith([]));
    expect(hook.current.selected).toEqual([]);
    hook.rerender(expenseWith(['b']));
    expect(hook.current.selected).toEqual(['b']);
  });

  it('saving without touching the chips never calls setExpenseChildren', async () => {
    const hook = render(expenseWith(['a']));
    hook.rerender(expenseWith([]));

    await act(async () => {
      await hook.current.save();
    });
    expect(mockSetExpenseChildren).not.toHaveBeenCalled();
  });

  it('saves a selection the user changed', async () => {
    const hook = render(expenseWith(['a']));

    await act(async () => {
      await hook.current.onChange(['a', 'b']);
    });
    expect(hook.current.selected).toEqual(['a', 'b']);
    await act(async () => {
      await hook.current.save();
    });
    expect(mockSetExpenseChildren).toHaveBeenCalledWith('e1', ['a', 'b']);
  });

  it('reset drops the session edit and resumes following the expense', async () => {
    const hook = render(expenseWith(['a']));
    await act(async () => {
      await hook.current.onChange(['b']);
    });
    act(() => hook.current.reset());
    expect(hook.current.selected).toEqual(['a']);

    hook.rerender(expenseWith(['c']));
    expect(hook.current.selected).toEqual(['c']);
    await act(async () => {
      await hook.current.save();
    });
    expect(mockSetExpenseChildren).not.toHaveBeenCalled();
  });
});
