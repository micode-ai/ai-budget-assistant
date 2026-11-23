import type { AccountRole, AccountType } from '../entities/primitives';

export interface AllAccountsMoney {
  spent: number;
  income: number;
  net: number;
}

export interface AllAccountsAccountRow extends AllAccountsMoney {
  id: string;
  name: string;
  type: AccountType;
  role: AccountRole;
  included: boolean;
  encrypted: boolean;
  /** type shared|trip or more than one member */
  shared: boolean;
  /** null when not included / encrypted */
  prevSpent: number | null;
  prevIncome: number | null;
}

export interface AllAccountsMonth {
  month: string;
  perAccount: Record<string, { spent: number; income: number }>;
}

export interface AllAccountsCategoryRow {
  key: string;
  name: string;
  systemKey: string | null;
  total: number;
  perAccount: Record<string, number>;
}

export interface AllAccountsAnalyticsResponse {
  currencyCode: string;
  start: string;
  end: string;
  groupId: string | null;
  fxApproximate: boolean;
  computedAt: string;
  totals: AllAccountsMoney;
  accounts: AllAccountsAccountRow[];
  months: AllAccountsMonth[];
  expenseCategories: AllAccountsCategoryRow[];
  incomeCategories: AllAccountsCategoryRow[];
}

export interface AccountGroupDto {
  id: string;
  name: string;
  accountIds: string[];
}

export interface UpsertAccountGroupDto {
  name: string;
  accountIds: string[];
}

export interface ConsolidatedReportRequest {
  format: 'csv' | 'pdf' | 'excel';
  startDate: string;
  endDate: string;
  includeIncomes?: boolean;
  includeExpenses?: boolean;
  locale?: string;
  exclude?: string[];
  groupId?: string;
}
