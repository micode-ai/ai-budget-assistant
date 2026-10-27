import { CATEGORY_CATALOG, catalogName } from '../../common/utils/category-catalog';

interface DefaultCategory {
  name: string;
  icon: string;
  color: string;
  /** Omitted means expense. Salary and Freelance are income categories: seeding
   *  them without a type made every new account's only "income" categories
   *  expense-typed, so the income category picker and review had nothing. */
  type?: 'expense' | 'income';
}

/**
 * What a new account is seeded with, in the account owner's language. Derived
 * from the keyed catalog (the single source of names), seeded entries only. An
 * unknown language reads as English; Dutch used to be missing here, so every
 * Dutch account was seeded with the English list until the catalog carried it.
 */
export function getDefaultCategories(language: string): DefaultCategory[] {
  return CATEGORY_CATALOG.filter((e) => e.seeded).map((e) => {
    const c: DefaultCategory = {
      name: catalogName(e.key, e.type, language) as string,
      icon: e.icon,
      color: e.color,
    };
    if (e.type === 'income') c.type = 'income';
    return c;
  });
}
