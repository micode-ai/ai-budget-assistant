import type { Prisma } from '@prisma/client';
import type { PublicExpense, PublicExpenseItem, PublicLocation } from '../dto/public-expense.dto';
import { EXPENSE_TIER1_ENCRYPTED_FIELDS } from '../public-encryption-fields';

type Decimal = Prisma.Decimal;

/**
 * What the mapper reads: exactly the columns `PUBLIC_EXPENSE_SELECT` / `PUBLIC_EXPENSE_DETAIL_SELECT`
 * (public-expenses.query.ts) select, plus `hasReceipt`, which is computed by a separate
 * `receiptImage IS NOT NULL` query so the bytes are never loaded.
 *
 * Relations arrive pre-filtered by the select (`isDeleted: false` on the link AND the target).
 */
export interface PublicExpenseRow {
  id: string;
  userId: string;
  amount: Decimal;
  currencyCode: string;
  date: Date;
  time: string | null;
  categoryId: string | null;
  description: string | null;
  merchant: string | null;
  notes: string | null;
  locationLat: Decimal | null;
  locationLng: Decimal | null;
  locationName: string | null;
  discountAmount: Decimal | null;
  depositAmount: Decimal | null;
  isDebt: boolean;
  isDebtRepayment: boolean;
  isSplitReceivable: boolean;
  isRecurring: boolean;
  source: string;
  createdAt: Date;
  updatedAt: Date;
  user: { name: string };
  createdByOAuthClient: { clientId: string; name: string } | null;
  expenseTags: Array<{ tag: { id: string; name: string } }>;
  projectExpenses: Array<{ project: { id: string; name: string } }>;
  categorySplits: Array<{ categoryId: string; amount: Decimal }>;
  /** Present only when selected with `PUBLIC_EXPENSE_DETAIL_SELECT`. */
  items?: Array<{
    id: string;
    description: string;
    quantity: Decimal;
    unitPrice: Decimal;
    totalPrice: Decimal;
    lineDiscount: Decimal;
    categoryId: string | null;
  }>;
  hasReceipt: boolean;
}

/**
 * `encrypted_fields` at `encryptionTier = 1`, by PUBLIC name — derived from `PUBLIC_TIER1_FIELDS`
 * (an API-local copy of `ENCRYPTION_FIELDS` tier 1, Ruling 15). At tier 1 every one of them is
 * `null` and all are listed, whether or not this row's column held a value.
 */
export const TIER1_ENCRYPTED_FIELDS = EXPENSE_TIER1_ENCRYPTED_FIELDS;

export interface ToPublicExpenseOptions {
  /** `req.oauth.encryptionTier` (0 or 1; the guard refuses >= 2). */
  encryptionTier: number;
  /** Detail and changes feed: true. List: false (the `items` key is then absent). */
  includeItems: boolean;
}

const money = (d: Decimal): string => d.toFixed(2);
const moneyOrNull = (d: Decimal | null): string | null => (d === null ? null : money(d));
const dateOnly = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * The one place an `Expense` row becomes a `PublicExpense`. Every field is copied by name — never a
 * spread of the row — so an internal column (`clientId`, `encryptedPayload`, `syncVersion`,
 * `receiptFingerprint`, `externalRef`, group-ledger fields) can never reach an integrator.
 * Amounts stay in the expense's own currency; nothing is converted.
 */
export function toPublicExpense(row: PublicExpenseRow, opts: ToPublicExpenseOptions): PublicExpense {
  const encrypted = opts.encryptionTier >= 1;
  const text = (v: string | null): string | null => (encrypted ? null : v);

  const out: PublicExpense = {
    id: row.id,
    amount: money(row.amount),
    currency: row.currencyCode,
    date: dateOnly(row.date),
    time: row.time ?? null,
    category_id: row.categoryId,
    description: text(row.description),
    merchant: text(row.merchant),
    notes: text(row.notes),
    location: toLocation(row, encrypted),
    tags: row.expenseTags.map(({ tag }) => ({ id: tag.id, name: text(tag.name) })),
    project: row.projectExpenses[0] ? { id: row.projectExpenses[0].project.id, name: text(row.projectExpenses[0].project.name) } : null,
    category_splits: row.categorySplits.map((s) => ({ category_id: s.categoryId, amount: money(s.amount) })),
    discount_amount: moneyOrNull(row.discountAmount),
    deposit_amount: moneyOrNull(row.depositAmount),
    is_debt: row.isDebt,
    is_debt_repayment: row.isDebtRepayment,
    is_split_receivable: row.isSplitReceivable,
    is_recurring: row.isRecurring,
    source: row.source,
    created_by_app: row.createdByOAuthClient ? { id: row.createdByOAuthClient.clientId, name: row.createdByOAuthClient.name } : null,
    created_by_user: { id: row.userId, name: row.user.name },
    has_receipt: row.hasReceipt,
    encrypted_fields: encrypted ? [...TIER1_ENCRYPTED_FIELDS] : [],
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };

  if (opts.includeItems) {
    // Inserted before the flags so the JSON reads in the documented order.
    return insertItems(out, (row.items ?? []).map((i) => toPublicItem(i, encrypted)));
  }
  return out;
}

function toPublicItem(i: NonNullable<PublicExpenseRow['items']>[number], encrypted: boolean): PublicExpenseItem {
  return {
    id: i.id,
    description: encrypted ? null : i.description,
    quantity: i.quantity.toFixed(3),
    unit_price: money(i.unitPrice),
    total_price: money(i.totalPrice),
    line_discount: money(i.lineDiscount),
    category_id: i.categoryId,
  };
}

/**
 * `null` without coordinates, and for `(0,0)` — the app's "no location" value everywhere (it is
 * what an undecryptable E2EE row's zeroed coordinates read as).
 */
function toLocation(row: PublicExpenseRow, encrypted: boolean): PublicLocation | null {
  if (row.locationLat === null || row.locationLng === null) return null;
  const lat = row.locationLat.toNumber();
  const lng = row.locationLng.toNumber();
  if (lat === 0 && lng === 0) return null;
  return { lat, lng, name: encrypted ? null : row.locationName };
}

function insertItems(out: PublicExpense, items: PublicExpenseItem[]): PublicExpense {
  const ordered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(out)) {
    if (k === 'discount_amount') ordered.items = items;
    ordered[k] = v;
  }
  return ordered as unknown as PublicExpense;
}
