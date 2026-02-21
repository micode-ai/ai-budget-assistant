import { create } from 'zustand';
import type { DebtSummary, DebtStatus } from '@budget/shared-types';
import { loadDebtExpenses, loadRepaymentExpensesForIncome } from '@/db/expenseRepository';
import { loadDebtIncomes, loadRepaymentIncomesForExpense } from '@/db/incomeRepository';
import { useAccountStore } from './accountStore';

function computeStatus(remaining: number, dueDate?: Date): DebtStatus {
  if (remaining <= 0) return 'paid';
  if (dueDate && dueDate < new Date()) return 'overdue';
  return 'active';
}

interface DebtState {
  lentDebts: DebtSummary[];
  borrowedDebts: DebtSummary[];
  isLoading: boolean;
  error: string | null;

  loadDebts: () => Promise<void>;
  getActiveDebts: (type?: 'lent' | 'borrowed') => DebtSummary[];
  getOverdueDebts: (type?: 'lent' | 'borrowed') => DebtSummary[];
  getTotalLentRemaining: () => number;
  getTotalBorrowedRemaining: () => number;
  reset: () => void;
}

export const useDebtStore = create<DebtState>()((set, get) => ({
  lentDebts: [],
  borrowedDebts: [],
  isLoading: false,
  error: null,

  loadDebts: async () => {
    set({ isLoading: true, error: null });
    try {
      const accountId = useAccountStore.getState().currentAccountId;
      if (!accountId) {
        set({ isLoading: false });
        return;
      }

      const [debtExpenses, debtIncomes] = await Promise.all([
        loadDebtExpenses(accountId),
        loadDebtIncomes(accountId),
      ]);

      // Compute lent summaries (expenses where isDebt=true)
      const lentDebts: DebtSummary[] = await Promise.all(
        debtExpenses.map(async (expense) => {
          const repayments = await loadRepaymentIncomesForExpense(expense.id);
          const totalRepaid = repayments.reduce((s, r) => s + r.amount, 0);
          const remaining = expense.amount - totalRepaid;
          return {
            id: expense.id,
            type: 'lent' as const,
            contactName: expense.debtContactName || 'Unknown',
            originalAmount: expense.amount,
            currencyCode: expense.currencyCode,
            totalRepaid,
            remainingAmount: Math.max(0, remaining),
            status: computeStatus(remaining, expense.debtDueDate ? new Date(expense.debtDueDate) : undefined),
            dueDate: expense.debtDueDate ? new Date(expense.debtDueDate) : undefined,
            date: new Date(expense.date),
            description: expense.description,
            repayments: repayments.map((r) => ({
              id: r.id,
              amount: r.amount,
              date: new Date(r.date),
              description: r.description,
            })),
          };
        }),
      );

      // Compute borrowed summaries (incomes where isDebt=true)
      const borrowedDebts: DebtSummary[] = await Promise.all(
        debtIncomes.map(async (income) => {
          const repayments = await loadRepaymentExpensesForIncome(income.id);
          const totalRepaid = repayments.reduce((s, r) => s + r.amount, 0);
          const remaining = income.amount - totalRepaid;
          return {
            id: income.id,
            type: 'borrowed' as const,
            contactName: income.debtContactName || 'Unknown',
            originalAmount: income.amount,
            currencyCode: income.currencyCode,
            totalRepaid,
            remainingAmount: Math.max(0, remaining),
            status: computeStatus(remaining, income.debtDueDate ? new Date(income.debtDueDate) : undefined),
            dueDate: income.debtDueDate ? new Date(income.debtDueDate) : undefined,
            date: new Date(income.date),
            description: income.description,
            repayments: repayments.map((r) => ({
              id: r.id,
              amount: r.amount,
              date: new Date(r.date),
              description: r.description,
            })),
          };
        }),
      );

      set({ lentDebts, borrowedDebts, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load debts',
        isLoading: false,
      });
    }
  },

  getActiveDebts: (type?: 'lent' | 'borrowed') => {
    const debts = type === 'lent' ? get().lentDebts : type === 'borrowed' ? get().borrowedDebts : [...get().lentDebts, ...get().borrowedDebts];
    return debts.filter((d) => d.status === 'active');
  },

  getOverdueDebts: (type?: 'lent' | 'borrowed') => {
    const debts = type === 'lent' ? get().lentDebts : type === 'borrowed' ? get().borrowedDebts : [...get().lentDebts, ...get().borrowedDebts];
    return debts.filter((d) => d.status === 'overdue');
  },

  getTotalLentRemaining: () =>
    get().lentDebts.reduce((s, d) => s + d.remainingAmount, 0),

  getTotalBorrowedRemaining: () =>
    get().borrowedDebts.reduce((s, d) => s + d.remainingAmount, 0),

  reset: () =>
    set({ lentDebts: [], borrowedDebts: [], isLoading: false, error: null }),
}));
