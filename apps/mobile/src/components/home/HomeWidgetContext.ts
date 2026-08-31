import type { DebtSummary } from '@budget/shared-types';
import type { UseHomeScreenDataReturn } from '@/hooks/useHomeScreenData';

/** Shared prop shape passed into every per-widget card under `home/widgets/`. */
export interface HomeWidgetContext {
  widgetVisibility: UseHomeScreenDataReturn['widgetVisibility'];
  monthlyBudgetSummary: UseHomeScreenDataReturn['monthlyBudgetSummary'];
  remaining: number;
  totalBudget: number;
  budgetUsedPercent: number;
  convertedIncomeTotal: number;
  convertedExpenseTotal: number;
  currency: string;
  lentDebts: DebtSummary[];
  borrowedDebts: DebtSummary[];
  convertedLentTotal: number;
  convertedBorrowedTotal: number;
  widgetRefreshKey: number;
  walletSummary: UseHomeScreenDataReturn['walletSummary'];
  canEdit: boolean;
  level: number;
  levelProgress: number;
  currentStreak: number;
  investmentSummary: UseHomeScreenDataReturn['investmentSummary'];
  currentAccountType: UseHomeScreenDataReturn['currentAccountType'];
  rates: Record<string, number>;
  safeToSpendData: UseHomeScreenDataReturn['safeToSpendData'];
  hasSafeToSpend: UseHomeScreenDataReturn['hasSafeToSpend'];
}
