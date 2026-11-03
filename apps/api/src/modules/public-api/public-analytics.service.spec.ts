import { Prisma } from '@prisma/client';
import { PublicApiError } from './public-api-error';
import { PublicAnalyticsService } from './public-analytics.service';

const D = (v: string | number) => new Prisma.Decimal(v);
const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

interface FixtureRow {
  accountId?: string;
  amount: Prisma.Decimal;
  currencyCode: string;
  date: Date;
  isDeleted?: boolean;
  isPlanned?: boolean;
  isSplitReceivable?: boolean;
  isDebt?: boolean;
  isDebtRepayment?: boolean;
  linkedTransfer?: { id: string } | null;
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
  categorySplits?: Array<{
    categoryId: string;
    amount: Prisma.Decimal;
    category: { id: string; name: string };
  }>;
}

/**
 * A strict stand-in for Prisma's `where`: every key the service sends must be one this evaluator
 * understands, so a filter the service quietly adds (say `isDebt: false`) changes the result here
 * exactly as it would against the database, instead of being ignored by a lenient mock.
 */
function matches(row: FixtureRow, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (key === 'accountId') {
      if ((row.accountId ?? 'acc-1') !== cond) return false;
    } else if (key === 'date') {
      const c = cond as { gte?: Date; lte?: Date };
      if (c.gte && row.date < c.gte) return false;
      if (c.lte && row.date > c.lte) return false;
    } else if (typeof cond === 'boolean') {
      if (Boolean((row as unknown as Record<string, unknown>)[key]) !== cond) return false;
    } else {
      throw new Error(`unexpected where key in analytics query: ${key}`);
    }
  }
  return true;
}

function build(
  opts: {
    expenses?: FixtureRow[];
    incomes?: FixtureRow[];
    rates?: Record<string, number> | null;
    userCurrency?: string;
  } = {}
) {
  const expenses = opts.expenses ?? [];
  const incomes = opts.incomes ?? [];
  const prisma = {
    expense: {
      findMany: jest.fn(async (args: { where: Record<string, unknown> }) =>
        expenses.filter((r) => matches(r, args.where))
      ),
    },
    income: {
      findMany: jest.fn(async (args: { where: Record<string, unknown> }) =>
        incomes.filter((r) => matches(r, args.where))
      ),
    },
    user: { findUnique: jest.fn(async () => ({ currencyCode: opts.userCurrency ?? 'PLN' })) },
  };
  const rates = opts.rates === undefined ? {} : opts.rates;
  const exchange = {
    getRates: jest.fn(async (base: string) => {
      if (rates === null) throw new Error('provider down');
      return { base, rates, updatedAt: '2026-11-03T00:00:00.000Z' };
    }),
  };
  const store = new Map<string, unknown>();
  const cache = {
    get: jest.fn(async (k: string) => (store.has(k) ? store.get(k) : null)),
    set: jest.fn(async (k: string, v: unknown) => {
      store.set(k, JSON.parse(JSON.stringify(v)));
    }),
  };
  const service = new PublicAnalyticsService(prisma as never, exchange as never, cache as never);
  return { service, prisma, exchange, cache };
}

const exp = (
  amount: string | number,
  currencyCode = 'PLN',
  date = '2026-10-15',
  extra: Partial<FixtureRow> = {}
): FixtureRow => ({
  amount: D(amount),
  currencyCode,
  date: day(date),
  ...extra,
});

const Q = { from: '2026-10-01', to: '2026-10-31' };

async function rejection(p: Promise<unknown>): Promise<PublicApiError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e
  );
  expect(err).toBeInstanceOf(PublicApiError);
  return err as PublicApiError;
}

