import { attributeToCategories, AttributableExpense } from './category-attribution';
import { EXCLUDE_SPLIT_RECEIVABLE } from './expense-filters';

/**
 * Refund netting — the one place the rule "a refund reduces spend" lives.
 *
 * A refund is an `Income` with `refundOfExpenseId` set. Two consequences:
 *  1. It leaves every INCOME total (`EXCLUDE_REFUND_INCOME`) — the money is not
 *     earnings. It stays in the wallet balance: the cash really arrived.
 *  2. It reduces SPEND in the original expense's category, in the REFUND's own
 *     month (closed periods stay stable). With live splits the refund is shared
 *     across them in proportion to the split amounts.
 *
 * Spread the predicate into income `where`s; do not add a second literal.
 */
export const EXCLUDE_REFUND_INCOME = {
  AND: [{ OR: [{ refundOfExpenseId: null }, { refundOfExpense: { isDeleted: true } }] }],
};

/**
 * The matching "this refund nets spend" predicate for `income.findMany`: linked to an
 * original expense that is still live. A refund whose original was soft-deleted is
 * NOT netted from spend and, by `EXCLUDE_REFUND_INCOME`, counts as ordinary income again.
 * Keep the two defined together so no money disappears from both sides.
 */
export const NETTING_REFUND_WHERE = {
  refundOfExpenseId: { not: null },
  refundOfExpense: { isDeleted: false },
} as const;

export interface RefundRow {
  amount: unknown;
  date?: Date;
  currencyCode?: string;
  refundOfExpense?: AttributableExpense | null;
}

export interface RefundPart {
  categoryId?: string;
  categoryName: string;
  amount: number;
}

/** Spreads one refund over the categories its original expense was filed under. */
export function attributeRefund(refund: RefundRow): RefundPart[] {
  const amount = Number(refund.amount) || 0;
  const original = refund.refundOfExpense;
  if (!original || amount <= 0) return [];
  const parts = attributeToCategories(original);
  const total = parts.reduce((s, p) => s + p.amount, 0);
  if (parts.length === 1 || total <= 0) {
    return [{ categoryId: parts[0].categoryId, categoryName: parts[0].categoryName, amount }];
  }
  return parts.map((p) => ({
    categoryId: p.categoryId,
    categoryName: p.categoryName,
    amount: (amount * p.amount) / total,
  }));
}

/** Total refunded money, optionally limited to a category set (budget scope). */
export function sumRefunds(refunds: readonly RefundRow[], categorySet?: ReadonlySet<string>): number {
  let sum = 0;
  for (const r of refunds) {
    for (const part of attributeRefund(r)) {
      if (categorySet && (!part.categoryId || !categorySet.has(part.categoryId))) continue;
      sum += part.amount;
    }
  }
  return sum;
}

/** `spent - refunded`, never below zero (a refund larger than the period's spend is not negative spend). */
export function netOfRefunds(spent: number, refunded: number): number {
  return Math.max(0, Math.round((spent - refunded) * 100) / 100);
}

type RefundDb = {
  income: { findMany: (args: any) => Promise<any[]> };
};

/** Live refunds dated inside [from, to] (inclusive), with the original's category data. */
export async function loadRefundsInRange(
  db: RefundDb,
  accountId: string,
  range: { gte: Date; lte?: Date; lt?: Date },
  currencyCode?: string,
): Promise<RefundRow[]> {
  return db.income.findMany({
    where: {
      accountId,
      isDeleted: false,
      ...EXCLUDE_SPLIT_RECEIVABLE,
      ...NETTING_REFUND_WHERE,
      date: range,
      ...(currencyCode ? { currencyCode } : {}),
    },
    select: {
      amount: true,
      date: true,
      currencyCode: true,
      refundOfExpense: {
        select: {
          amount: true,
          categoryId: true,
          category: { select: { id: true, name: true } },
          categorySplits: {
            where: { isDeleted: false },
            select: { categoryId: true, amount: true, category: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });
}

/**
 * Total refunded (one currency) against expenses matching `expenseWhere`, dated in
 * [from, to]. The original must be live. Used by per-merchant spend (merchant caps).
 */
export async function sumRefundsForExpenses(
  db: { income: { aggregate: (args: any) => Promise<any> } },
  accountId: string,
  expenseWhere: Record<string, unknown>,
  range: { gte: Date; lte: Date },
  currencyCode: string,
): Promise<number> {
  const agg = await db.income.aggregate({
    where: {
      accountId,
      isDeleted: false,
      ...EXCLUDE_SPLIT_RECEIVABLE,
      currencyCode,
      date: range,
      refundOfExpenseId: { not: null },
      refundOfExpense: { ...expenseWhere, isDeleted: false },
    },
    _sum: { amount: true },
  });
  return Number(agg?._sum?.amount ?? 0);
}
