import type { Currency } from '../entities';

export interface CreateIncomeDto {
  localId: string;
  amount: number;
  currencyCode: Currency;
  description?: string;
  notes?: string;
  categoryId?: string;
  date: string;
  tagIds?: string[];
  projectId?: string;
  isDebt?: boolean;
  isDebtRepayment?: boolean;
  debtContactName?: string;
  debtDueDate?: string;
  relatedDebtExpenseId?: string;
}

export interface UpdateIncomeDto {
  amount?: number;
  currencyCode?: Currency;
  description?: string;
  notes?: string;
  categoryId?: string;
  date?: string;
  isDebt?: boolean;
  isDebtRepayment?: boolean;
  debtContactName?: string | null;
  debtDueDate?: string | null;
  relatedDebtExpenseId?: string | null;
}
