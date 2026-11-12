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
  /** Child costs: set when this income is the 800+ benefit for that child (server PK). */
  childBenefitChildId?: string | null;
  createdByUserName?: string | null;
  /**
   * The public-API OAuth app that created this income (public client id as `id` + display name, like `Expense.createdByApp`), or null.
   * Server-owned: arrives on pull, never part of any create/update/sync payload.
   */
  createdByApp?: { id: string; name: string } | null;
  /**
   * True when the money is accounted for by another row, so the income is
   * excluded from every income total — the mirror of `Expense.isSplitReceivable`
   * (shared-groups phase 2, task H1). Server-owned: it arrives on the pull and
   * is never pushed. Nothing sets it yet.
   *
   * Treat absent as false: filter with `!i.isSplitReceivable`, never with
   * `i.isSplitReceivable === false`. Never exclude by `isDebt` instead.
   */
  isSplitReceivable?: boolean;
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
