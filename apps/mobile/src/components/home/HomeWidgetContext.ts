import type { DebtSummary } from '@budget/shared-types';
import type { UseHomeScreenDataReturn } from '@/hooks/useHomeScreenData';

import type { DashboardReadiness } from '@/features/dashboard/dataReadiness';

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
  /**
   * Which of the dashboard's data sources have actually answered
   * (`useDashboardReadiness`). Widgets whose figure is meaningless without an
   * answer draw a dash instead of a zero when their own domain is not ready.
   *
   * **Optional, and absent means ready.** The phone builds this same context
   * and passes nothing: on native SQLite holds the whole account and works
   * offline, so a missing pull says nothing about whether there is data —
   * drawing dashes there would hide correct figures. See
   * `resolveDashboardReadiness`, which short-circuits on exactly that
   * reasoning.
   */
  readiness?: DashboardReadiness;
}
