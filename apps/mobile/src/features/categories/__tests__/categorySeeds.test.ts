import { CATEGORY_SEEDS, seedForKey, seedForName } from '../categorySeeds';

// The app's seed names before system keys, in the order and the exact spelling
// the ids were minted from. Devices in the field hold rows under these ids and
// the server resolves them by slug, so they may never change.
const LEGACY_EXPENSE = [
  'Food & Dining', 'Transport', 'Shopping', 'Entertainment', 'Health & Fitness', 'Bills & Utilities',
  'Education', 'Travel', 'Groceries', 'Coffee & Drinks', 'Subscriptions', 'Clothing', 'Personal Care',
];
const LEGACY_INCOME = ['Salary', 'Freelance', 'Investments', 'Gifts', 'Other Income'];
const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, '-');

describe('CATEGORY_SEEDS', () => {
  it('keeps every seed id a device already holds, and adds none', () => {
    expect(CATEGORY_SEEDS.filter((s) => s.type === 'expense').map((s) => s.id)).toEqual(
      LEGACY_EXPENSE.map((n) => `default-exp-${slug(n)}`),
    );
    expect(CATEGORY_SEEDS.filter((s) => s.type === 'income').map((s) => s.id)).toEqual(
      LEGACY_INCOME.map((n) => `default-inc-${slug(n)}`),
    );
  });

  it('carries a catalog key on every seed, with the catalog English name', () => {
    const health = CATEGORY_SEEDS.find((s) => s.id === 'default-exp-health---fitness')!;
    expect(health.key).toBe('health');
    expect(health.name).toBe('Health');
    for (const s of CATEGORY_SEEDS) expect(s.key).toBeTruthy();
    expect(new Set(CATEGORY_SEEDS.map((s) => `${s.type}:${s.key}`)).size).toBe(CATEGORY_SEEDS.length);
  });

  it('finds a seed by key (type-scoped) and by a name in any language', () => {
    expect(seedForKey('gifts', 'income')?.id).toBe('default-inc-gifts');
    expect(seedForKey('gifts', 'expense')).toBeUndefined();
    expect(seedForName('Zakupy spożywcze', 'expense')?.id).toBe('default-exp-groceries');
    expect(seedForName('Health & Fitness', 'expense')?.id).toBe('default-exp-health---fitness');
    expect(seedForName('Something else', 'expense')).toBeUndefined();
  });
});
