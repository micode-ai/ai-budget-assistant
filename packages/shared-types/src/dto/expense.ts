import type { Currency, ExpenseSource } from '../entities';

export interface CreateExpenseDto {
  localId: string;
  amount: number;
  discountAmount?: number;
  currencyCode: Currency;
  description?: string;
  notes?: string;
  categoryId?: string;
  date: string;
  time?: string;
  location?: {
    lat: number;
    lng: number;
    name?: string;
  };
  source: ExpenseSource;
  tagIds?: string[];
  projectId?: string;
  isDebt?: boolean;
  isDebtRepayment?: boolean;
  debtContactName?: string;
  debtDueDate?: string;
  relatedDebtIncomeId?: string;
}

export interface UpdateExpenseDto {
  amount?: number;
  discountAmount?: number;
  currencyCode?: Currency;
  description?: string;
  notes?: string;
  categoryId?: string;
  date?: string;
  time?: string;
  location?: {
    lat: number;
    lng: number;
    name?: string;
  } | null;
  tagIds?: string[];
  projectId?: string | null;
  isDebt?: boolean;
  isDebtRepayment?: boolean;
  debtContactName?: string | null;
  debtDueDate?: string | null;
  relatedDebtIncomeId?: string | null;
}

export interface MergeExpensesFieldChoices {
  merchant?: boolean;
  notes?: boolean;
  categoryId?: boolean;
  projectId?: boolean;
  tagIds?: boolean;
  receiptImage?: boolean;
}

export interface MergeExpensesDto {
  keepId: string;
  mergeId: string;
  fieldChoices?: MergeExpensesFieldChoices;
}

export interface MergeExpensesResponse {
  keptId: string;
  mergedId: string;
}

export interface CreateExpenseCategorySplitDto {
  categoryId: string;
  amount: number;
  percentage: number;
  notes?: string;
}

export interface SetExpenseSplitsDto {
  splits: CreateExpenseCategorySplitDto[];
}

export interface SplitSuggestionResponse {
  shouldSplit: boolean;
  confidence: number;
  suggestedSplits?: Array<{
    categoryId?: string;
    categoryName: string;
    amount: number;
    percentage: number;
    reasoning: string;
  }>;
}
