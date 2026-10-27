import { getDefaultCategories } from './default-categories';
import { catalogKeyForName } from '../../common/utils/category-catalog';

/**
 * The nine default lists are index-aligned: the same concept sits at the same
 * index in every locale, which is what category equivalence relies on. A
 * reordered or inserted entry in one locale would silently merge unrelated
 * categories.
 */
describe('default categories slot alignment', () => {
  const locales = ['en', 'de', 'es', 'fr', 'pl', 'ru', 'ua', 'be', 'nl'];

  it.each(locales)('every %s name resolves to its own index', (locale) => {
    getDefaultCategories(locale).forEach((c, i) => {
      const type = c.type ?? 'expense';
      expect(catalogKeyForName(c.name, type)).toBe(
        catalogKeyForName(getDefaultCategories('en')[i].name, type),
      );
    });
  });

  it('all nine locales have the same length', () => {
    const lengths = new Set(locales.map((l) => getDefaultCategories(l).length));
    expect(lengths.size).toBe(1);
  });
});
