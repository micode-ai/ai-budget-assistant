import { summariseDeposits, DEPOSIT_TOP_MERCHANTS, DEPOSIT_RECENT_RECEIPTS } from './deposit-summary';

/**
 * The returnable-packaging deposit ("kaucja", "Pfand", "залог за тару") is the
 * one figure on a receipt that survives even when the category split is
 * refused, so this is the arithmetic behind the chat's answer to "how much
 * have I paid in deposits". It is money the user paid, so a wrong number here
 * is a wrong statement about their money — hence every rule is pinned.
 */

/** Identity conversion: everything is already in the display currency. */
const asIs = (amount: number) => amount;

/** Only PLN has a rate; anything else is unconvertible. */
const plnOnly = (amount: number, from: string) => (from === 'PLN' ? amount : null);

describe('summariseDeposits', () => {
  it('sums the deposits and counts the receipts they came from', () => {
    const summary = summariseDeposits(
      [
        { date: '2026-08-01', merchant: 'Biedronka', depositAmount: 4.5, currencyCode: 'PLN' },
        { date: '2026-08-14', merchant: 'Lidl', depositAmount: 2, currencyCode: 'PLN' },
      ],
      asIs,
    );

    expect(summary.total).toBe(6.5);
    expect(summary.receiptCount).toBe(2);
  });

  it('groups by merchant, newest-spending first', () => {
    const summary = summariseDeposits(
      [
        { date: '2026-08-01', merchant: 'Biedronka', depositAmount: 4.5, currencyCode: 'PLN' },
        { date: '2026-08-09', merchant: 'Lidl', depositAmount: 9, currencyCode: 'PLN' },
        { date: '2026-08-14', merchant: 'Biedronka', depositAmount: 1.5, currencyCode: 'PLN' },
      ],
      asIs,
    );

    expect(summary.byMerchant).toEqual([
      { merchant: 'Lidl', amount: 9, receiptCount: 1 },
      { merchant: 'Biedronka', amount: 6, receiptCount: 2 },
    ]);
  });

  it('falls back to the description when a receipt carries no merchant', () => {
    const summary = summariseDeposits(
      [{ date: '2026-08-01', merchant: null, description: 'Zakupy', depositAmount: 3, currencyCode: 'PLN' }],
      asIs,
    );

    expect(summary.byMerchant).toEqual([{ merchant: 'Zakupy', amount: 3, receiptCount: 1 }]);
  });

  it('counts a payee-less receipt in the total but names no merchant for it', () => {
    const summary = summariseDeposits(
      [{ date: '2026-08-01', merchant: null, description: null, depositAmount: 3, currencyCode: 'PLN' }],
      asIs,
    );

    expect(summary.total).toBe(3);
    expect(summary.byMerchant).toEqual([]);
    expect(summary.recent[0].merchant).toBeNull();
  });

  it('excludes an unconvertible row from the total instead of mixing currencies', () => {
    const summary = summariseDeposits(
      [
        { date: '2026-08-01', merchant: 'Biedronka', depositAmount: 4.5, currencyCode: 'PLN' },
        { date: '2026-08-02', merchant: 'Rewe', depositAmount: 25, currencyCode: 'EUR' },
      ],
      plnOnly,
    );

    expect(summary.total).toBe(4.5);
    expect(summary.receiptCount).toBe(1);
    expect(summary.unconvertedCount).toBe(1);
    expect(summary.byMerchant.map((m) => m.merchant)).toEqual(['Biedronka']);
  });

  it('keeps every currency in the native per-currency totals, converted or not', () => {
    const summary = summariseDeposits(
      [
        { date: '2026-08-01', merchant: 'Biedronka', depositAmount: 4.5, currencyCode: 'PLN' },
        { date: '2026-08-02', merchant: 'Rewe', depositAmount: 25, currencyCode: 'EUR' },
        { date: '2026-08-03', merchant: 'Rewe', depositAmount: 0.25, currencyCode: 'EUR' },
      ],
      plnOnly,
    );

    expect(summary.totalsByCurrency).toEqual({ PLN: 4.5, EUR: 25.25 });
  });

  it('rounds the total once, not per row', () => {
    const rows = [1, 2, 3].map((n) => ({
      date: `2026-08-0${n}`,
      merchant: 'Zabka',
      depositAmount: 3.333,
      currencyCode: 'PLN',
    }));

    // Rounding each row first would give 3.33 x 3 = 9.99.
    expect(summariseDeposits(rows, asIs).total).toBe(10);
  });

  it('reads a Prisma Decimal and a Date the way the query returns them', () => {
    const summary = summariseDeposits(
      [{ date: new Date('2026-08-14T00:00:00.000Z'), merchant: 'Lidl', depositAmount: '2.50', currencyCode: 'PLN' }],
      asIs,
    );

    expect(summary.total).toBe(2.5);
    expect(summary.recent).toEqual([{ date: '2026-08-14', merchant: 'Lidl', amount: 2.5 }]);
  });

  it('lists the newest receipts first regardless of the order it was given', () => {
    const summary = summariseDeposits(
      [
        { date: '2026-08-01', merchant: 'Biedronka', depositAmount: 1, currencyCode: 'PLN' },
        { date: '2026-08-20', merchant: 'Lidl', depositAmount: 2, currencyCode: 'PLN' },
      ],
      asIs,
    );

    expect(summary.recent.map((r) => r.date)).toEqual(['2026-08-20', '2026-08-01']);
  });

  it('caps the merchant and receipt lists', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      date: `2026-08-${String(i + 1).padStart(2, '0')}`,
      merchant: `Shop ${i}`,
      depositAmount: i + 1,
      currencyCode: 'PLN',
    }));

    const summary = summariseDeposits(rows, asIs);

    expect(summary.byMerchant).toHaveLength(DEPOSIT_TOP_MERCHANTS);
    expect(summary.recent).toHaveLength(DEPOSIT_RECENT_RECEIPTS);
    // Capping must not change the total — it is a display limit, not a filter.
    expect(summary.total).toBe(78);
    expect(summary.receiptCount).toBe(12);
  });

  it('returns a zero summary rather than NaN when there are no deposits', () => {
    const summary = summariseDeposits([], asIs);

    expect(summary).toEqual({
      total: 0,
      receiptCount: 0,
      totalsByCurrency: {},
      byMerchant: [],
      recent: [],
      unconvertedCount: 0,
    });
  });
});
