import { ReceiptFinalizerService } from '../ai/services/receipt-finalizer.service';
import { AnomalyService } from '../anomaly/anomaly.service';
import { PriceHistoryService } from './price-history.service';

/**
 * The whole receipt price-check architecture rests on one claim: the inline
 * scan-time check (ReceiptFinalizerService.runPriceCheck, called from
 * finalizeReceipt BEFORE the expense exists) and the persisted, feed-writing check
 * (AnomalyService.detectPriceOvercharge, called AFTER ExpensesService.create
 * has already committed the expense and its expense_items) run the SAME
 * deterministic engine over the SAME price history and therefore MUST agree.
 *
 * They can only disagree if one of them sees a different history than the
 * other. The concrete way that happened (the bug this test guards): by the
 * time detectPriceOvercharge queries history, this receipt's own items are
 * already visible in the DB — so without excluding them, the detector counts
 * the receipt it is checking as one of its own prior purchases.
 *
 * This test does not stub `getProductTrendsFor` — it runs the REAL
 * PriceHistoryService against a fake Prisma that actually HONORS the
 * `expenseId: { not }` filter (unlike a naive mock that ignores `where`
 * entirely), so it exercises the real exclusion wiring end to end.
 */
describe('receipt price-check: cross-path agreement (OCR scan-time vs. persisted detector)', () => {
  const now = new Date('2026-07-25T12:00:00Z');
  const merchant = 'Biedronka';
  const currencyCode = 'PLN';

  // A single prior real purchase — one point is BELOW the default minPoints (2),
  // so the correct behavior on both paths is "no finding".
  const priorRow = {
    id: 'item-prior-1',
    canonicalName: 'Kawa',
    unitPrice: 20,
    quantity: 1,
    totalPrice: 20,
    expenseId: 'e-prior-1',
    expense: { date: new Date('2026-07-01'), merchant, currencyCode },
  };

  // This receipt's own item, dated "now" — by the time detectPriceOvercharge
  // runs, ExpensesService.create has already committed this row.
  const selfRow = {
    id: 'item-self',
    canonicalName: 'Kawa',
    unitPrice: 30,
    quantity: 1,
    totalPrice: 30,
    expenseId: 'exp-1',
    expense: { date: now, merchant, currencyCode },
  };

  /** A fake Prisma that actually filters by `where.expenseId.not`, simulating what Postgres would do. */
  const makeFakePrisma = (allRows: typeof priorRow[]) => ({
    productAlias: { findMany: jest.fn().mockResolvedValue([]) },
    expenseItem: {
      findMany: jest.fn(({ where }: any) => {
        const excludeId = where.expenseId?.not;
        return Promise.resolve(allRows.filter((r) => (excludeId ? r.expenseId !== excludeId : true)));
      }),
    },
  });

  it('produces identical findings on both paths — and would fail if the exclusion were removed', async () => {
    // --- Path A: OCR scan-time check. The expense does not exist yet, so the
    // fake DB this call sees only ever contains the prior purchase. ---
    const ocrPriceHistory = new PriceHistoryService(makeFakePrisma([priorRow]) as any, null as any);
    const ocrService = Object.create(ReceiptFinalizerService.prototype) as any;
    ocrService.priceHistory = ocrPriceHistory;
    ocrService.logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };

    const receipt = {
      merchant,
      currencyCode,
      date: now.toISOString().slice(0, 10),
      receiptItems: [{ description: 'KAWA', canonicalName: 'Kawa', quantity: 1, unitPrice: 30, totalPrice: 30 }],
    };
    const ocrFindings = await ocrService.runPriceCheck('acc-1', receipt);

    // --- Path B: the persisted detector. This receipt's own item is ALREADY
    // committed in the DB alongside the prior purchase (both rows exist) — only
    // the `excludeExpenseId` that detectPriceOvercharge passes keeps the self
    // row from being counted as its own history. ---
    const detectorPriceHistory = new PriceHistoryService(makeFakePrisma([priorRow, selfRow]) as any, null as any);
    const anomalyPrisma: any = {
      anomalyAlert: {
        create: jest.fn().mockResolvedValue({ id: 'alert-1' }),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
      },
      expenseItem: {
        findMany: jest.fn().mockResolvedValue([{ canonicalName: 'Kawa', quantity: 1, unitPrice: 30, totalPrice: 30 }]),
      },
    };
    const anomalyNotifications: any = { sendToUser: jest.fn() };
    const anomalyConfig: any = { get: jest.fn().mockReturnValue(undefined) };
    const anomalyService = new AnomalyService(anomalyPrisma, anomalyNotifications, detectorPriceHistory, anomalyConfig);

    await (anomalyService as any).detectPriceOvercharge('acc-1', 'user-1', {
      id: 'exp-1',
      merchant,
      description: null,
      amount: 30,
      currencyCode,
      date: now,
      recurringId: null,
      isRecurring: false,
      categoryId: null,
      importBatchId: null,
    });
    const detectorFindings =
      anomalyPrisma.anomalyAlert.create.mock.calls.length > 0
        ? anomalyPrisma.anomalyAlert.create.mock.calls[0][0].data.params.findings
        : [];

    // Sanity: with exactly one real prior purchase (below minPoints=2), the
    // CORRECT result on both paths is "no finding" — not a vacuous pass because
    // some unrelated bug made both sides empty for the wrong reason.
    expect(ocrFindings).toEqual([]);

    // The actual claim under test. If AnomalyService.detectPriceOvercharge ever
    // again omits passing `expense.id` as the exclusion (or getProductTrendsFor
    // stops honoring it), the fake Prisma above would return BOTH rows to the
    // detector — median([20, 30]) = 25, changePct = (30-25)/25 = 20% >= 15%,
    // overpaid = 5 >= minAmount — and this assertion would fail with
    // detectorFindings holding one finding while ocrFindings stays empty.
    expect(detectorFindings).toEqual(ocrFindings);
  });
});
