import { useAccountStore } from '@/stores/accountStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useWalletStore } from '@/stores/walletStore';
import { useBudgetStore } from '@/stores/budgetStore';

/** The forced push + pull behind Settings → Data "Sync now" and the pending-sync chip. */
export async function runManualSync(): Promise<void> {
  await Promise.allSettled([
    // Refresh the account list from the server too — otherwise an account
    // joined server-side has no manual way to appear (the list is local-first).
    useAccountStore.getState().loadAccountsFromServer(),
    useExpenseStore.getState().loadExpenses({ force: true }),
    useIncomeStore.getState().loadIncomes({ force: true }),
    useCategoryStore.getState().loadCategories(),
    useWalletStore.getState().loadWallet(),
    useBudgetStore.getState().loadBudgets(),
  ]);
}
