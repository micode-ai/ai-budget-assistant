import { defaultCategorySlot } from '../../modules/accounts/default-categories';
import { isDepositCategoryName } from './deposit-category';

/** trim, collapse inner whitespace, lower-case, NFC. */
export function normalizeCategoryName(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Finds a category in `existing` that means the same as `candidate`: equal
 * after normalisation, the same default-list slot in any language (Groceries,
 * Zakupy spożywcze, Продукты), or both are the deposit category. Never a
 * substring test — short names ("Car", "Dom") would misfire. The caller passes
 * only live categories of the right type from the right account.
 */
export function findEquivalentCategory<T extends { id: string; name: string }>(
  candidate: string,
  existing: readonly T[],
): T | null {
  const norm = normalizeCategoryName(candidate);
  if (!norm) return null;
  const slot = defaultCategorySlot(candidate);
  const deposit = isDepositCategoryName(candidate);

  for (const c of existing) {
    if (normalizeCategoryName(c.name) === norm) return c;
  }
  for (const c of existing) {
    if (slot !== null && defaultCategorySlot(c.name) === slot) return c;
    if (deposit && isDepositCategoryName(c.name)) return c;
  }
  return null;
}
