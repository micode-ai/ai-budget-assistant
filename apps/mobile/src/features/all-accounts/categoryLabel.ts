import type { AllAccountsCategoryRow } from '@budget/shared-types';
import { displayCategoryName } from '@/utils/categoryDisplayName';

/** Row name for a merged category: catalog name for system keys, localized "Other" for the overflow bucket. */
export function categoryRowName(row: AllAccountsCategoryRow, other: string, type: 'expense' | 'income'): string {
  if (row.key.endsWith('__other')) return other;
  if (row.systemKey) return displayCategoryName({ name: row.name, systemKey: row.systemKey, type }) || row.name;
  return row.name;
}
