import { useState } from 'react';
import type { RecurringPeriod } from '@budget/shared-types';

export interface RecurringExpenseFieldsState {
  isRecurring: boolean;
  setIsRecurring: (value: boolean) => void;
  recurringPeriod: RecurringPeriod;
  setRecurringPeriod: (value: RecurringPeriod) => void;
}

/**
 * Owns the recurring-expense toggle state for expense/new.tsx (tech-debt
 * expense-new-screen-god-file) — isolated the same way the debt sub-form
 * was, since it's an independently-evolving concern with no relation to
 * the base expense fields.
 */
export function useRecurringExpenseFields(): RecurringExpenseFieldsState {
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringPeriod, setRecurringPeriod] = useState<RecurringPeriod>('monthly');

  return { isRecurring, setIsRecurring, recurringPeriod, setRecurringPeriod };
}
