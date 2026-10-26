import type { Category } from '@budget/shared-types';
import { isDepositCategoryName } from '@budget/shared-utils';

/** True when at least one live category names `categoryId` as its parent. */
export function hasLiveChildren(categories: Category[], categoryId: string): boolean {
  return categories.some((c) => !c.isDeleted && c.parentId === categoryId);
}

/**
 * Categories the edited one may be filed under: live, top-level, expense, not
 * itself and not the deposit category. Empty when the hierarchy does not apply
 * to it at all - an income, a deposit, or a category that already has children
 * (the tree is two levels deep, so a parent cannot get a parent).
 */
export function eligibleParents(
  categories: Category[],
  editing: Pick<Category, 'id' | 'name'> | null,
  type: 'expense' | 'income',
): Category[] {
  if (type !== 'expense') return [];
  if (editing && (hasLiveChildren(categories, editing.id) || isDepositCategoryName(editing.name))) {
    return [];
  }
  return categories.filter(
    (c) =>
      !c.isDeleted &&
      c.type === 'expense' &&
      !c.parentId &&
      c.id !== editing?.id &&
      !isDepositCategoryName(c.name),
  );
}
