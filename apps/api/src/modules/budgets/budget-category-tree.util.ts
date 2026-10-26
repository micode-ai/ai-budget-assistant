import type { PrismaService } from '../../database/prisma.service';
import type { TreeCategory } from '../../common/utils/category-tree';

export interface BudgetTreeCategory extends TreeCategory {
  name: string;
  color?: string | null;
}

/**
 * The account's expense categories as tree rows (`id, parentId, isDeleted,
 * name, color`). Shared by `BudgetsService` and `BudgetAlertService` so both
 * roll a parent allocation up over the same CURRENT tree.
 */
export async function loadExpenseCategoryTree(
  prisma: Pick<PrismaService, 'category'>,
  accountId: string,
): Promise<BudgetTreeCategory[]> {
  const rows = await prisma.category.findMany({
    where: { accountId, type: 'expense' },
    select: { id: true, parentId: true, isDeleted: true, name: true, color: true },
  });
  return rows ?? [];
}
