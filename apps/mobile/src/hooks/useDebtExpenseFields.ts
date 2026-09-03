import { useState } from 'react';

export interface DebtExpenseFieldsState {
  isDebt: boolean;
  setIsDebt: (value: boolean) => void;
  debtContactName: string;
  setDebtContactName: (value: string) => void;
  debtDueDate: Date | null;
  setDebtDueDate: (value: Date | null) => void;
  showDebtDatePicker: boolean;
  setShowDebtDatePicker: (value: boolean) => void;
}

/**
 * Owns the "lend money" debt sub-form state for expense/new.tsx (tech-debt
 * expense-new-screen-god-file) — the isDebt toggle, contact name, and the
 * optional due date + its picker visibility. Extracted out of the screen
 * with no behavior change; handleSubmit in the screen still reads these
 * values directly to build the create-expense payload.
 */
export function useDebtExpenseFields(initial: {
  isDebt?: boolean;
  debtContactName?: string;
}): DebtExpenseFieldsState {
  const [isDebt, setIsDebt] = useState(initial.isDebt ?? false);
  const [debtContactName, setDebtContactName] = useState(initial.debtContactName ?? '');
  const [debtDueDate, setDebtDueDate] = useState<Date | null>(null);
  const [showDebtDatePicker, setShowDebtDatePicker] = useState(false);

  return {
    isDebt,
    setIsDebt,
    debtContactName,
    setDebtContactName,
    debtDueDate,
    setDebtDueDate,
    showDebtDatePicker,
    setShowDebtDatePicker,
  };
}
