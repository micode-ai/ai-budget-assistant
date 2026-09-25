import type { Category } from '@budget/shared-types';
import type { TFunction } from 'i18next';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '@/stores/categoryStore';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';

export interface CategoryStyle {
  /** An Ionicons glyph name — the vocabulary `CategoryIcon` draws as a glyph. */
  icon: string;
  color: string;
}

/**
 * The neutral grey `categoryStore.createCategory` already falls back to when
 * no colour is given, so an unmatched proposal looks exactly like any other
 * category created without one.
 */
export const NEUTRAL_CATEGORY_COLOR = '#6B7280';

const FALLBACK: CategoryStyle = { icon: 'folder-outline', color: NEUTRAL_CATEGORY_COLOR };

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

/**
 * Icon + colour for a category the categorize pass is about to CREATE, from
 * its name alone. A proposal that happens to be one of the default categories
 * — by its English name or by its name in the user's language ("Transport",
 * "Zakupy") — borrows that default's look; anything else gets a neutral
 * folder. Pure: `t` is injected so the localized names can be tested.
 * `entityType` picks which default list (and display-name `type`) to match
 * against — expense proposals never borrow an income default's look and
 * vice versa.
 */
export function categoryStyle(
  name: string,
  t: TFunction,
  entityType: 'expense' | 'income' = 'expense',
): CategoryStyle {
  const wanted = norm(name);
  if (!wanted) return FALLBACK;
  const defaults = entityType === 'income' ? DEFAULT_INCOME_CATEGORIES : DEFAULT_EXPENSE_CATEGORIES;
  for (const def of defaults) {
    if (norm(def.name) === wanted) return { icon: def.icon, color: def.color };
    // A system-flagged stand-in is all getCategoryDisplayName reads (isSystem,
    // name, type) — it maps a default's English name to its i18n key.
    const localized = getCategoryDisplayName(
      { name: def.name, type: entityType, isSystem: true } as Category,
      t,
    );
    if (norm(localized) === wanted) return { icon: def.icon, color: def.color };
  }
  return FALLBACK;
}

/**
 * The soft background for an icon circle: the colour at ~12% alpha (the
 * `color + '20'` convention used across the app), or `fallback` when the
 * colour is not a 6-digit hex that suffix can be appended to.
 */
export function tintOf(color: string | null | undefined, fallback: string): string {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? `${color}20` : fallback;
}
