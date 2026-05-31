import type { Currency, BudgetPeriod, SyncStatus } from './primitives';

export interface BudgetCategoryAllocation {
  id: string;
  budgetId: string;
  categoryId: string;
  amount: number;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncVersion: number;
}

export interface BudgetCategoryProgress {
  categoryId: string;
  categoryName: string;
  categoryColor?: string;
  allocated: number;
  spent: number;
  remaining: number;
  percentageUsed: number;
  isOverBudget: boolean;
}

export interface Budget {
  id: string;
  localId: string;
  serverId?: string;
  /** Server-side copy of the mobile device's local ID. Present on API responses. */
  clientId?: string | null;
  userId: string;
  accountId: string;
  name: string;
  amount: number;
  currencyCode: Currency;
  period: BudgetPeriod;
  startDate: Date;
  endDate?: Date;
  categoryAllocations?: BudgetCategoryAllocation[];
  alertThreshold: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}

export interface BudgetProgress {
  budget: Budget;
  spent: number;
  remaining: number;
  percentageUsed: number;
  isOverBudget: boolean;
  daysRemaining: number;
  projectedTotal: number;
  dailyBurnRate: number;
  estimatedExhaustionDate?: Date;
  categoryBreakdown?: BudgetCategoryProgress[];
}

export interface SpendingAnomaly {
  categoryId: string;
  categoryName: string;
  currentAmount: number;
  averageAmount: number;
  percentageChange: number;
  period: string;
}

export interface BudgetPrediction {
  budgetId: string;
  budgetName: string;
  estimatedExhaustionDate?: Date;
  dailyBurnRate: number;
  daysRemaining: number;
  projectedTotal: number;
  currencyCode: string;
}
