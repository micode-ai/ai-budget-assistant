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
  /** Server-side copy of the mobile device's local ID (clientId column in DB). Present on API responses. */
  clientId?: string | null;
  userId: string;
  accountId: string;
  amount: number;
  discountAmount?: number;
  currencyCode: Currency;
  description?: string;
  notes?: string;
  merchant?: string;
  categoryId?: string;
  /** Populated category object returned by the API (in addition to categoryId). */
  category?: Category | null;
  date: Date;
  time?: string;
  location?: {
    lat: number;
    lng: number;
    name?: string;
  };
  /** Separate lat column as returned by the API (server uses locationLat/locationLng, not a location object). */
  locationLat?: number | null;
  /** Separate lng column as returned by the API. */
  locationLng?: number | null;
  receiptUrl?: string;
  isRecurring: boolean;
  recurringId?: string;
  recurringPeriod?: RecurringPeriod;
  source: ExpenseSource;
  externalRef?: string;
  items?: ExpenseItem[];
  receiptImageBase64?: string;
  tags?: ExpenseTag[];
  /** Prisma relation name used in API responses (alias for tags). */
  expenseTags?: ExpenseTag[];
  tagIds?: string[];
  categorySplits?: ExpenseCategorySplit[];
  projectId?: string;
  /** Project join-table entries as returned by the API. */
  projectExpenses?: Array<{
    id: string;
    projectId?: string;
    project?: {
      id: string;
      accountId: string;
      clientId?: string | null;
      name: string;
      description?: string | null;
      color?: string | null;
      icon?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      budget?: number | null;
      currencyCode?: string | null;
      isArchived?: boolean;
      createdAt?: string;
      updatedAt?: string;
      isDeleted?: boolean;
      syncVersion?: number;
    } | null;
    isDeleted?: boolean;
    syncVersion?: number;
    createdAt?: string;
    updatedAt?: string;
  }>;
  isDebt: boolean;
  isDebtRepayment: boolean;
  debtContactName?: string;
  debtDueDate?: Date;
  relatedDebtIncomeId?: string;
  createdByUserName?: string | null;
  isPlanned?: boolean;
  /** E2EE encrypted payload field (present on API responses when encryption is enabled). */
  encryptedPayload?: string | null;
  /** E2EE key version field. */
  encryptionKeyVersion?: string | null;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}
