import { useState } from 'react';
import type { RecurringPeriod } from '@budget/shared-types';

export interface RecurringExpenseFieldsState {
  isRecurring: boolean;
  setIsRecurring: (value: boolean) => void;
  recurringPeriod: RecurringPeriod;
  setRecurringPeriod: (value: RecurringPeriod) => void;
}

export interface RecurringExpenseFieldsInitial {
  isRecurring?: boolean;
  recurringPeriod?: RecurringPeriod;
}

/**
 * Owns the recurring-expense toggle state for expense/new.tsx (tech-debt
 * expense-new-screen-god-file) — isolated the same way the debt sub-form
 * was, since it's an independently-evolving concern with no relation to
 * the base expense fields.
 *
 * `initial` (ABA-615) lets a caller seed the toggle's starting state —
 * additive, `expense/new.tsx` calls this with no argument and is unaffected.
 * `ExpenseDetailsCard` uses the default (both false/'monthly') too, since the
 * toggle it renders is only ever shown for an expense that isn't recurring
 * yet, but resets it explicitly whenever edit mode is re-entered, the same
 * way its other edit-only fields reset from the expense prop.
 */
export function useRecurringExpenseFields(
  initial?: RecurringExpenseFieldsInitial,
): RecurringExpenseFieldsState {
  const [isRecurring, setIsRecurring] = useState(initial?.isRecurring ?? false);
  const [recurringPeriod, setRecurringPeriod] = useState<RecurringPeriod>(
    initial?.recurringPeriod ?? 'monthly',
  );

  return { isRecurring, setIsRecurring, recurringPeriod, setRecurringPeriod };
}
