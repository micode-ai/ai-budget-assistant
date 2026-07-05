import { PriceHistoryService } from './price-history.service';

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
      // 3 products, each doubling in price (+100%), weight proportional to base price
      const rows = [
        { resolvedName: 'Mleko', date: new Date('2026-01-05'), unitPrice: 3.0, merchant: 'Biedronka', currency: 'PLN' },
        { resolvedName: 'Mleko', date: new Date('2026-07-01'), unitPrice: 6.0, merchant: 'Biedronka', currency: 'PLN' },
        { resolvedName: 'Chleb', date: new Date('2026-01-10'), unitPrice: 4.0, merchant: 'Lidl', currency: 'PLN' },
        { resolvedName: 'Chleb', date: new Date('2026-07-01'), unitPrice: 8.0, merchant: 'Lidl', currency: 'PLN' },
        { resolvedName: 'Maslo', date: new Date('2026-01-15'), unitPrice: 7.0, merchant: 'Kaufland', currency: 'PLN' },
        { resolvedName: 'Maslo', date: new Date('2026-07-01'), unitPrice: 14.0, merchant: 'Kaufland', currency: 'PLN' },
      ];
      const result = (svc as any).computeInflationIndex(rows, '6m', now);
      expect(result.inflationIndex).toBeCloseTo(100, 0);
      expect(result.productCount).toBe(3);
    });

    it('excludes products without data in both periods', () => {
      const svc = makeSvc();
      const now = new Date('2026-07-02');
      // Only 2 qualifying products (Maslo has data only in current period)
      const rows = [
        { resolvedName: 'Mleko', date: new Date('2026-01-05'), unitPrice: 3.0, merchant: 'B', currency: 'PLN' },
        { resolvedName: 'Mleko', date: new Date('2026-07-01'), unitPrice: 6.0, merchant: 'B', currency: 'PLN' },
        { resolvedName: 'Chleb', date: new Date('2026-01-10'), unitPrice: 4.0, merchant: 'L', currency: 'PLN' },
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
  });
});