describe('PublicAnalyticsService', () => {
  describe('currency conversion', () => {
    it('converts every row into the requested currency before summing (1 PLN = 0.25 EUR)', async () => {
      const { service } = build({
        expenses: [exp(100, 'PLN'), exp(10, 'EUR')],
        rates: { PLN: 1, EUR: 0.25 },
      });
      const r = await service.summary('acc-1', 'user-1', { ...Q, currency: 'PLN' }, 0);
      expect(r.total_expenses).toBe('140.00');
      expect(r.fx_converted).toBe(true);
      expect(r.fx_approximate).toBe(false);
      expect(r.currency).toBe('PLN');
    });

    it('excludes a row with no known rate and flags fx_approximate; transaction_count leaves it out', async () => {
      const { service } = build({
        expenses: [exp(100, 'PLN'), exp(50, 'GBP')],
        rates: { PLN: 1, EUR: 0.25 },
      });
      const r = await service.summary('acc-1', 'user-1', { ...Q, currency: 'PLN' }, 0);
      expect(r.total_expenses).toBe('100.00');
      expect(r.fx_approximate).toBe(true);
      expect(r.fx_converted).toBe(false);
      expect(r.transaction_count).toBe(1);
    });

    it('a rate-provider outage excludes every foreign row instead of failing', async () => {
      const { service } = build({ expenses: [exp(100, 'PLN'), exp(10, 'EUR')], rates: null });
      const r = await service.summary('acc-1', 'user-1', { ...Q, currency: 'PLN' }, 0);
      expect(r.total_expenses).toBe('100.00');
      expect(r.fx_approximate).toBe(true);
    });

    it('does not fetch rates when every row is already in the requested currency', async () => {
      const { service, exchange } = build({ expenses: [exp(100, 'PLN')] });
      const r = await service.summary('acc-1', 'user-1', { ...Q, currency: 'PLN' }, 0);
      expect(exchange.getRates).not.toHaveBeenCalled();
      expect(r).toMatchObject({ fx_converted: false, fx_approximate: false });
    });

    it('defaults the currency to the grantor user, and an explicit currency overrides it', async () => {
      const { service, prisma } = build({
        expenses: [exp(100, 'PLN')],
        rates: { PLN: 4, EUR: 1 },
        userCurrency: 'EUR',
      });
      const byDefault = await service.summary('acc-1', 'user-1', Q, 0);
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } })
      );
      expect(byDefault.currency).toBe('EUR');
      expect(byDefault.total_expenses).toBe('25.00');

      const explicit = await service.summary('acc-1', 'user-1', { ...Q, currency: 'PLN' }, 0);
      expect(explicit.currency).toBe('PLN');
      expect(explicit.total_expenses).toBe('100.00');
    });

    it('an unknown currency code is 400 validation_failed on currency', async () => {
      const { service } = build();
      const err = await rejection(service.summary('acc-1', 'user-1', { ...Q, currency: 'XYZ' }, 0));
      expect(err.getStatus()).toBe(400);
      expect(err.code).toBe('validation_failed');
      expect(err.details).toEqual({ fields: { currency: [expect.any(String)] } });
    });
  });

  describe('counting rules', () => {
    it('planned and split-receivable expenses are not counted; deleted rows neither', async () => {
      const { service } = build({
        expenses: [
          exp(100),
          exp(30, 'PLN', '2026-10-15', { isPlanned: true }),
          exp(20, 'PLN', '2026-10-15', { isSplitReceivable: true, isDebt: true }),
          exp(5, 'PLN', '2026-10-15', { isDeleted: true }),
        ],
        incomes: [exp(500), exp(70, 'PLN', '2026-10-15', { isSplitReceivable: true })],
      });
      const r = await service.summary('acc-1', 'user-1', { ...Q, currency: 'PLN' }, 0);
      expect(r).toMatchObject({
        total_expenses: '100.00',
        total_income: '500.00',
        net: '400.00',
        transaction_count: 2,
      });
    });

    it('net can be negative', async () => {
      const { service } = build({ expenses: [exp(120.5)], incomes: [exp(100)] });
      const r = await service.summary('acc-1', 'user-1', { ...Q, currency: 'PLN' }, 0);
      expect(r.net).toBe('-20.50');
    });

    // The app's Analytics tab (apps/mobile/src/features/analytics/useFilteredTransactions.ts) removes
    // only split receivables (`filterConsumption` / `filterIncomeConsumption`) — never on `isDebt` —
    // so debt rows and a transfer's linked income are counted. An account transfer itself is not an
    // expense or income row, so there is nothing else to count.
    describe('debts and transfers, as the app Analytics tab counts them', () => {
      it('a lent debt (expense, isDebt) counts as spending', async () => {
        const { service } = build({ expenses: [exp(200, 'PLN', '2026-10-15', { isDebt: true })] });
        const r = await service.summary('acc-1', 'user-1', { ...Q, currency: 'PLN' }, 0);
        expect(r).toMatchObject({ total_expenses: '200.00', transaction_count: 1 });
      });

      it('a repayment of a borrowed debt (expense, isDebtRepayment) counts as spending', async () => {
        const { service } = build({
          expenses: [exp(80, 'PLN', '2026-10-15', { isDebtRepayment: true })],
        });
        const r = await service.summary('acc-1', 'user-1', { ...Q, currency: 'PLN' }, 0);
        expect(r.total_expenses).toBe('80.00');
      });

      it('a borrowed debt (income, isDebt) counts as income', async () => {
        const { service } = build({ incomes: [exp(300, 'PLN', '2026-10-15', { isDebt: true })] });
        const r = await service.summary('acc-1', 'user-1', { ...Q, currency: 'PLN' }, 0);
        expect(r.total_income).toBe('300.00');
      });

      it('a repayment received for a lent debt (income, isDebtRepayment) counts as income', async () => {
        const { service } = build({
          incomes: [exp(150, 'PLN', '2026-10-15', { isDebtRepayment: true })],
        });
        const r = await service.summary('acc-1', 'user-1', { ...Q, currency: 'PLN' }, 0);
        expect(r.total_income).toBe('150.00');
      });

      it("a transfer's linked income (count as income) counts as income", async () => {
        const { service } = build({
          incomes: [exp(400, 'PLN', '2026-10-15', { linkedTransfer: { id: 't-1' } })],
        });
        const r = await service.summary('acc-1', 'user-1', { ...Q, currency: 'PLN' }, 0);
        expect(r.total_income).toBe('400.00');
      });

      it('never filters on isDebt, isDebtRepayment or a linked transfer', async () => {
        const { service, prisma } = build();
        await service.summary('acc-1', 'user-1', { ...Q, currency: 'PLN' }, 0);
        for (const call of [
          ...prisma.expense.findMany.mock.calls,
          ...prisma.income.findMany.mock.calls,
        ]) {
          const where = (call[0] as { where: Record<string, unknown> }).where;
          expect(Object.keys(where)).not.toEqual(expect.arrayContaining(['isDebt']));
          expect(where).not.toHaveProperty('isDebtRepayment');
          expect(where).not.toHaveProperty('linkedTransfer');
          expect(where).toMatchObject({
            accountId: 'acc-1',
            isDeleted: false,
            isSplitReceivable: false,
          });
        }
        // Planned is an expense-only column.
        expect(prisma.expense.findMany.mock.calls[0][0].where).toMatchObject({ isPlanned: false });
        expect(prisma.income.findMany.mock.calls[0][0].where).not.toHaveProperty('isPlanned');
      });
    });
  });

  describe('dates', () => {
    it('includes a row dated `to` and `from`, excludes the day after', async () => {
      const { service } = build({
        expenses: [
          exp(1, 'PLN', '2026-10-01'),
          exp(2, 'PLN', '2026-10-31'),
          exp(4, 'PLN', '2026-11-01'),
        ],
      });
      const r = await service.summary('acc-1', 'user-1', { ...Q, currency: 'PLN' }, 0);
      expect(r.total_expenses).toBe('3.00');
      expect(r).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
    });

    it('from > to is 400 validation_failed', async () => {
      const { service } = build();
      const err = await rejection(
        service.summary('acc-1', 'user-1', { from: '2026-10-31', to: '2026-10-01' }, 0)
      );
      expect(err.getStatus()).toBe(400);
      expect(err.code).toBe('validation_failed');
      expect(err.details).toEqual({ fields: { to: [expect.any(String)] } });
    });

    it('366 days (a leap year) is allowed; 367 days is 400', async () => {
      const { service } = build();
      await expect(
        service.summary('acc-1', 'user-1', { from: '2024-01-01', to: '2024-12-31' }, 0)
      ).resolves.toBeDefined();
      const err = await rejection(
        service.byCategory(
          'acc-1',
          'user-1',
          { from: '2024-01-01', to: '2025-01-01', type: 'expense' },
          0
        )
      );
      expect(err.getStatus()).toBe(400);
      expect(err.details).toEqual({ fields: { to: [expect.any(String)] } });
    });

    it('monthly: 24 calendar months are allowed; 25 is 400', async () => {
      const { service } = build();
      const ok = await service.monthly(
        'acc-1',
        'user-1',
        { from: '2024-01-15', to: '2025-12-02' },
        0
      );
      expect(ok.data).toHaveLength(24);
      const err = await rejection(
        service.monthly('acc-1', 'user-1', { from: '2024-01-01', to: '2026-01-31' }, 0)
      );
      expect(err.getStatus()).toBe(400);
      expect(err.code).toBe('validation_failed');
    });
  });

  describe('byCategory', () => {
    const food = { id: 'cat-food', name: 'Food' };
    const home = { id: 'cat-home', name: 'Home' };

    it('attributes a split expense to its split categories', async () => {
      const { service } = build({
        expenses: [
          exp(100, 'PLN', '2026-10-15', {
            categoryId: food.id,
            category: food,
            categorySplits: [
              { categoryId: food.id, amount: D(60), category: food },
              { categoryId: home.id, amount: D(40), category: home },
            ],
          }),
        ],
      });
      const r = await service.byCategory(
        'acc-1',
        'user-1',
        { ...Q, type: 'expense', currency: 'PLN' },
        0
      );
      expect(r.data).toEqual([
        { category_id: 'cat-food', category_name: 'Food', amount: '60.00', share: 0.6 },
        { category_id: 'cat-home', category_name: 'Home', amount: '40.00', share: 0.4 },
      ]);
      expect(r.encrypted_fields).toEqual([]);
    });

    it('sorts by amount, rounds share to 4 decimals and puts uncategorized rows under category_id null', async () => {
      const { service } = build({
        expenses: [
          exp(10, 'PLN', '2026-10-15', { categoryId: food.id, category: food }),
          exp(20),
          exp(3, 'PLN', '2026-10-16', { categoryId: food.id, category: food }),
        ],
      });
      const r = await service.byCategory(
        'acc-1',
        'user-1',
        { ...Q, type: 'expense', currency: 'PLN' },
        0
      );
      expect(r.data).toEqual([
        { category_id: null, category_name: null, amount: '20.00', share: 0.6061 },
        { category_id: 'cat-food', category_name: 'Food', amount: '13.00', share: 0.3939 },
      ]);
    });

    it('type=income reads incomes only', async () => {
      const salary = { id: 'cat-salary', name: 'Salary' };
      const { service, prisma } = build({
        expenses: [exp(999)],
        incomes: [exp(1000, 'PLN', '2026-10-10', { categoryId: salary.id, category: salary })],
      });
      const r = await service.byCategory(
        'acc-1',
        'user-1',
        { ...Q, type: 'income', currency: 'PLN' },
        0
      );
      expect(r.data).toEqual([
        { category_id: 'cat-salary', category_name: 'Salary', amount: '1000.00', share: 1 },
      ]);
      expect(prisma.expense.findMany).not.toHaveBeenCalled();
    });

    it('converts split shares too, and skips a row with no rate', async () => {
      const { service } = build({
        expenses: [
          exp(10, 'EUR', '2026-10-15', {
            categorySplits: [
              { categoryId: food.id, amount: D(6), category: food },
              { categoryId: home.id, amount: D(4), category: home },
            ],
          }),
          exp(5, 'GBP', '2026-10-15', { categoryId: food.id, category: food }),
        ],
        rates: { PLN: 1, EUR: 0.25 },
      });
      const r = await service.byCategory(
        'acc-1',
        'user-1',
        { ...Q, type: 'expense', currency: 'PLN' },
        0
      );
      expect(r.data.map((d) => [d.category_id, d.amount])).toEqual([
        ['cat-food', '24.00'],
        ['cat-home', '16.00'],
      ]);
      expect(r).toMatchObject({ fx_converted: true, fx_approximate: true });
    });

    it('tier 1: every category_name is null and listed in encrypted_fields', async () => {
      const { service } = build({
        expenses: [exp(10, 'PLN', '2026-10-15', { categoryId: food.id, category: food })],
      });
      const r = await service.byCategory(
        'acc-1',
        'user-1',
        { ...Q, type: 'expense', currency: 'PLN' },
        1
      );
      expect(r.data).toEqual([
        { category_id: 'cat-food', category_name: null, amount: '10.00', share: 1 },
      ]);
      expect(r.encrypted_fields).toEqual(['category_name']);
    });

    it('tier 1 is applied after the cache: a tier-0 result cached a moment earlier does not leak names', async () => {
      const { service } = build({
        expenses: [exp(10, 'PLN', '2026-10-15', { categoryId: food.id, category: food })],
      });
      await service.byCategory('acc-1', 'user-1', { ...Q, type: 'expense', currency: 'PLN' }, 0);
      const r = await service.byCategory(
        'acc-1',
        'user-1',
        { ...Q, type: 'expense', currency: 'PLN' },
        1
      );
      expect(r.data[0].category_name).toBeNull();
    });

    it('an empty period answers no rows', async () => {
      const { service } = build();
      const r = await service.byCategory(
        'acc-1',
        'user-1',
        { ...Q, type: 'expense', currency: 'PLN' },
        0
      );
      expect(r.data).toEqual([]);
    });
  });

  describe('monthly', () => {
    it('fills every calendar month of the range, empty ones with 0.00', async () => {
      const { service } = build({
        expenses: [exp(40, 'PLN', '2026-08-05'), exp(10, 'PLN', '2026-10-31')],
        incomes: [exp(100, 'PLN', '2026-08-20')],
      });
      const r = await service.monthly(
        'acc-1',
        'user-1',
        { from: '2026-08-01', to: '2026-10-31', currency: 'PLN' },
        0
      );
      expect(r.data).toEqual([
        { month: '2026-08', income: '100.00', expenses: '40.00', net: '60.00' },
        { month: '2026-09', income: '0.00', expenses: '0.00', net: '0.00' },
        { month: '2026-10', income: '0.00', expenses: '10.00', net: '-10.00' },
      ]);
      expect(r.encrypted_fields).toEqual([]);
    });

    it('spans a year boundary', async () => {
      const { service } = build();
      const r = await service.monthly(
        'acc-1',
        'user-1',
        { from: '2025-12-20', to: '2026-01-05' },
        0
      );
      expect(r.data.map((m) => m.month)).toEqual(['2025-12', '2026-01']);
    });
  });

  describe('cache', () => {
    it('caches 60 s under pa:an:{account}:{route}:{from}:{to}:{type|-}:{currency}', async () => {
      const { service, cache, prisma } = build({ expenses: [exp(10)] });
      await service.summary('acc-1', 'user-1', { ...Q, currency: 'PLN' }, 0);
      expect(cache.set).toHaveBeenCalledWith(
        'pa:an:acc-1:summary:2026-10-01:2026-10-31:-:PLN',
        expect.anything(),
        60
      );
      await service.summary('acc-1', 'user-1', { ...Q, currency: 'PLN' }, 0);
      expect(prisma.expense.findMany).toHaveBeenCalledTimes(1);

      await service.byCategory('acc-1', 'user-1', { ...Q, type: 'income', currency: 'PLN' }, 0);
      expect(cache.set).toHaveBeenCalledWith(
        'pa:an:acc-1:by-category:2026-10-01:2026-10-31:income:PLN',
        expect.anything(),
        60
      );
    });

    it('the default currency is part of the key', async () => {
      const { service, cache } = build({ userCurrency: 'EUR' });
      await service.monthly('acc-1', 'user-1', Q, 0);
      expect(cache.set).toHaveBeenCalledWith(
        'pa:an:acc-1:monthly:2026-10-01:2026-10-31:-:EUR',
        expect.anything(),
        60
      );
    });
  });
});
