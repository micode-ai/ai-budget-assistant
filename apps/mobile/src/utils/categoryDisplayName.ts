import i18next from 'i18next';
import type { TFunction } from 'i18next';
import { catalogKeyForName, catalogName } from '@budget/shared-utils';

/**
 * The fields the display rule reads. Structural on purpose: callers pass full
 * `Category` rows, embedded `expense.category` objects and pickers' own shapes.
 */
export interface DisplayableCategory {
  name?: string | null;
  type?: string | null;
  systemKey?: string | null;
  nameCustomized?: boolean | null;
  isSystem?: boolean | null;
}

/**
 * The catalog locale for an i18next language code. The app's Ukrainian code is
 * `ua` (ISO `uk` is mapped to it in `i18n/index.ts`); a region suffix is
 * dropped; anything the catalog does not know reads as English inside
 * `catalogName` itself.
 */
export function catalogLocale(language: string | null | undefined): string {
  const base = (language || 'en').toLowerCase().split(/[-_]/)[0];
  return base === 'uk' ? 'ua' : base;
}

/**
 * THE display rule for a category name (spec 2026-10-27-category-system-keys):
 *
 * - a keyed row the user has not renamed shows the catalog name in the UI
 *   language — standard categories follow the language;
 * - a renamed keyed row (`nameCustomized`) shows the user's own `name` in every
 *   language;
 * - a key this app version does not know shows `name`;
 * - a row with no key shows `name` — with one legacy exception: an `isSystem`
 *   row whose stored name is a catalog name. That is exactly the set the old
 *   English-name lookup translated (the app's own `default-*` seeds before they
 *   are labelled, global system categories the server never keys, and E2EE
 *   accounts' seeds), and dropping it would flip those rows to English for
 *   users who see them translated today.
 *
 * Returns the raw string (possibly empty); `categoryLabel` adds the
 * "Uncategorized" fallback.
 */
export function displayCategoryName(
  category: DisplayableCategory | null | undefined,
  language: string | null | undefined = i18next.language,
): string {
  if (!category) return '';
  const name = category.name ?? '';
  const type = category.type === 'income' ? 'income' : 'expense';
  const locale = catalogLocale(language);

  if (category.systemKey) {
    if (category.nameCustomized) return name;
    return catalogName(category.systemKey, type, locale) ?? name;
  }
  if (category.isSystem && name) {
    const key = catalogKeyForName(name, type);
    if (key) return catalogName(key, type, locale) ?? name;
  }
  return name;
}

/**
 * Kept for its many call sites. `t` is no longer read (the catalog carries all
 * nine languages); the language comes from i18next unless `language` is given.
 */
export function getCategoryDisplayName(
  category: DisplayableCategory,
  _t?: TFunction,
  language?: string,
): string {
  return displayCategoryName(category, language ?? i18next.language);
}
