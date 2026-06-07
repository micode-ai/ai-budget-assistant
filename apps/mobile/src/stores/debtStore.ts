import { create } from 'zustand';
import { Platform } from 'react-native';
import type { DebtSummary, DebtStatus, Expense, Income } from '@budget/shared-types';
import { loadDebtExpenses, loadRepaymentExpensesForIncome } from '@/db/expenseRepository';
import { loadDebtIncomes, loadRepaymentIncomesForExpense } from '@/db/incomeRepository';
import { useAccountStore } from './accountStore';
import { useExpenseStore } from './expenseStore';
import { useIncomeStore } from './incomeStore';

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

      // Web has no real SQLite — the debt repository queries return []. Derive
      // debts from the in-memory expense/income stores (which the expense/income
      // stores populated from the server). Native keeps the SQLite path.
      const isWeb = Platform.OS === 'web';
      const memExpenses = isWeb ? useExpenseStore.getState().expenses : [];
      const memIncomes = isWeb ? useIncomeStore.getState().incomes : [];

      const getDebtExpenses = (): Promise<Expense[]> =>
        isWeb
          ? Promise.resolve(memExpenses.filter((e) => !e.isDeleted && e.isDebt))
          : loadDebtExpenses(accountId);
      const getDebtIncomes = (): Promise<Income[]> =>
        isWeb
          ? Promise.resolve(memIncomes.filter((i) => !i.isDeleted && i.isDebt))
          : loadDebtIncomes(accountId);
      const getRepaymentIncomesForExpense = (expenseId: string): Promise<Income[]> =>
        isWeb
          ? Promise.resolve(
              memIncomes.filter(
                (i) => !i.isDeleted && i.isDebtRepayment && i.relatedDebtExpenseId === expenseId,
              ),
            )
          : loadRepaymentIncomesForExpense(expenseId);
      const getRepaymentExpensesForIncome = (incomeId: string): Promise<Expense[]> =>
        isWeb
          ? Promise.resolve(
              memExpenses.filter(
                (e) => !e.isDeleted && e.isDebtRepayment && e.relatedDebtIncomeId === incomeId,
              ),
            )
          : loadRepaymentExpensesForIncome(incomeId);

      const [debtExpenses, debtIncomes] = await Promise.all([
        getDebtExpenses(),
        getDebtIncomes(),
      ]);

      // Compute lent summaries (expenses where isDebt=true)
      const lentDebts: DebtSummary[] = await Promise.all(
        debtExpenses.map(async (expense) => {
          const repayments = await getRepaymentIncomesForExpense(expense.id);
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
          const repayments = await getRepaymentExpensesForIncome(income.id);
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
