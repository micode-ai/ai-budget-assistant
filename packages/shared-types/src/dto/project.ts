import type { Currency } from '../entities';

export interface CreateProjectDto {
  localId: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  currencyCode?: Currency;
}

export interface UpdateProjectDto {
  name?: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  budget?: number | null;
  currencyCode?: Currency | null;
  isArchived?: boolean;
}

export interface ProjectAnalyticsResponse {
  projectId: string;
  projectName: string;
  totalExpenses: number;
  totalIncome: number;
  netAmount: number;
  expenseCount: number;
  incomeCount: number;
  budgetRemaining?: number;
  expensesByCategory: Array<{
    categoryId: string;
    categoryName: string;
    amount: number;
    percentage: number;
  }>;
  timeline: Array<{
    date: string;
    expenses: number;
    income: number;
  }>;
}
