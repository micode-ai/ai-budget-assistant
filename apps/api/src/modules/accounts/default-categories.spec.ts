import { getDefaultCategories, defaultCategorySlot } from './default-categories';

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
      expect(defaultCategorySlot(c.name)).toBe(i);
    });
  });

  it('all nine locales have the same length', () => {
    const lengths = new Set(locales.map((l) => getDefaultCategories(l).length));
    expect(lengths.size).toBe(1);
  });
});
