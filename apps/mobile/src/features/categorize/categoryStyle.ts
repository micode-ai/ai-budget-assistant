import type { TFunction } from 'i18next';
import { seedForName } from '@/features/categories/categorySeeds';

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

/**
 * Icon + colour for a category the categorize pass is about to CREATE, from
 * its name alone. A proposal that is one of the app's seeded categories — by
 * its name in any of the nine languages (or a legacy alias: "Transport",
 * "Zakupy", "Health & Fitness") — borrows that seed's look; anything else gets
 * a neutral folder. Matching goes through the category catalog, so `t` is no
 * longer read. `entityType` scopes the match — expense proposals never borrow
 * an income seed's look and vice versa.
 */
export function categoryStyle(
  name: string,
  _t?: TFunction,
  entityType: 'expense' | 'income' = 'expense',
): CategoryStyle {
  if (!name.trim()) return FALLBACK;
  const seed = seedForName(name, entityType);
  return seed ? { icon: seed.icon, color: seed.color } : FALLBACK;
}

/**
 * The soft background for an icon circle: the colour at ~12% alpha (the
 * `color + '20'` convention used across the app), or `fallback` when the
 * colour is not a 6-digit hex that suffix can be appended to.
 */
export function tintOf(color: string | null | undefined, fallback: string): string {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? `${color}20` : fallback;
}
