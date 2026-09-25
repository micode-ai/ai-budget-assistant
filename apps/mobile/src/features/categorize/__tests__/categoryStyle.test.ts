import type { TFunction } from 'i18next';
import { categoryStyle, tintOf, NEUTRAL_CATEGORY_COLOR } from '../categoryStyle';
import { DEFAULT_EXPENSE_CATEGORIES } from '@/stores/categoryStore';

// jest.mock calls are hoisted above these imports.
// categoryStore pulls in SQLite, the API client and the other stores; the
// helper only needs its DEFAULT_EXPENSE_CATEGORIES constant.
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('@/db/categoryRepository', () => ({}));
jest.mock('@/db/syncMetadataRepository', () => ({}));
jest.mock('@/services/api', () => ({ api: {} }));
jest.mock('@/services/encryptionHelper', () => ({}));
jest.mock('@/stores/accountStore', () => ({ useAccountStore: { getState: () => ({}) } }));
jest.mock('@/stores/authStore', () => ({ useAuthStore: { getState: () => ({}) } }));

const polish: Record<string, string> = {
  'categories.expense.transport': 'Transport',
  'categories.expense.groceries': 'Artykuły spożywcze',
  'categories.expense.shopping': 'Zakupy',
};
const t = ((key: string) => polish[key] ?? key) as unknown as TFunction;

const def = (name: string) => DEFAULT_EXPENSE_CATEGORIES.find((c) => c.name === name)!;

describe('categoryStyle', () => {
  it('matches a default category by its English name', () => {
    expect(categoryStyle('Groceries', t)).toEqual({ icon: def('Groceries').icon, color: def('Groceries').color });
  });

  it('matches a default category by its localized name', () => {
    expect(categoryStyle('Zakupy', t)).toEqual({ icon: def('Shopping').icon, color: def('Shopping').color });
    expect(categoryStyle('Artykuły spożywcze', t)).toEqual({
      icon: def('Groceries').icon,
      color: def('Groceries').color,
    });
  });

  it('ignores case and surrounding / repeated whitespace', () => {
    expect(categoryStyle('  food &   DINING ', t).icon).toBe(def('Food & Dining').icon);
    expect(categoryStyle('zakupy', t).icon).toBe(def('Shopping').icon);
  });

  it('falls back to a neutral folder for an unknown name', () => {
    expect(categoryStyle('Zakupy budowlane', t)).toEqual({ icon: 'folder-outline', color: NEUTRAL_CATEGORY_COLOR });
    expect(categoryStyle('   ', t)).toEqual({ icon: 'folder-outline', color: NEUTRAL_CATEGORY_COLOR });
  });
});

describe('tintOf', () => {
  it('appends a low alpha to a 6-digit hex', () => {
    expect(tintOf('#E53E3E', '#fff')).toBe('#E53E3E20');
  });
  it('falls back for anything else', () => {
    expect(tintOf(undefined, 'fb')).toBe('fb');
    expect(tintOf('#abc', 'fb')).toBe('fb');
    expect(tintOf('rgba(0,0,0,1)', 'fb')).toBe('fb');
  });
});
