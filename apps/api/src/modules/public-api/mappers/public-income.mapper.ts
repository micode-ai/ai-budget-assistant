import type { Prisma } from '@prisma/client';
import type { PublicIncome } from '../dto/public-income.dto';
import { INCOME_TIER1_ENCRYPTED_FIELDS } from '../public-encryption-fields';

type Decimal = Prisma.Decimal;

/**
 * What the mapper reads: exactly the columns `PUBLIC_INCOME_SELECT` (public-incomes.query.ts) selects.
 * Relations arrive pre-filtered by the select (`isDeleted: false` on the link AND the target).
 */
export interface PublicIncomeRow {
  id: string;
  amount: Decimal;
  currencyCode: string;
  date: Date;
  description: string | null;
  notes: string | null;
  source: string;
  isDebt: boolean;
  isDebtRepayment: boolean;
  isSplitReceivable: boolean;
  createdAt: Date;
  updatedAt: Date;
  category: { id: string; name: string } | null;
  /** A transfer's income leg has exactly one; any value means `is_transfer`. */
  linkedTransfer: { id: string } | null;
  createdByOAuthClient: { clientId: string; name: string } | null;
  incomeTags: Array<{ tag: { id: string; name: string } }>;
  projectIncomes: Array<{ project: { id: string; name: string } }>;
}

export interface ToPublicIncomeOptions {
  /** `req.oauth.encryptionTier` (0 or 1; the guard refuses >= 2). */
  encryptionTier: number;
}

/**
 * The one place an `Income` row becomes a `PublicIncome`. Every field is copied by name, never a
 * spread of the row, so an internal column (`clientId`, `encryptedPayload`, `externalRef`,
 * `debtContactName`, ...) can never reach an integrator. At tier 1 the text fields and the
 * category/tag/project names are `null` and all are listed in `encrypted_fields`.
 */
export function toPublicIncome(row: PublicIncomeRow, opts: ToPublicIncomeOptions): PublicIncome {
  const encrypted = opts.encryptionTier >= 1;
  const text = (v: string | null): string | null => (encrypted ? null : v);
  const project = row.projectIncomes[0]?.project;

  return {
    id: row.id,
    amount: row.amount.toFixed(2),
    currency: row.currencyCode,
    date: row.date.toISOString().slice(0, 10),
    description: text(row.description),
    notes: text(row.notes),
    category: row.category ? { id: row.category.id, name: text(row.category.name) } : null,
    tags: row.incomeTags.map(({ tag }) => ({ id: tag.id, name: text(tag.name) })),
    project: project ? { id: project.id, name: text(project.name) } : null,
    source: row.source,
    is_debt: row.isDebt,
    is_debt_repayment: row.isDebtRepayment,
    is_split_receivable: row.isSplitReceivable,
    is_transfer: row.linkedTransfer !== null,
    created_by_app: row.createdByOAuthClient
      ? { id: row.createdByOAuthClient.clientId, name: row.createdByOAuthClient.name }
      : null,
    encrypted_fields: encrypted ? [...INCOME_TIER1_ENCRYPTED_FIELDS] : [],
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
