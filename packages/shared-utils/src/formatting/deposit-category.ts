/**
 * The returnable-packaging deposit category ("kaucja", "Pfand", ...) - name
 * recognition only.
 *
 * MIRROR of `apps/api/src/common/utils/deposit-category.ts`. The API has no
 * build step for workspace packages and may not import runtime values from
 * `@budget/shared-utils`, so the name table is duplicated. Both tables must
 * stay equal; parity is pinned by
 * `apps/mobile/src/features/categories/__tests__/depositCategoryParity.test.ts`,
 * which reads both files as text.
 */
const DEPOSIT_CATEGORY_NAMES: Record<string, string> = {
  en: 'Deposit',
  pl: 'Kaucja',
  de: 'Pfand',
  es: 'Depósito',
  fr: 'Consigne',
  nl: 'Statiegeld',
  ru: 'Залог за тару',
  ua: 'Застава за тару',
  be: 'Закладзь за тару',
};

const RESERVED = new Set(Object.values(DEPOSIT_CATEGORY_NAMES).map((n) => n.trim().toLowerCase()));

/** True when a category name is the deposit category in ANY supported language. */
export const isDepositCategoryName = (name: string | null | undefined): boolean =>
  !!name && RESERVED.has(name.trim().toLowerCase());
