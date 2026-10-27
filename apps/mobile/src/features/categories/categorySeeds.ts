import { catalogEntry, catalogKeyForName } from '@budget/shared-utils';

/**
 * The categories this device seeds on its own (offline, before or without a
 * server answer), expressed as catalog KEYS. Names come from the catalog; this
 * file holds only what the catalog cannot: the app's Ionicons glyph and colour
 * for each, and the row id.
 *
 * ## Why the ids are written out
 *
 * Seed rows are addressed by a deterministic id that devices in the field
 * already hold and that the server resolves (`default-exp-<slug>`,
 * `resolveExpenseCategoryId`). The id was the slug of the app's old English
 * seed name, and for `health` that name was "Health & Fitness" while the
 * catalog's English name is "Health" — deriving the id from the catalog would
 * mint `default-exp-health` beside the existing `default-exp-health---fitness`
 * and seed a duplicate on every device. The ids are therefore frozen here, and
 * a test pins them to the old slug rule over the old names.
 *
 * ## Why this set, not the catalog's `seeded` flag
 *
 * `seeded` describes what the SERVER gives a new account. The app's own set
 * differs (it seeds Coffee & Drinks, Personal Care and the income extras, and
 * never seeded Alcohol/Household/Other/expense Gifts). Changing the set here
 * would add or drop local rows on every existing install, so it stays exactly
 * the set the app always seeded.
 */
export interface CategorySeed {
  id: string;
  key: string;
  type: 'expense' | 'income';
  /** Catalog English name - what a new seed row stores as `name`. */
  name: string;
  icon: string;
  color: string;
}

const SPEC: readonly Omit<CategorySeed, 'name'>[] = [
  { id: 'default-exp-food---dining', key: 'foodAndDining', type: 'expense', icon: 'restaurant', color: '#E53E3E' },
  { id: 'default-exp-transport', key: 'transport', type: 'expense', icon: 'car', color: '#2C9E96' },
  { id: 'default-exp-shopping', key: 'shopping', type: 'expense', icon: 'cart', color: '#2B8ABD' },
  { id: 'default-exp-entertainment', key: 'entertainment', type: 'expense', icon: 'game-controller', color: '#3A8C6E' },
  { id: 'default-exp-health---fitness', key: 'health', type: 'expense', icon: 'fitness', color: '#D4A017' },
  { id: 'default-exp-bills---utilities', key: 'billsAndUtilities', type: 'expense', icon: 'flash', color: '#9B59B6' },
  { id: 'default-exp-education', key: 'education', type: 'expense', icon: 'school', color: '#1A8C76' },
  { id: 'default-exp-travel', key: 'travel', type: 'expense', icon: 'airplane', color: '#B8860B' },
  { id: 'default-exp-groceries', key: 'groceries', type: 'expense', icon: 'basket', color: '#27AE60' },
  { id: 'default-exp-coffee---drinks', key: 'coffeeAndDrinks', type: 'expense', icon: 'cafe', color: '#A0522D' },
  { id: 'default-exp-subscriptions', key: 'subscriptions', type: 'expense', icon: 'repeat', color: '#7D3C98' },
  { id: 'default-exp-clothing', key: 'clothing', type: 'expense', icon: 'shirt', color: '#C0392B' },
  { id: 'default-exp-personal-care', key: 'personalCare', type: 'expense', icon: 'happy', color: '#2471A3' },
  { id: 'default-inc-salary', key: 'salary', type: 'income', icon: 'cash', color: '#27AE60' },
  { id: 'default-inc-freelance', key: 'freelance', type: 'income', icon: 'laptop', color: '#2ECC71' },
  { id: 'default-inc-investments', key: 'investments', type: 'income', icon: 'trending-up', color: '#1ABC9C' },
  { id: 'default-inc-gifts', key: 'gifts', type: 'income', icon: 'gift', color: '#E74C3C' },
  { id: 'default-inc-other-income', key: 'otherIncome', type: 'income', icon: 'ellipsis-horizontal', color: '#95A5A6' },
];

export const CATEGORY_SEEDS: readonly CategorySeed[] = SPEC.map((s) => {
  const entry = catalogEntry(s.key, s.type);
  if (!entry) throw new Error(`Category seed ${s.key}/${s.type} is not in the catalog`);
  return { ...s, name: entry.names.en };
});

/** The app seed (glyph + colour) for a key of this type, if the app seeds it. */
export function seedForKey(key: string | null | undefined, type: 'expense' | 'income'): CategorySeed | undefined {
  if (!key) return undefined;
  return CATEGORY_SEEDS.find((s) => s.key === key && s.type === type);
}

/** The app seed for a category NAME in any of the nine languages (or a legacy alias). */
export function seedForName(name: string, type: 'expense' | 'income'): CategorySeed | undefined {
  return seedForKey(catalogKeyForName(name, type), type);
}
