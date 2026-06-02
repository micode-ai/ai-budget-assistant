import type { Currency, IncomeSource, SyncStatus } from './primitives';
import type { Category } from './category';
import type { IncomeTag } from './tag';

export interface Income {
  id: string;
  localId: string;
  serverId?: string;
  /** Server-side copy of the mobile device's local ID (clientId column in DB). Present on API responses. */
  clientId?: string | null;
  userId: string;
  accountId: string;
  amount: number;
  currencyCode: Currency;
  description?: string;
  notes?: string;
  categoryId?: string;
  /** Populated category object returned by the API (in addition to categoryId). */
  category?: Category | null;
  date: Date;
  source: IncomeSource;
  externalRef?: string;
  tags?: IncomeTag[];
  /** Prisma relation name used in API responses (alias for tags). */
  incomeTags?: IncomeTag[];
  tagIds?: string[];
  projectId?: string;
  isDebt: boolean;
  isDebtRepayment: boolean;
  debtContactName?: string;
  debtDueDate?: Date;
  relatedDebtExpenseId?: string;
  createdByUserName?: string | null;
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
