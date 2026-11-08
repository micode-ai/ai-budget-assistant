import type { Budget, Currency, Expense, Income } from '@budget/shared-types';

export type DemoCategoryKey = 'groceries' | 'transport' | 'eating_out' | 'entertainment' | 'bills' | 'health' | 'shopping';

export interface BuildDemoDataInput {
  accountId: string;
  userId: string;
  currencyCode: Currency;
  now: Date;
  /** Optional lookup of real category ids by key; missing entries leave the row uncategorized. */
  categoryIds?: Partial<Record<DemoCategoryKey, string>>;
  days?: number;
}

export interface DemoData {
  expenses: Expense[];
  incomes: Income[];
  budgets: Budget[];
}

interface Template {
  key: DemoCategoryKey;
  merchants: string[];
  min: number;
  max: number;
  perWeek: number;
}

const TEMPLATES: Template[] = [
  { key: 'groceries', merchants: ['Fresh Market', 'Green Basket', 'Corner Store'], min: 12, max: 70, perWeek: 2.5 },
  { key: 'transport', merchants: ['City Transit', 'Quick Taxi', 'Fuel Stop'], min: 3, max: 35, perWeek: 2 },
  { key: 'eating_out', merchants: ['Cafe Luna', 'Noodle Bar', 'Pizza Corner'], min: 6, max: 38, perWeek: 1.5 },
  { key: 'entertainment', merchants: ['Cinema City', 'Stream+', 'Game Hub'], min: 8, max: 30, perWeek: 0.6 },
  { key: 'health', merchants: ['Pharmacy Plus', 'Fit Club'], min: 8, max: 45, perWeek: 0.4 },
  { key: 'shopping', merchants: ['Urban Wear', 'Home & Co'], min: 15, max: 90, perWeek: 0.5 },
];

/** Small deterministic PRNG (mulberry32) so a demo looks the same every time and tests are stable. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

export function buildDemoData(input: BuildDemoDataInput): DemoData {
  const { accountId, userId, currencyCode, now, categoryIds = {}, days = 90 } = input;
  const rand = mulberry32(20261108);
  const today = startOfDay(now);
  const expenses: Expense[] = [];
  const incomes: Income[] = [];
  let n = 0;

  const baseExpense = (date: Date, amount: number, key: DemoCategoryKey, merchant: string): Expense => {
    const id = `demo-exp-${n++}`;
    return {
      id,
      localId: id,
      userId,
      accountId,
      amount,
      currencyCode,
      description: merchant,
      merchant,
      categoryId: categoryIds[key],
      date,
      isRecurring: false,
      source: 'manual',
      createdAt: date,
      updatedAt: date,
      isDeleted: false,
      syncStatus: 'synced',
      syncVersion: 1,
    } as Expense;
  };

  for (let back = days - 1; back >= 0; back--) {
    const date = new Date(today);
    date.setDate(today.getDate() - back);
    for (const t of TEMPLATES) {
      if (rand() < t.perWeek / 7) {
        const amount = round2(t.min + rand() * (t.max - t.min));
        expenses.push(baseExpense(date, amount, t.key, t.merchants[Math.floor(rand() * t.merchants.length)]));
      }
    }
    if (date.getDate() === 1) expenses.push(baseExpense(date, 780, 'bills', 'Rent'));
    if (date.getDate() === 5) expenses.push(baseExpense(date, round2(95 + rand() * 25), 'bills', 'Utilities'));
    if (date.getDate() === 10) {
      const id = `demo-inc-${incomes.length}`;
      incomes.push({
        id,
        localId: id,
        userId,
        accountId,
        amount: 2800,
        currencyCode,
        description: 'Salary',
        date,
        source: 'manual',
        createdAt: date,
        updatedAt: date,
        isDeleted: false,
        syncStatus: 'synced',
        syncVersion: 1,
      } as Income);
    }
  }

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const budget = (idx: number, name: string, amount: number): Budget => ({
    id: `demo-bud-${idx}`,
    localId: `demo-bud-${idx}`,
    userId,
    accountId,
    name,
    amount,
    currencyCode,
    period: 'monthly',
    startDate: monthStart,
    alertThreshold: 80,
    isActive: true,
    createdAt: today,
    updatedAt: today,
    isDeleted: false,
    syncStatus: 'synced',
    syncVersion: 1,
  });

  return { expenses, incomes, budgets: [budget(0, 'Monthly budget', 1900), budget(1, 'Food & dining', 450)] };
}
