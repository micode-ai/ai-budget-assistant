import type { Category } from '@budget/shared-types';
import type { TFunction } from 'i18next';

const SYSTEM_CATEGORY_KEYS: Record<string, string> = {
  // Expense categories
  'Food & Dining': 'foodAndDining',
  'Transport': 'transport',
  'Shopping': 'shopping',
  'Entertainment': 'entertainment',
  'Health & Fitness': 'healthAndFitness',
  'Bills & Utilities': 'billsAndUtilities',
  'Education': 'education',
  'Travel': 'travel',
  'Groceries': 'groceries',
  'Coffee & Drinks': 'coffeeAndDrinks',
  'Subscriptions': 'subscriptions',
  'Clothing': 'clothing',
  'Personal Care': 'personalCare',
  // Income categories
  'Salary': 'salary',
  'Freelance': 'freelance',
  'Investments': 'investments',
  'Gifts': 'gifts',
  'Other Income': 'otherIncome',
};

export function getCategoryDisplayName(category: Category, t: TFunction): string {
  if (!category.isSystem) {
    return category.name;
  }
  const key = SYSTEM_CATEGORY_KEYS[category.name];
  if (!key) {
    return category.name;
  }
  const translationKey = `categories.${category.type}.${key}`;
  const translated = t(translationKey);
  return translated === translationKey ? category.name : translated;
}
