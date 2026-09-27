/**
 * ABA-618 — a receipt-derived CP01 rate of ~35 % against single-digit official
 * food inflation. Reproduced end to end from realistic receipt rows: the index
 * is sound for ordinary products, but ONE product whose pack size changed under
 * the same name (e.g. two sizes merged into one product) dominates it, and the
 * half-year → annual compounding then doubles the error.
 */
import { PriceHistoryService } from '../../../price-history/price-history.service';
import { annualiseHalfYearPct, computePersonalInflation, RECEIPT_MAX_GAP_PP } from '../real-salary.util';

jest.mock('openai', () => ({ __esModule: true, default: jest.fn().mockImplementation(() => ({})) }));

const NOW = new Date();
const monthsAgo = (n: number) => new Date(NOW.getFullYear(), NOW.getMonth() - n, 15);

function item(id: string, name: string, price: number, date: Date) {
  return {
    id, canonicalName: name, unitPrice: price, quantity: 1, totalPrice: price,
    expense: { date, merchant: 'Corner Shop', currencyCode: 'PLN', locationLat: null, locationLng: null },
  };
}

function rows() {
  const out = [];
  // Eleven ordinary products, each bought three times on each side of the
  // split, up 2 % over the half-year.
  for (let p = 0; p < 11; p++) {
    for (const m of [9, 8, 7]) out.push(item(`p${p}-${m}`, `Product ${p}`, 10, monthsAgo(m)));
    for (const m of [3, 2, 1]) out.push(item(`p${p}-${m}`, `Product ${p}`, 10.2, monthsAgo(m)));
  }
  // One product whose pack size changed under the same name: a small pack
  // before, a big pack after.
  out.push(item('c-9', 'Coffee beans', 12, monthsAgo(9)));
  out.push(item('c-8', 'Coffee beans', 12, monthsAgo(8)));
  out.push(item('c-2', 'Coffee beans', 37.35, monthsAgo(2)));
  out.push(item('c-1', 'Coffee beans', 37.35, monthsAgo(1)));
  return out;
}

async function receiptIndex() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    expenseItem: { findMany: jest.fn().mockResolvedValue(rows()) },
    productAlias: { findMany: jest.fn().mockResolvedValue([]) },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cache: any = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
  return new PriceHistoryService(prisma, cache).getPriceHistory('acc', '12m');
}

describe('ABA-618 — receipt CP01 rate against official food inflation', () => {
  const official = { TOTAL: 3.5, CP01: 4.2 };

  it('one pack-size break drives the 12-product receipt index to a ~35 % annual rate', async () => {
    const r = await receiptIndex();
    expect(r.productCount).toBe(12);
    expect(r.inflationIndex).toBe(16.2); // half-year, weighted mean of per-product changes
    expect(annualiseHalfYearPct(r.inflationIndex)).toBeCloseTo(35.0, 1);
    // Without the coffee product the same basket is +2 % a half-year.
    const others = r.products.filter((p) => p.canonicalName !== 'Coffee beans');
    expect(others.every((p) => p.priceChangePct === 2)).toBe(true);
  });

  it('prices CP01 from the official rate when the receipt rate is implausibly far from it', async () => {
    const r = await receiptIndex();
    const res = computePersonalInflation({
      spend: [{ division: 'CP01', amount: 1000 }, { division: 'CP04', amount: 1000 }],
      officialRates: official,
      receiptIndexPct: annualiseHalfYearPct(r.inflationIndex),
      receiptProductCount: r.productCount,
    })!;
    expect(res.breakdown.find((b) => b.division === 'CP01')).toEqual({ division: 'CP01', weight: 0.5, ratePct: 4.2, source: 'official' });
    expect(res.inflationPct).toBe(3.9); // (4.2 + 3.5) / 2, not (35.0 + 3.5) / 2
  });

  it(`keeps a receipt rate within ${RECEIPT_MAX_GAP_PP} pp of the official food rate`, () => {
    const res = computePersonalInflation({
      spend: [{ division: 'CP01', amount: 1000 }],
      officialRates: official, receiptIndexPct: 4.2 + RECEIPT_MAX_GAP_PP, receiptProductCount: 12,
    })!;
    expect(res.breakdown[0].source).toBe('receipts');
  });

  it('compares against the TOTAL rate when the country has no CP01 cell', () => {
    const res = computePersonalInflation({
      spend: [{ division: 'CP01', amount: 1000 }],
      officialRates: { TOTAL: 3.5 }, receiptIndexPct: 3.5 - RECEIPT_MAX_GAP_PP - 0.1, receiptProductCount: 12,
    })!;
    expect(res.breakdown[0]).toMatchObject({ source: 'official', ratePct: 3.5 });
  });

  it('with no official data an implausible receipt rate is not an answer at all', () => {
    expect(computePersonalInflation({
      spend: [{ division: 'CP01', amount: 1000 }],
      officialRates: {}, receiptIndexPct: 35.1, receiptProductCount: 12,
    })).toBeNull();
    expect(computePersonalInflation({
      spend: [{ division: 'CP01', amount: 1000 }],
      officialRates: {}, receiptIndexPct: 12, receiptProductCount: 12,
    })!.breakdown[0].source).toBe('receipts');
  });
});
