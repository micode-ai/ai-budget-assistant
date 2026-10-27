/**
 * The one display rule for a category name (category system keys spec):
 * keyed + not renamed -> the catalog name in the UI language; renamed -> the
 * user's name in every language; no key / unknown key -> the stored name.
 */
import type { TFunction } from 'i18next';
import { getCategoryDisplayName, displayCategoryName, catalogLocale } from '../categoryDisplayName';

const t = ((k: string) => k) as unknown as TFunction;

const groceries = {
  name: 'Groceries',
  type: 'expense',
  systemKey: 'groceries',
  nameCustomized: false,
  isSystem: false,
};

describe('getCategoryDisplayName', () => {
  it('shows a keyed, not-renamed category in the UI language', () => {
    expect(getCategoryDisplayName(groceries, t, 'pl')).toBe('Zakupy spożywcze');
    expect(getCategoryDisplayName(groceries, t, 'de')).toBe('Lebensmittel');
    expect(getCategoryDisplayName(groceries, t, 'en')).toBe('Groceries');
  });

  it('translates a keyed row stored in another language too', () => {
    expect(getCategoryDisplayName({ ...groceries, name: 'Zakupy spożywcze' }, t, 'en')).toBe('Groceries');
  });

  it('reads Ukrainian under the app code ua and the ISO code uk alike', () => {
    expect(getCategoryDisplayName(groceries, t, 'ua')).toBe('Продукти');
    expect(getCategoryDisplayName(groceries, t, 'uk')).toBe('Продукти');
    expect(getCategoryDisplayName(groceries, t, 'pl-PL')).toBe('Zakupy spożywcze');
  });

  it('keeps the user name in every language once the category was renamed', () => {
    const renamed = { ...groceries, name: 'Biedronka', nameCustomized: true };
    expect(getCategoryDisplayName(renamed, t, 'pl')).toBe('Biedronka');
    expect(getCategoryDisplayName(renamed, t, 'ru')).toBe('Biedronka');
  });

  it('shows the stored name for a category with no key', () => {
    expect(getCategoryDisplayName({ name: 'Groceries', type: 'expense', systemKey: null }, t, 'pl')).toBe('Groceries');
    expect(getCategoryDisplayName({ name: 'Kawa', type: 'expense' }, t, 'de')).toBe('Kawa');
  });

  it('shows the stored name for a key this app version does not know', () => {
    expect(getCategoryDisplayName({ ...groceries, name: 'Pets', systemKey: 'petsAndVet' }, t, 'pl')).toBe('Pets');
  });

  it('reads the key on the right side: income gifts vs expense gifts', () => {
    expect(getCategoryDisplayName({ name: 'Gifts', type: 'income', systemKey: 'gifts' }, t, 'pl')).toBe('Prezenty');
    expect(getCategoryDisplayName({ name: 'Other Income', type: 'income', systemKey: 'otherIncome' }, t, 'pl')).toBe(
      'Inne przychody',
    );
  });

  it('an unknown UI language reads as English', () => {
    expect(getCategoryDisplayName({ ...groceries, name: 'Zakupy spożywcze' }, t, 'xx')).toBe('Groceries');
  });

  // Rows the old English-name lookup translated: isSystem with a standard
  // stored name, but no key yet (global system categories, a seed not yet
  // labelled). They must not flip to English for users who see them translated.
  it('still translates a keyless isSystem row with a standard name', () => {
    expect(getCategoryDisplayName({ name: 'Health & Fitness', type: 'expense', isSystem: true }, t, 'pl')).toBe('Zdrowie');
    expect(getCategoryDisplayName({ name: 'Moje', type: 'expense', isSystem: true }, t, 'pl')).toBe('Moje');
  });
});

describe('displayCategoryName', () => {
  it('returns an empty string for a missing category', () => {
    expect(displayCategoryName(undefined, 'pl')).toBe('');
    expect(displayCategoryName(null, 'pl')).toBe('');
  });
});

describe('catalogLocale', () => {
  it('maps codes to catalog locales', () => {
    expect(catalogLocale('uk')).toBe('ua');
    expect(catalogLocale('nl-NL')).toBe('nl');
    expect(catalogLocale(undefined)).toBe('en');
  });
});
