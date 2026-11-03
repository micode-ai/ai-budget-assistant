import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';

/**
 * THE one definition of "a category the public API exposes": live, owned by this account, an
 * expense or income category (`type`, default expense). `GET /public/v1/categories` lists exactly these, and an expense write accepts
 * exactly these as `category_id` — both read this predicate, so they cannot drift (Ruling 19).
 *
 * Why account-owned only: the write goes through `ExpensesService`, whose resolver
 * (`resolveExpenseCategoryId`) accepts only a category whose `accountId` is this account. A global
 * system row (`accountId = null`) would be stored as "no category" without a word, so it must
 * not be listed either.
 */
export type PublicCategoryType = 'expense' | 'income';

export function publicCategoryWhere(accountId: string, type: PublicCategoryType = 'expense') {
  return { accountId, type, isDeleted: false } satisfies Prisma.CategoryWhereInput;
}

export const PUBLIC_CATEGORY_SELECT = {
  id: true,
  name: true,
  parentId: true,
  icon: true,
  color: true,
  type: true,
} satisfies Prisma.CategorySelect;

export function listPublicCategories(prisma: PrismaService, accountId: string, type: PublicCategoryType = 'expense') {
  return prisma.category.findMany({
    where: publicCategoryWhere(accountId, type),
    select: PUBLIC_CATEGORY_SELECT,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
}

/** Whether `categoryId` is one of the categories `listPublicCategories` returns. */
export async function isPublicCategory(
  prisma: PrismaService,
  accountId: string,
  categoryId: string,
  type: PublicCategoryType = 'expense',
): Promise<boolean> {
  const row = await prisma.category.findFirst({
    where: { id: categoryId, ...publicCategoryWhere(accountId, type) },
    select: { id: true },
  });
  return row !== null;
}
