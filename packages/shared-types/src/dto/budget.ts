import type { Currency, BudgetPeriod } from '../entities';

export interface BudgetCategoryAllocationDto {
  categoryId: string;
  amount: number;
}

export interface CreateBudgetDto {
  localId: string;
  name: string;
  amount: number;
  currencyCode: Currency;
  period: BudgetPeriod;
  startDate: string;
  endDate?: string;
  categories?: BudgetCategoryAllocationDto[];
  alertThreshold?: number | null;
}

export interface UpdateBudgetDto {
  name?: string;
  amount?: number;
  currencyCode?: Currency;
  period?: BudgetPeriod;
  endDate?: string | null;
  categories?: BudgetCategoryAllocationDto[];
  alertThreshold?: number | null;
  isActive?: boolean;
}

export interface BudgetHistoryEntry {
  periodStart: string;
  periodEnd: string;
  limit: number;
  actual: number;
  isOverBudget: boolean;
}
