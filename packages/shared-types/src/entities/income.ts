import type { Currency, SyncStatus } from './primitives';
import type { IncomeTag } from './tag';

export interface Income {
  id: string;
  localId: string;
  serverId?: string;
  userId: string;
  accountId: string;
  amount: number;
  currencyCode: Currency;
  description?: string;
  notes?: string;
  categoryId?: string;
  date: Date;
  externalRef?: string;
  tags?: IncomeTag[];
  tagIds?: string[];
  projectId?: string;
  isDebt: boolean;
  isDebtRepayment: boolean;
  debtContactName?: string;
  debtDueDate?: Date;
  relatedDebtExpenseId?: string;
  createdByUserName?: string | null;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}
