import { AnalyticsService } from './analytics.service';

/**
 * `AnalyticsService.getDepositSummary`/`getDiscountSummary` back the tappable
 * "Discount savings"/"Deposits paid" rows in Quick Insights
 * (`GET /analytics/savings-detail`). They compose the SAME `getDepositRows`/
 * `getDiscountRows` + the SAME pure `summariseDeposits`/`summariseDiscounts`
 * the AI chat's `get_deposit_total`/`get_discount_total` tools already use
 * (mirrors `ai-tools.deposit.spec.ts`/`ai-tools.discount.spec.ts` deliberately
 * — same fixtures, same assertions, different entry point).
 */
function makePrisma(encryptionTier: number, expenseRows: unknown[]) {
  return {
    account: { findUnique: jest.fn().mockResolvedValue({ encryptionTier }) },
    expense: { findMany: jest.fn().mockResolvedValue(expenseRows) },
  };
}

function makeService(prisma: any, rates?: Record<string, number>) {
  const cache: any = { get: jest.fn(), set: jest.fn() };
  const exchangeRateService = rates
    ? { getRates: jest.fn().mockResolvedValue({ rates }) }
    : undefined;
  return new AnalyticsService(prisma, cache, exchangeRateService as any);
}

const depositRows = (extra: unknown[] = []) => [
  { id: 'e1', date: '2026-08-14', merchant: 'Biedronka', depositAmount: '4.50', currencyCode: 'PLN' },
  { id: 'e2', date: '2026-08-02', merchant: 'Lidl', depositAmount: '2.00', currencyCode: 'PLN' },
  ...extra,
];

describe('AnalyticsService.getDepositSummary', () => {
  it('says it cannot read a fully encrypted account instead of answering zero', async () => {
    const prisma = makePrisma(2, []);
    const service = makeService(prisma);

    const res = await service.getDepositSummary('a1', 'PLN', new Date('2026-08-01'), new Date('2026-08-31'));

    expect(res.encryptionRestricted).toBe(true);
    expect(res.total).toBe(0);
    expect(res.recent).toEqual([]);
    // A tier-2 account must never even be queried for its rows.
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
  });

  it('totals the deposits, says where they came from, and carries the expense id for tap-through', async () => {
    const prisma = makePrisma(0, depositRows());
    const service = makeService(prisma);

    const res = await service.getDepositSummary('a1', 'PLN', new Date('2026-08-01'), new Date('2026-08-31'));

    expect(res.encryptionRestricted).toBe(false);
    expect(res.kind).toBe('deposit');
    expect(res.total).toBe(6.5);
    expect(res.receiptCount).toBe(2);
    expect(res.byMerchant).toEqual([
      { merchant: 'Biedronka', amount: 4.5, receiptCount: 1 },
      { merchant: 'Lidl', amount: 2, receiptCount: 1 },
    ]);
    expect(res.recent.map((r) => r.expenseId)).toEqual(['e1', 'e2']);
    expect(res.baseCurrency).toBe('PLN');
  });

  it('converts a foreign deposit into the display currency', async () => {
    // 1 PLN = 0.25 EUR, so a 5 EUR deposit is 20 PLN.
    const prisma = makePrisma(
      0,
      depositRows([{ id: 'e3', date: '2026-08-20', merchant: 'Rewe', depositAmount: '5.00', currencyCode: 'EUR' }]),
    );
    const service = makeService(prisma, { PLN: 1, EUR: 0.25 });

    const res = await service.getDepositSummary('a1', 'PLN', new Date('2026-08-01'), new Date('2026-08-31'));

    expect(res.total).toBe(26.5);
    expect(res.fxConverted).toBe(true);
    expect(res.totalsByCurrency).toEqual({ PLN: 6.5, EUR: 5 });
  });

  it('drops a deposit it cannot convert and flags the total as approximate', async () => {
    const prisma = makePrisma(
      0,
      depositRows([{ id: 'e3', date: '2026-08-20', merchant: 'Rewe', depositAmount: '5.00', currencyCode: 'EUR' }]),
    );
    // No rate provider at all (no `exchangeRateService`), same as `getRatesSafe` returning null.
    const service = makeService(prisma);

    const res = await service.getDepositSummary('a1', 'PLN', new Date('2026-08-01'), new Date('2026-08-31'));

    expect(res.total).toBe(6.5);
    expect(res.fxApproximate).toBe(true);
    expect(res.unconvertedCount).toBe(1);
    expect(res.totalsByCurrency.EUR).toBe(5);
  });

  it('answers zero, not an error, when nothing recorded a deposit', async () => {
    const prisma = makePrisma(0, []);
    const service = makeService(prisma);

    const res = await service.getDepositSummary('a1', 'PLN', new Date('2026-08-01'), new Date('2026-08-31'));

    expect(res.encryptionRestricted).toBe(false);
    expect(res.total).toBe(0);
    expect(res.receiptCount).toBe(0);
  });
});

describe('AnalyticsService.getDiscountSummary', () => {
  const discountRows = () => [
    { id: 'e4', date: '2026-08-10', merchant: 'Zabka', discountAmount: '3.00', currencyCode: 'PLN' },
  ];

  it('says it cannot read a fully encrypted account instead of answering zero', async () => {
    const prisma = makePrisma(2, []);
    const service = makeService(prisma);

    const res = await service.getDiscountSummary('a1', 'PLN', new Date('2026-08-01'), new Date('2026-08-31'));

    expect(res.encryptionRestricted).toBe(true);
    expect(res.total).toBe(0);
  });

  it('totals the discounts and carries the expense id for tap-through', async () => {
    const prisma = makePrisma(0, discountRows());
    const service = makeService(prisma);

    const res = await service.getDiscountSummary('a1', 'PLN', new Date('2026-08-01'), new Date('2026-08-31'));

    expect(res.kind).toBe('discount');
    expect(res.total).toBe(3);
    expect(res.receiptCount).toBe(1);
    expect(res.recent[0].expenseId).toBe('e4');
  });

  it('passes on the row ceiling rather than presenting a partial total as complete', async () => {
    // The row-limit-over-fetch mechanics that actually produce `truncated`
    // are `getDiscountRows`'s own concern and are covered by
    // `analytics.service.spec.ts` — here it's enough to confirm the flag
    // passes through `getDiscountSummary` unchanged when the rows method
    // reports it.
    const prisma = makePrisma(0, discountRows());
    const service = makeService(prisma);
    jest.spyOn(service, 'getDiscountRows').mockResolvedValue({ rows: discountRows(), truncated: true } as any);

    const res = await service.getDiscountSummary('a1', 'PLN', new Date('2026-08-01'), new Date('2026-08-31'));

    expect(res.truncated).toBe(true);
  });
});
