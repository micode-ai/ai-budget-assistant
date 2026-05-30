import type { Currency, SyncStatus, ExpenseSource, RecurringPeriod } from './primitives';
import type { Category } from './category';
import type { ExpenseTag } from './tag';

export interface ExpenseItem {
  id: string;
  localId: string;
  expenseId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}

export interface ExpenseCategorySplit {
  id: string;
  expenseId: string;
  categoryId: string;
  category?: Category;
  amount: number;
  percentage: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncVersion: number;
}

export interface Expense {
  id: string;
  localId: string;
  serverId?: string;
  userId: string;
  accountId: string;
  amount: number;
  discountAmount?: number;
  currencyCode: Currency;
  description?: string;
  notes?: string;
  merchant?: string;
  categoryId?: string;
  date: Date;
  time?: string;
  location?: {
    lat: number;
    lng: number;
    name?: string;
  };
  receiptUrl?: string;
  isRecurring: boolean;
  recurringId?: string;
  recurringPeriod?: RecurringPeriod;
  source: ExpenseSource;
  externalRef?: string;
  items?: ExpenseItem[];
  receiptImageBase64?: string;
  tags?: ExpenseTag[];
  tagIds?: string[];
  categorySplits?: ExpenseCategorySplit[];
  projectId?: string;
  isDebt: boolean;
  isDebtRepayment: boolean;
  debtContactName?: string;
  debtDueDate?: Date;
  relatedDebtIncomeId?: string;
  createdByUserName?: string | null;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}
