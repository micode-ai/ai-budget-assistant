import { PriceHistoryService } from './price-history.service';
import { checkReceiptPrices } from './receipt-check.util';

describe('PriceHistoryService', () => {
  describe('resolveMajorityCurrency', () => {
    it('returns the currency with most rows', () => {
      const svc = new PriceHistoryService(null as any, null as any);
      const result = (svc as any).resolveMajorityCurrency([
        { currency: 'PLN' }, { currency: 'PLN' }, { currency: 'EUR' },
      ]);
      expect(result).toBe('PLN');
    });

    it('breaks ties alphabetically', () => {
      const svc = new PriceHistoryService(null as any, null as any);
      const result = (svc as any).resolveMajorityCurrency([
        { currency: 'EUR' }, { currency: 'PLN' },
      ]);
      expect(result).toBe('EUR');
    });
  });

  describe('computeInflationIndex', () => {
    const makeSvc = () => new PriceHistoryService(null as any, null as any);

    it('returns null when fewer than 3 qualifying products', () => {
      const svc = makeSvc();
      const result = (svc as any).computeInflationIndex([], '6m');
      expect(result.inflationIndex).toBeNull();
    });

    it('computes weighted index correctly', () => {
      const svc = makeSvc();
      const now = new Date('2026-07-02');
      // For now=2026-07-02 & period=6m, lastDayOfMonthNBack gives
      // baseStart=2026-01-31, periodStart=2026-04-30 — so the base window is
      // [2026-01-31, 2026-04-30) (roughly Feb-Apr) and the current window is
      // [2026-04-30, 2026-07-02]. Base-period purchases below land inside that
      // Feb-Apr window (previously they were in early January, before
      // baseStart, so no product ever had a qualifying base-period row).
      // 3 products, each doubling in price (+100%), weight proportional to base price
      const rows = [
        { resolvedName: 'Mleko', date: new Date('2026-02-05'), unitPrice: 3.0, merchant: 'Biedronka', currency: 'PLN' },
        { resolvedName: 'Mleko', date: new Date('2026-07-01'), unitPrice: 6.0, merchant: 'Biedronka', currency: 'PLN' },
        { resolvedName: 'Chleb', date: new Date('2026-03-10'), unitPrice: 4.0, merchant: 'Lidl', currency: 'PLN' },
        { resolvedName: 'Chleb', date: new Date('2026-07-01'), unitPrice: 8.0, merchant: 'Lidl', currency: 'PLN' },
        { resolvedName: 'Maslo', date: new Date('2026-04-15'), unitPrice: 7.0, merchant: 'Kaufland', currency: 'PLN' },
        { resolvedName: 'Maslo', date: new Date('2026-07-01'), unitPrice: 14.0, merchant: 'Kaufland', currency: 'PLN' },
      ];
      const result = (svc as any).computeInflationIndex(rows, '6m', now);
      expect(result.inflationIndex).toBeCloseTo(100, 0);
      expect(result.productCount).toBe(3);
    });

    it('excludes products without data in both periods', () => {
      const svc = makeSvc();
      const now = new Date('2026-07-02');
      // Same base/current window as above (base=[2026-01-31, 2026-04-30),
      // current=[2026-04-30, 2026-07-02]). Mleko/Chleb get a base-period row
      // inside that window so they qualify; Maslo's only row (2026-06-01)
      // falls in the current window, so it has no base-period data — only 2
      // qualifying products, same intent as before.
      const rows = [
        { resolvedName: 'Mleko', date: new Date('2026-02-05'), unitPrice: 3.0, merchant: 'B', currency: 'PLN' },
        { resolvedName: 'Mleko', date: new Date('2026-07-01'), unitPrice: 6.0, merchant: 'B', currency: 'PLN' },
        { resolvedName: 'Chleb', date: new Date('2026-03-10'), unitPrice: 4.0, merchant: 'L', currency: 'PLN' },
        { resolvedName: 'Chleb', date: new Date('2026-07-01'), unitPrice: 8.0, merchant: 'L', currency: 'PLN' },
        { resolvedName: 'Maslo', date: new Date('2026-06-01'), unitPrice: 7.0, merchant: 'K', currency: 'PLN' },
      ];
      const result = (svc as any).computeInflationIndex(rows, '6m', now);
      expect(result.inflationIndex).toBeNull(); // < 3 qualifying
      expect(result.productCount).toBe(2);
    });
  });

  describe('backfillWithAi query (ABA-315)', () => {
    const OLD = process.env.OPENAI_API_KEY;
    afterEach(() => {
      if (OLD === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = OLD;
    });

    it('filters ExpenseItem.description with { not: "" } — { not: null } is invalid on the non-nullable String', async () => {
      process.env.OPENAI_API_KEY = 'sk-test';
      const findMany = jest.fn().mockResolvedValue([]); // no items -> early return, no OpenAI call
      const prisma: any = {
        productAlias: { findMany: jest.fn().mockResolvedValue([]) },
        expenseItem: { findMany },
      };
      const svc = new PriceHistoryService(prisma, null as any);

      const res = await svc.backfillWithAi('acc-1');

      expect(res).toEqual({ updatedCount: 0 });
      expect(findMany).toHaveBeenCalledTimes(1);
      const where = findMany.mock.calls[0][0].where;
      expect(where.description).toEqual({ not: '' });
    });

    // Regression: the alias guard used to sit at the TOP level as
    // `NOT: { canonicalName: { in: aliases } }`. That compiles to SQL
    // `NOT (canonical_name IN (...))`, which is NULL — not TRUE — for a NULL
    // canonical_name, so every row the backfill exists to fix was silently
    // excluded the moment an account had a single alias. Production: the Family
    // account had 103 aliases and 308 NULL-name items, and the endpoint answered
    // `{ updatedCount: 0 }` with no error.
    it('still matches NULL canonical names when the account has aliases', async () => {
      process.env.OPENAI_API_KEY = 'sk-test';
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma: any = {
        productAlias: {
          findMany: jest.fn().mockResolvedValue([{ rawName: 'Mleko' }, { rawName: 'Piwo' }]),
        },
        expenseItem: { findMany },
      };
      const svc = new PriceHistoryService(prisma, null as any);

      await svc.backfillWithAi('acc-1');
      const where = findMany.mock.calls[0][0].where;

      // No top-level NOT — that is what swallowed the NULL rows.
      expect(where.NOT).toBeUndefined();

      // The NULL branch must be reachable and completely unguarded by aliases.
      const nullBranch = where.OR.find(
        (b: any) => Object.prototype.hasOwnProperty.call(b, 'canonicalName') && b.canonicalName === null,
      );
      expect(nullBranch).toEqual({ canonicalName: null });

      // The alias guard must still protect the single-word branch.
      const wordBranch = where.OR.find((b: any) => Array.isArray(b.AND));
      expect(wordBranch.AND).toEqual(
        expect.arrayContaining([{ canonicalName: { notIn: ['Mleko', 'Piwo'] } }]),
      );
    });

    it('omits the alias guard entirely when the account has no aliases', async () => {
      process.env.OPENAI_API_KEY = 'sk-test';
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma: any = {
        productAlias: { findMany: jest.fn().mockResolvedValue([]) },
        expenseItem: { findMany },
      };
      const svc = new PriceHistoryService(prisma, null as any);

      await svc.backfillWithAi('acc-1');
      const where = findMany.mock.calls[0][0].where;

      expect(where.NOT).toBeUndefined();
      const wordBranch = where.OR.find((b: any) => Array.isArray(b.AND));
      expect(wordBranch.AND).toEqual([{ canonicalName: { not: { contains: ' ' } } }]);
    });
  });

  describe('getBasketComparison', () => {
    it('ranks stores by basket total', async () => {
      const prisma: any = {
        productAlias: { findMany: jest.fn().mockResolvedValue([]) },
        expenseItem: {
          findMany: jest.fn().mockResolvedValue([
            { id: '1', canonicalName: 'Milk', unitPrice: 3, quantity: 1, totalPrice: 3, expense: { date: new Date('2026-07-01'), merchant: 'Biedronka', currencyCode: 'PLN' } },
            { id: '2', canonicalName: 'Milk', unitPrice: 2.5, quantity: 1, totalPrice: 2.5, expense: { date: new Date('2026-07-01'), merchant: 'Lidl', currencyCode: 'PLN' } },
          ]),
        },
      };
      const service = new PriceHistoryService(prisma, null as any);

      const res = await service.getBasketComparison('acc-1', [{ canonicalName: 'Milk', quantity: 1 }]);

      expect(res.stores[0].merchantName).toBe('Lidl');
      expect(res.stores.find((s) => s.isCheapest)?.merchantName).toBe('Lidl');
    });

    it('returns store coords + distance when an origin is given', async () => {
      const prisma: any = {
        productAlias: { findMany: jest.fn().mockResolvedValue([]) },
        expenseItem: {
          findMany: jest.fn().mockResolvedValue([
            { id: '1', canonicalName: 'Milk', unitPrice: 2.5, quantity: 1, totalPrice: 2.5,
              expense: { date: new Date('2026-07-01'), merchant: 'Lidl', currencyCode: 'PLN', locationLat: 52.23, locationLng: 21.01 } },
          ]),
        },
      };
      const service = new PriceHistoryService(prisma, null as any);

      const res = await service.getBasketComparison('acc-1', [{ canonicalName: 'Milk', quantity: 1 }], { lat: 52.24, lng: 21.02 });

      expect(res.stores[0].lat).toBe(52.23);
      expect(res.stores[0].distanceKm).toBeGreaterThan(0);
      expect(res.stores[0].nearby).toBe(true);
    });
  });

  it('getProductTrends groups item rows into per-product price series', async () => {
    const prisma: any = {
      productAlias: { findMany: jest.fn().mockResolvedValue([]) },
      expenseItem: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'i1', canonicalName: 'Masło', unitPrice: 5.0, quantity: 1, totalPrice: 5.0,
            expense: { date: new Date('2026-06-05'), merchant: 'Lidl', currencyCode: 'PLN', locationLat: null, locationLng: null } },
          { id: 'i2', canonicalName: 'Masło', unitPrice: 5.9, quantity: 1, totalPrice: 5.9,
            expense: { date: new Date('2026-07-10'), merchant: 'Lidl', currencyCode: 'PLN', locationLat: null, locationLng: null } },
        ]),
      },
    };
    const service = new PriceHistoryService(prisma, null as any);

    const trends = await service.getProductTrends('a1');
    expect(trends).toHaveLength(1);
    expect(trends[0].canonicalName).toBe('Masło');
    expect(trends[0].points.map((p) => p.price)).toEqual([5.0, 5.9]);
    expect(trends[0].currentBestPrice).toBe(5.9); // latest
    expect(trends[0].currency).toBe('PLN');
    expect(trends[0].latestMerchant).toBe('Lidl');
    expect(trends[0].purchaseDates).toHaveLength(2);
  });

  it('fetchRows (via getProductTrends) falls back to totalPrice when unitPrice is a stored 0 (perUnitPrice, Fix 3a)', async () => {
    // ExpenseItem.unitPrice defaults to 0 on the DB column. Before the shared
    // perUnitPrice helper, fetchRows read `Number(item.unitPrice)` bare for a
    // qty<=1 row, so a stored 0 produced a literal 0 price point — this is the
    // one INTENDED behavior change from Fix 3(a): it now falls back to
    // totalPrice, same as every other consumer of perUnitPrice.
    const prisma: any = {
      productAlias: { findMany: jest.fn().mockResolvedValue([]) },
      expenseItem: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'i1', canonicalName: 'Chleb', unitPrice: 0, quantity: 1, totalPrice: 7.0,
            expense: { date: new Date('2026-06-05'), merchant: 'Lidl', currencyCode: 'PLN', locationLat: null, locationLng: null } },
        ]),
      },
    };
    const service = new PriceHistoryService(prisma, null as any);

    const trends = await service.getProductTrends('a1');
    expect(trends).toHaveLength(1);
    expect(trends[0].points.map((p) => p.price)).toEqual([7.0]);
  });

  describe('getProductTrendsFor', () => {
    it('queries only the requested products, merchant and window, and returns per-unit series', async () => {
      const prisma: any = {
        productAlias: { findMany: jest.fn().mockResolvedValue([]) },
        expenseItem: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'i1',
              canonicalName: 'Kawa',
              unitPrice: 20,
              quantity: 1,
              totalPrice: 20,
              size: null,
              expense: { date: new Date('2026-07-01'), merchant: 'Biedronka', currencyCode: 'PLN' },
            },
            {
              id: 'i2',
              canonicalName: 'Kawa',
              // quantity > 1 → per-unit price comes from totalPrice / quantity
              unitPrice: 44,
              quantity: 2,
              totalPrice: 44,
              size: null,
              expense: { date: new Date('2026-07-08'), merchant: 'Biedronka', currencyCode: 'PLN' },
            },
            {
              // Different merchant — deleting the JS merchant filter would leak this
              // 99 price into the returned points (Defect 3 regression guard).
              id: 'i3',
              canonicalName: 'Kawa',
              unitPrice: 99,
              quantity: 1,
              totalPrice: 99,
              size: null,
              expense: { date: new Date('2026-07-05'), merchant: 'Lidl', currencyCode: 'PLN' },
            },
          ]),
        },
      };
      const service = new PriceHistoryService(prisma, null as any);

      const since = new Date('2026-05-01');
      const out = await service.getProductTrendsFor('acc-1', ['Kawa'], 'biedronka', since, 'PLN');

      const where = prisma.expenseItem.findMany.mock.calls[0][0].where;
      expect(where.canonicalName.in).toEqual(['Kawa']);
      expect(where.expense.date.gte).toBe(since);
      expect(where.expense.accountId).toBe('acc-1');

      expect(out).toHaveLength(1);
      expect(out[0].currency).toBe('PLN');
      // The Lidl row's 99 must be absent — only the two Biedronka prices survive.
      expect(out[0].points.map((p) => p.price)).toEqual([20, 22]);
    });

    it('excludes a row in a different currency from the one requested', async () => {
      const prisma: any = {
        productAlias: { findMany: jest.fn().mockResolvedValue([]) },
        expenseItem: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'i1',
              canonicalName: 'Kawa',
              unitPrice: 20,
              quantity: 1,
              totalPrice: 20,
              size: null,
              expense: { date: new Date('2026-07-01'), merchant: 'Biedronka', currencyCode: 'PLN' },
            },
            {
              // Same product + merchant, but a different currency — must never be
              // mixed into a PLN baseline without conversion.
              id: 'i2',
              canonicalName: 'Kawa',
              unitPrice: 5,
              quantity: 1,
              totalPrice: 5,
              size: null,
              expense: { date: new Date('2026-07-02'), merchant: 'Biedronka', currencyCode: 'EUR' },
            },
          ]),
        },
      };
      const service = new PriceHistoryService(prisma, null as any);

      const out = await service.getProductTrendsFor(
        'acc-1',
        ['Kawa'],
        'biedronka',
        new Date('2026-05-01'),
        'PLN',
      );

      expect(out).toHaveLength(1);
      expect(out[0].currency).toBe('PLN');
      // If the currency filter were removed, the EUR row's price (5) would leak
      // in alongside the PLN one — the currency label alone can't catch that,
      // since the returned currency is always the requested one by construction.
      expect(out[0].points.map((p) => p.price)).toEqual([20]);
    });

    it('excludes a product whose alias resolves to the ignored sentinel', async () => {
      const prisma: any = {
        // 'Kawa' has been explicitly ignored via ignoreProduct(), which stores
        // the '__ignored__' sentinel as its resolved canonical name.
        productAlias: {
          findMany: jest.fn().mockResolvedValue([{ rawName: 'Kawa', canonicalName: '__ignored__' }]),
        },
        expenseItem: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'i1',
              canonicalName: 'Kawa',
              unitPrice: 20,
              quantity: 1,
              totalPrice: 20,
              size: null,
              expense: { date: new Date('2026-07-01'), merchant: 'Biedronka', currencyCode: 'PLN' },
            },
          ]),
        },
      };
      const service = new PriceHistoryService(prisma, null as any);

      const out = await service.getProductTrendsFor(
        'acc-1',
        ['Kawa'],
        'biedronka',
        new Date('2026-05-01'),
        'PLN',
      );

      // If the ignore check were removed, this would resolve to one entry
      // keyed by the literal string '__ignored__' with a price of 20.
      expect(out).toEqual([]);
    });

    it('returns an empty array when no product names are requested', async () => {
      const prisma: any = { expenseItem: { findMany: jest.fn() } };
      const service = new PriceHistoryService(prisma, null as any);

      await expect(
        service.getProductTrendsFor('acc-1', [], 'biedronka', new Date(), 'PLN'),
      ).resolves.toEqual([]);
      expect(prisma.expenseItem.findMany).not.toHaveBeenCalled();
    });

    it('excludes the given expenseId via the where clause (Fix 1: the detector must not count the receipt it is checking as its own history)', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma: any = { productAlias: { findMany: jest.fn().mockResolvedValue([]) }, expenseItem: { findMany } };
      const service = new PriceHistoryService(prisma, null as any);

      await service.getProductTrendsFor('acc-1', ['Kawa'], 'biedronka', new Date('2026-05-01'), 'PLN', 'exp-self');

      const where = findMany.mock.calls[0][0].where;
      expect(where.expenseId).toEqual({ not: 'exp-self' });
    });

    it('omits the expenseId filter entirely when no exclusion is given (the OCR scan-time call path)', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma: any = { productAlias: { findMany: jest.fn().mockResolvedValue([]) }, expenseItem: { findMany } };
      const service = new PriceHistoryService(prisma, null as any);

      await service.getProductTrendsFor('acc-1', ['Kawa'], 'biedronka', new Date('2026-05-01'), 'PLN');

      const where = findMany.mock.calls[0][0].where;
      expect(where.expenseId).toBeUndefined();
    });

    it('emits the entry under the RAW name the caller requested even when it is aliased (Fix 2), so the receipt-check engine — which looks up by the receipt line\'s raw name — still matches it and produces a finding', async () => {
      // The user renamed/merged raw 'KAWA MIELONA' to canonical 'Kawa' on the products screen.
      const prisma: any = {
        productAlias: {
          findMany: jest.fn().mockResolvedValue([{ rawName: 'KAWA MIELONA', canonicalName: 'Kawa' }]),
        },
        expenseItem: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'i1',
              canonicalName: 'KAWA MIELONA', // raw name as stored on expense_items — what the caller requests
              unitPrice: 20,
              quantity: 1,
              totalPrice: 20,
              size: null,
              expense: { date: new Date('2026-07-01'), merchant: 'Biedronka', currencyCode: 'PLN' },
            },
            {
              id: 'i2',
              canonicalName: 'KAWA MIELONA',
              unitPrice: 20,
              quantity: 1,
              totalPrice: 20,
              size: null,
              expense: { date: new Date('2026-07-08'), merchant: 'Biedronka', currencyCode: 'PLN' },
            },
          ]),
        },
      };
      const service = new PriceHistoryService(prisma, null as any);

      const out = await service.getProductTrendsFor(
        'acc-1',
        ['KAWA MIELONA'], // the receipt line's raw canonicalName — this is what checkReceiptPrices looks up by
        'biedronka',
        new Date('2026-05-01'),
        'PLN',
      );

      expect(out).toHaveLength(1);
      // Emitted under the RAW name, not the alias-resolved 'Kawa' — returning the
      // resolved name here is exactly the bug: the engine indexes history by the
      // receipt line's own raw canonicalName, so it would silently never match.
      expect(out[0].canonicalName).toBe('KAWA MIELONA');
      expect(out[0].points.map((p) => p.price)).toEqual([20, 20]);

      // Feed straight into the real engine to prove the fix produces an actual finding,
      // not just a correctly-labelled-but-still-unused entry.
      const result = checkReceiptPrices({
        lines: [{ canonicalName: 'KAWA MIELONA', unitPrice: 30, quantity: 1 }],
        history: out,
        merchant: 'Biedronka',
        currencyCode: 'PLN',
        now: new Date('2026-07-25T12:00:00Z'),
      });
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].baselineUnitPrice).toBe(20);
    });
  });
});
