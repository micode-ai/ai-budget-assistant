import { matchKeyedCategory, normalizeCategoryName } from './category-key.util';

export { normalizeCategoryName };
import { isDepositCategoryName } from './deposit-category';

/**
 * Finds a category in `existing` that means the same as `candidate`: the same
 * catalog key in any language (Groceries, Zakupy spożywcze, Продукты), equal
 * after normalisation, or both are the deposit category. Never a substring
 * test. A thin wrapper over the keyed matcher for callers that hold a
 * type-scoped list; the caller passes only live categories of the right type
 * from the right account.
 */
export function findEquivalentCategory<T extends { id: string; name: string; systemKey?: string | null }>(
  candidate: string,
  existing: readonly T[],
): T | null {
  if (!normalizeCategoryName(candidate)) return null;
  const hit =
    matchKeyedCategory(candidate, 'expense', existing) ?? matchKeyedCategory(candidate, 'income', existing);
  if (hit) return hit;
  if (isDepositCategoryName(candidate)) {
    for (const c of existing) if (isDepositCategoryName(c.name)) return c;
  }
  return null;
}
