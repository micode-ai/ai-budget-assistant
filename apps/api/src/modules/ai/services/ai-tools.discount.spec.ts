import { AiToolsService } from './ai-tools.service';

/**
 * `get_discount_total` answers "how much have I saved in discounts" — rabat,
 * Rabatt, скидка. It reads `Expense.discountAmount` rather than the category
 * split, because the split only exists when the receipt's split survived
 * (>= 2 categories and reconciled arithmetic), which is precisely why the
 * chat used to say nothing about a discount it had in fact recorded. Mirrors
 * `ai-tools.deposit.spec.ts` deliberately.
 */
function makeService(
  discountResult: unknown,
  rates?: Record<string, number>,
) {
  const analyticsService = {
    getDiscountRows: jest.fn().mockResolvedValue(discountResult),
  };
  const exchangeRateService = rates
    ? { getRates: jest.fn().mockResolvedValue({ rates }) }
    : undefined;

  const svc = new AiToolsService(
    undefined as any, // expensesService
    undefined as any, // incomesService
    undefined as any, // budgetsService
    undefined as any, // categoriesService
    analyticsService as any,
    undefined as any, // cacheService
    undefined as any, // debtsService
    undefined as any, // goalPlannerService
    exchangeRateService as any,
    undefined as any, // safeToSpendService
    undefined as any, // shoppingListService
    undefined as any, // inflationShieldService
  );
  return { svc, analyticsService };
}

const run = (svc: AiToolsService, args: Record<string, unknown>, baseCurrency?: string) =>
  (svc as any).executeAction('get_discount_total', args, 'a1', 'u1', baseCurrency);

const rows = (extra: unknown[] = []) => ({
  rows: [
    { date: '2026-08-14', merchant: 'Biedronka', discountAmount: '4.50', currencyCode: 'PLN' },
    { date: '2026-08-02', merchant: 'Lidl', discountAmount: '2.00', currencyCode: 'PLN' },
    ...extra,
  ],
  truncated: false,
});

describe('AiToolsService get_discount_total', () => {
  it('is a read action, so it never asks for confirmation', () => {
    const { svc } = makeService(rows());
    expect(svc.isWriteAction('get_discount_total')).toBe(false);
  });

  it('is exposed to the model with both dates optional', () => {
    const { svc } = makeService(rows());
    const tool = svc.getToolDefinitions().find((t: any) => t.function.name === 'get_discount_total');

    expect(tool).toBeDefined();
    // A bare "how much discount?" carries no period, so the model must be able
    // to call this with no arguments at all.
    expect((tool as any).function.parameters.required ?? []).toEqual([]);
  });

  it('totals the discounts and says where they came from', async () => {
    const { svc } = makeService(rows());

    const res = await run(svc, { startDate: '2026-08-01', endDate: '2026-08-31' }, 'PLN');

    expect(res.success).toBe(true);
    expect(res.data.total).toBe(6.5);
    expect(res.data.receiptCount).toBe(2);
    expect(res.data.byMerchant).toEqual([
      { merchant: 'Biedronka', amount: 4.5, receiptCount: 1 },
      { merchant: 'Lidl', amount: 2, receiptCount: 1 },
    ]);
    expect(res.data.baseCurrency).toBe('PLN');
  });

  it('searches the whole history when the model names no period', async () => {
    const { svc, analyticsService } = makeService(rows());

    const res = await run(svc, {}, 'PLN');

    const [, start, end] = analyticsService.getDiscountRows.mock.calls[0];
    expect(start.toISOString().slice(0, 10)).toBe('2000-01-01');
    expect(end.toISOString().slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
    // Echoed back so the answer can state the period it actually covered.
    expect(res.data.period.startDate).toBe('2000-01-01');
  });

  it('honours the period the model asked for', async () => {
    const { svc, analyticsService } = makeService(rows());

    await run(svc, { startDate: '2026-08-01', endDate: '2026-08-31' }, 'PLN');

    const [accountId, start, end] = analyticsService.getDiscountRows.mock.calls[0];
    expect(accountId).toBe('a1');
    expect(start.toISOString().slice(0, 10)).toBe('2026-08-01');
    expect(end.toISOString().slice(0, 10)).toBe('2026-08-31');
  });

  it('converts a foreign discount into the display currency', async () => {
    // 1 PLN = 0.25 EUR, so a 5 EUR discount is 20 PLN.
    const { svc } = makeService(
      rows([{ date: '2026-08-20', merchant: 'Rewe', discountAmount: '5.00', currencyCode: 'EUR' }]),
      { PLN: 1, EUR: 0.25 },
    );

    const res = await run(svc, {}, 'PLN');

    expect(res.data.total).toBe(26.5);
    expect(res.data.fxConverted).toBe(true);
    expect(res.data.discountsByCurrency).toEqual({ PLN: 6.5, EUR: 5 });
  });

  it('drops a discount it cannot convert and flags the total as approximate', async () => {
    // No rate provider at all, so only the display-currency rows can be summed.
    const { svc } = makeService(
      rows([{ date: '2026-08-20', merchant: 'Rewe', discountAmount: '5.00', currencyCode: 'EUR' }]),
    );

    const res = await run(svc, {}, 'PLN');

    expect(res.data.total).toBe(6.5);
    expect(res.data.fxApproximate).toBe(true);
    // The dropped currency is still visible natively, so the answer can mention it.
    expect(res.data.discountsByCurrency.EUR).toBe(5);
  });

  it('says it cannot read a fully encrypted account instead of answering zero', async () => {
    const { svc } = makeService({ encryptionRestricted: true, rows: [], truncated: false });

    const res = await run(svc, {}, 'PLN');

    expect(res.success).toBe(true);
    expect(res.data.encryptionRestricted).toBe(true);
    expect(res.data.total).toBeUndefined();
  });

  it('passes on the row ceiling rather than presenting a partial total as complete', async () => {
    const { svc } = makeService({ ...rows(), truncated: true });

    const res = await run(svc, {}, 'PLN');

    expect(res.data.truncated).toBe(true);
  });

  it('answers zero, not an error, when nothing recorded a discount', async () => {
    const { svc } = makeService({ rows: [], truncated: false });

    const res = await run(svc, {}, 'PLN');

    expect(res.success).toBe(true);
    expect(res.data.total).toBe(0);
    expect(res.data.receiptCount).toBe(0);
  });
});
