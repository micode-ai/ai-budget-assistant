import type { Prisma, PrismaClient } from '@prisma/client';
import { touchExpenses } from '../expenses/expense-touch.util';

type Db = PrismaClient | Prisma.TransactionClient;

export interface ApplyResult {
  attributed: number;
  released: number;
}

/**
 * A child's category rule (ABA-802): every live expense whose own category is
 * one of `Child.categoryIds` belongs to that child.
 *
 * The rule is materialised as `ExpenseChild` rows with `source = 'category'`,
 * so totals, statements, coverage and the device's sync all read it unchanged.
 * Idempotent; safe to call after any expense write and from a daily cron:
 *
 * - **Releases** a rule link whose expense left the category, was deleted,
 *   became planned, or whose child no longer claims the category.
 * - **Attributes** an expense in a claimed category, unless a person already
 *   decided about it: any `source = null` link (live or soft-deleted — a removal
 *   is a decision too) or any receipt line assigned to a child.
 * - Two children claiming one category share each expense equally.
 * - Only the expense's own category: a category that is one split of a mixed
 *   receipt would hand the whole amount to the child, so splits are skipped.
 *
 * Touched expenses are bumped so devices pull the links.
 */
export async function applyChildCategoryRules(db: Db, accountId: string): Promise<ApplyResult> {
  const children = await db.child.findMany({
    where: { accountId, isDeleted: false, archivedAt: null, NOT: { categoryIds: { isEmpty: true } } },
    select: { id: true, categoryIds: true },
  });
  const childrenByCategory = new Map<string, string[]>();
  for (const c of children) {
    for (const cat of c.categoryIds) childrenByCategory.set(cat, [...(childrenByCategory.get(cat) ?? []), c.id]);
  }

  const touched = new Set<string>();

  // 1. Release rule links that no longer hold.
  const ruleLinks = await db.expenseChild.findMany({
    where: { source: 'category', isDeleted: false, child: { accountId } },
    select: {
      id: true,
      childId: true,
      expenseId: true,
      expense: { select: { categoryId: true, isDeleted: true, isPlanned: true } },
    },
  });
  const stale = ruleLinks.filter((l) => {
    if (l.expense.isDeleted || l.expense.isPlanned || !l.expense.categoryId) return true;
    return !(childrenByCategory.get(l.expense.categoryId) ?? []).includes(l.childId);
  });
  if (stale.length > 0) {
    await db.expenseChild.updateMany({
      where: { id: { in: stale.map((l) => l.id) } },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });
    for (const l of stale) touched.add(l.expenseId);
  }

  // 2. Attribute expenses in claimed categories that nobody decided about.
  let attributed = 0;
  if (childrenByCategory.size > 0) {
    const expenses = await db.expense.findMany({
      where: {
        accountId,
        isDeleted: false,
        isPlanned: false,
        isSplitReceivable: false,
        categoryId: { in: [...childrenByCategory.keys()] },
        expenseChildren: { none: { source: null } },
        items: { none: { childId: { not: null }, isDeleted: false } },
      },
      select: {
        id: true,
        categoryId: true,
        expenseChildren: { where: { isDeleted: false }, select: { childId: true } },
      },
    });
    for (const e of expenses) {
      const want = childrenByCategory.get(e.categoryId!) ?? [];
      const have = new Set(e.expenseChildren.map((l) => l.childId));
      if (want.length === have.size && want.every((id) => have.has(id))) continue;
      const share = Math.floor(10000 / want.length) / 10000;
      for (let i = 0; i < want.length; i++) {
        // Equal shares at 4 decimals summing to exactly 1, the remainder on the first (the app's rule).
        const s = i === 0 ? Math.round((1 - share * (want.length - 1)) * 10000) / 10000 : share;
        await db.expenseChild.upsert({
          where: { expenseId_childId: { expenseId: e.id, childId: want[i] } },
          create: { expenseId: e.id, childId: want[i], share: s, source: 'category' },
          update: { share: s, isDeleted: false, source: 'category', syncVersion: { increment: 1 } },
        });
      }
      touched.add(e.id);
      attributed++;
    }
  }

  if (touched.size > 0) await touchExpenses(db, accountId, { id: { in: [...touched] } });
  return { attributed, released: stale.length };
}
