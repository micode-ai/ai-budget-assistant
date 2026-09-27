/**
 * ABA-615: `useRecurringExpenseFields` gained an optional `initial` param so
 * `ExpenseDetailsCard` can seed the toggle's starting state — additive only,
 * since `expense/new.tsx`'s existing `useRecurringExpenseFields()` call (no
 * argument) must keep behaving exactly as before.
 *
 * Same "Probe exists only to give the hook a render to live in" pattern as
 * `useAlertTapThrough.test.ts` — no UI is asserted, only the returned state.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  useRecurringExpenseFields,
  type RecurringExpenseFieldsState,
} from '../useRecurringExpenseFields';

function renderRecurringFields(initial?: Parameters<typeof useRecurringExpenseFields>[0]) {
  let hook!: RecurringExpenseFieldsState;
  function Probe() {
    hook = useRecurringExpenseFields(initial);
    return null;
  }
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(Probe));
  });
  return {
    get current(): RecurringExpenseFieldsState {
      return hook;
    },
    unmount: () => renderer.unmount(),
  };
}

describe('useRecurringExpenseFields', () => {
  it('defaults to off/monthly when called with no argument (expense/new.tsx, unchanged)', () => {
    const hook = renderRecurringFields();

    expect(hook.current.isRecurring).toBe(false);
    expect(hook.current.recurringPeriod).toBe('monthly');
  });

  it('seeds isRecurring/recurringPeriod from `initial` when provided', () => {
    const hook = renderRecurringFields({ isRecurring: true, recurringPeriod: 'yearly' });

    expect(hook.current.isRecurring).toBe(true);
    expect(hook.current.recurringPeriod).toBe('yearly');
  });

  it('defaults to monthly when `initial` sets isRecurring but omits a period', () => {
    const hook = renderRecurringFields({ isRecurring: true });

    expect(hook.current.recurringPeriod).toBe('monthly');
  });

  it('setIsRecurring/setRecurringPeriod update the returned state', () => {
    const hook = renderRecurringFields();

    act(() => {
      hook.current.setIsRecurring(true);
      hook.current.setRecurringPeriod('weekly');
    });

    expect(hook.current.isRecurring).toBe(true);
    expect(hook.current.recurringPeriod).toBe('weekly');
  });
});
