import {
  median,
  groupReceiptLines,
  checkReceiptPrices,
  perUnitPrice,
  RECEIPT_CHECK_DEFAULTS,
  resolveReceiptCheckConfig,
} from './receipt-check.util';

const NOW = new Date('2026-07-25T12:00:00Z');

describe('median', () => {
  it('returns the middle value for an odd count', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('averages the two middle values for an even count', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('perUnitPrice', () => {
  it('uses unitPrice as-is when quantity is 1', () => {
    expect(perUnitPrice({ quantity: 1, unitPrice: 10, totalPrice: 10 })).toBe(10);
  });

  it('derives totalPrice / quantity when quantity > 1', () => {
    // A 2-pack line where unitPrice (if present at all) is often the pack price,
    // not the per-unit price — totalPrice/quantity is authoritative here.
    expect(perUnitPrice({ quantity: 2, unitPrice: 44, totalPrice: 44 })).toBe(22);
  });

  it('falls back to totalPrice when unitPrice is missing (undefined)', () => {
    expect(perUnitPrice({ quantity: 1, unitPrice: undefined, totalPrice: 12.5 })).toBe(12.5);
  });

  it('falls back to totalPrice when unitPrice is null', () => {
    expect(perUnitPrice({ quantity: 1, unitPrice: null, totalPrice: 8 })).toBe(8);
  });

  it('falls back to totalPrice when unitPrice is a stored 0', () => {
    // ExpenseItem.unitPrice defaults to 0 on the DB column — a stored 0 must
    // never be reported as "the" price.
    expect(perUnitPrice({ quantity: 1, unitPrice: 0, totalPrice: 7 })).toBe(7);
  });

  it('treats a missing/non-positive quantity as the qty<=1 branch', () => {
    expect(perUnitPrice({ quantity: undefined, unitPrice: 5, totalPrice: 5 })).toBe(5);
  });
});

describe('groupReceiptLines', () => {
  it('merges duplicate lines with a quantity-weighted unit price', () => {
    const out = groupReceiptLines([
      { canonicalName: 'Piwo Zubr', unitPrice: 3, quantity: 2 },
      { canonicalName: 'Piwo Zubr', unitPrice: 6, quantity: 1 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(3);
    // (3*2 + 6*1) / 3 = 4
    expect(out[0].unitPrice).toBe(4);
  });

  it('drops lines with a blank product name and defaults a non-positive quantity to 1', () => {
    const out = groupReceiptLines([
      { canonicalName: '   ', unitPrice: 5, quantity: 1 },
      { canonicalName: 'Chleb', unitPrice: 5, quantity: 0 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(1);
  });
});

describe('checkReceiptPrices — baseline', () => {
  it('uses the median of prior prices, so one promo price cannot manufacture a finding', () => {
    const res = checkReceiptPrices({
      lines: [{ canonicalName: 'Kawa', unitPrice: 24, quantity: 1 }],
      history: [
        {
          canonicalName: 'Kawa',
          currency: 'PLN',
          // median = 20; a single 12 zł promo does not drag the baseline down
          points: [
            { date: '2026-07-01', price: 20 },
            { date: '2026-07-08', price: 12 },
            { date: '2026-07-15', price: 20 },
          ],
        },
      ],
      merchant: 'Biedronka',
      currencyCode: 'PLN',
      now: NOW,
    });
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0].baselineUnitPrice).toBe(20);
    expect(res.findings[0].changePct).toBe(20);
    expect(res.findings[0].overpaidAmount).toBe(4);
    expect(res.findings[0].source).toBe('personal');
    expect(res.findings[0].confidence).toBe('high');
  });

  it('multiplies the gap by quantity', () => {
    const res = checkReceiptPrices({
      lines: [{ canonicalName: 'Kawa', unitPrice: 24, quantity: 3 }],
      history: [
        {
          canonicalName: 'Kawa',
          currency: 'PLN',
          points: [
            { date: '2026-07-01', price: 20 },
            { date: '2026-07-15', price: 20 },
          ],
        },
      ],
      merchant: 'Biedronka',
      currencyCode: 'PLN',
      now: NOW,
    });
    expect(res.findings[0].overpaidAmount).toBe(12);
    // exactly 2 prior points → low confidence
    expect(res.findings[0].confidence).toBe('low');
  });

  it('returns nothing when the product has no history', () => {
    const res = checkReceiptPrices({
      lines: [{ canonicalName: 'Nowy Produkt', unitPrice: 99, quantity: 1 }],
      history: [],
      merchant: 'Biedronka',
      currencyCode: 'PLN',
      now: NOW,
    });
    expect(res.findings).toEqual([]);
  });

  it('ignores points older than the lookback window', () => {
    const res = checkReceiptPrices({
      lines: [{ canonicalName: 'Kawa', unitPrice: 24, quantity: 1 }],
      history: [
        {
          canonicalName: 'Kawa',
          currency: 'PLN',
          points: [
            { date: '2025-01-01', price: 10 },
            { date: '2025-01-02', price: 10 },
          ],
        },
      ],
      merchant: 'Biedronka',
      currencyCode: 'PLN',
      now: NOW,
      config: RECEIPT_CHECK_DEFAULTS,
    });
    expect(res.findings).toEqual([]);
  });
});

const priorPoints = (price: number, count: number): { date: string; price: number }[] =>
  Array.from({ length: count }, (_, i) => ({ date: `2026-07-0${i + 1}`, price }));

const check = (
  line: { canonicalName: string; unitPrice: number; quantity: number },
  points: { date: string; price: number }[],
) =>
  checkReceiptPrices({
    lines: [line],
    history: [{ canonicalName: line.canonicalName, currency: 'PLN', points }],
    merchant: 'Biedronka',
    currencyCode: 'PLN',
    now: NOW,
    config: RECEIPT_CHECK_DEFAULTS,
  });

describe('checkReceiptPrices — gates', () => {
  it('needs at least minPoints prior purchases', () => {
    const res = check({ canonicalName: 'Kawa', unitPrice: 30, quantity: 1 }, priorPoints(20, 1));
    expect(res.findings).toEqual([]);
  });

  it('ignores a rise below minRisePct', () => {
    // 20 → 22 is +10%, under the 15% floor
    const res = check({ canonicalName: 'Kawa', unitPrice: 22, quantity: 1 }, priorPoints(20, 2));
    expect(res.findings).toEqual([]);
  });

  it('drops a rise above maxRisePct as a probable pack-size change, and counts it', () => {
    // 20 → 60 is +200%
    const res = check({ canonicalName: 'Mleko', unitPrice: 60, quantity: 1 }, priorPoints(20, 2));
    expect(res.findings).toEqual([]);
    expect(res.stats.droppedByCap).toBe(1);
  });

  it('ignores a gap smaller than minAmount', () => {
    // 2.00 → 2.40 is +20% but only 0.40 zł
    const res = check({ canonicalName: 'Bulka', unitPrice: 2.4, quantity: 1 }, priorPoints(2, 2));
    expect(res.findings).toEqual([]);
  });

  it('never compares across currencies', () => {
    const res = checkReceiptPrices({
      lines: [{ canonicalName: 'Kawa', unitPrice: 30, quantity: 1 }],
      history: [{ canonicalName: 'Kawa', currency: 'EUR', points: priorPoints(20, 3) }],
      merchant: 'Biedronka',
      currencyCode: 'PLN',
      now: NOW,
    });
    expect(res.findings).toEqual([]);
  });

  it('produces no finding for a NaN line price instead of "about NaN PLN more"', () => {
    // The line price is unvalidated LLM output — every comparison against NaN
    // is false, so without an explicit gate a NaN would sail through minPoints,
    // minRisePct, maxRisePct and minAmount and still get pushed as a finding.
    const res = check({ canonicalName: 'Kawa', unitPrice: NaN, quantity: 1 }, priorPoints(20, 3));
    expect(res.findings).toEqual([]);
  });

  it('produces no finding for a zero or negative line price', () => {
    const res = check({ canonicalName: 'Kawa', unitPrice: 0, quantity: 1 }, priorPoints(20, 3));
    expect(res.findings).toEqual([]);
  });

  it('returns only the top maxFindings, ranked by amount', () => {
    const res = checkReceiptPrices({
      lines: [
        { canonicalName: 'A', unitPrice: 26, quantity: 1 },
        { canonicalName: 'B', unitPrice: 30, quantity: 1 },
        { canonicalName: 'C', unitPrice: 36, quantity: 1 },
      ],
      history: [
        { canonicalName: 'A', currency: 'PLN', points: priorPoints(20, 2) },
        { canonicalName: 'B', currency: 'PLN', points: priorPoints(20, 2) },
        { canonicalName: 'C', currency: 'PLN', points: priorPoints(20, 2) },
      ],
      merchant: 'Biedronka',
      currencyCode: 'PLN',
      now: NOW,
      config: { ...RECEIPT_CHECK_DEFAULTS, maxFindings: 2 },
    });
    expect(res.findings.map((f) => f.canonicalName)).toEqual(['C', 'B']);
  });
});

describe('community fallback', () => {
  it('uses a community baseline when personal history is too thin', () => {
    const res = checkReceiptPrices({
      lines: [{ canonicalName: 'Kawa', unitPrice: 30, quantity: 1 }],
      history: [{ canonicalName: 'Kawa', currency: 'PLN', points: priorPoints(20, 1) }],
      merchant: 'Biedronka',
      currencyCode: 'PLN',
      now: NOW,
      community: [{ canonicalName: 'Kawa', medianPrice: 20, currency: 'PLN' }],
    });
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0].source).toBe('community');
    expect(res.findings[0].confidence).toBe('low');
  });

  it('prefers personal history over community when both are available', () => {
    const res = checkReceiptPrices({
      lines: [{ canonicalName: 'Kawa', unitPrice: 30, quantity: 1 }],
      history: [{ canonicalName: 'Kawa', currency: 'PLN', points: priorPoints(20, 3) }],
      merchant: 'Biedronka',
      currencyCode: 'PLN',
      now: NOW,
      community: [{ canonicalName: 'Kawa', medianPrice: 10, currency: 'PLN' }],
    });
    expect(res.findings[0].source).toBe('personal');
    expect(res.findings[0].baselineUnitPrice).toBe(20);
  });

  it('ignores a community baseline in another currency', () => {
    const res = checkReceiptPrices({
      lines: [{ canonicalName: 'Kawa', unitPrice: 30, quantity: 1 }],
      history: [],
      merchant: 'Biedronka',
      currencyCode: 'PLN',
      now: NOW,
      community: [{ canonicalName: 'Kawa', medianPrice: 20, currency: 'EUR' }],
    });
    expect(res.findings).toEqual([]);
  });

  it('never throws when minPoints is configured to 0 and there is no history and no community baseline', () => {
    const res = checkReceiptPrices({
      lines: [{ canonicalName: 'Kawa', unitPrice: 30, quantity: 1 }],
      history: [],
      merchant: 'Biedronka',
      currencyCode: 'PLN',
      now: NOW,
      config: { ...RECEIPT_CHECK_DEFAULTS, minPoints: 0 },
    });
    expect(res.findings).toEqual([]);
  });
});

describe('resolveReceiptCheckConfig', () => {
  it('falls back to the defaults when nothing is set', () => {
    expect(resolveReceiptCheckConfig({})).toEqual(RECEIPT_CHECK_DEFAULTS);
  });

  it('reads overrides from the environment', () => {
    const cfg = resolveReceiptCheckConfig({ RECEIPT_CHECK_MIN_RISE_PCT: '25', RECEIPT_CHECK_MAX_FINDINGS: '3' });
    expect(cfg.minRisePct).toBe(25);
    expect(cfg.maxFindings).toBe(3);
    expect(cfg.minPoints).toBe(RECEIPT_CHECK_DEFAULTS.minPoints);
  });

  it('ignores a non-numeric override instead of producing NaN', () => {
    expect(resolveReceiptCheckConfig({ RECEIPT_CHECK_MIN_RISE_PCT: 'abc' }).minRisePct).toBe(
      RECEIPT_CHECK_DEFAULTS.minRisePct,
    );
  });

  it('treats an empty string as unset and falls back to the default', () => {
    expect(resolveReceiptCheckConfig({ RECEIPT_CHECK_MIN_RISE_PCT: '' }).minRisePct).toBe(
      RECEIPT_CHECK_DEFAULTS.minRisePct,
    );
  });

  it('treats a whitespace-only string as unset and falls back to the default', () => {
    expect(resolveReceiptCheckConfig({ RECEIPT_CHECK_MIN_RISE_PCT: '  \t\n  ' }).minRisePct).toBe(
      RECEIPT_CHECK_DEFAULTS.minRisePct,
    );
  });

  it('honours an explicit zero when written as "0"', () => {
    expect(resolveReceiptCheckConfig({ RECEIPT_CHECK_MIN_RISE_PCT: '0' }).minRisePct).toBe(0);
  });

  it('clamps every negative override to 0 instead of inverting behavior', () => {
    // A negative maxFindings would slice() from the wrong end, a negative
    // lookbackWeeks would flip the cutoff into the future, etc. 0 stays a
    // legitimate kill-switch — clamp to 0, never up to 1.
    const cfg = resolveReceiptCheckConfig({
      RECEIPT_CHECK_LOOKBACK_WEEKS: '-4',
      RECEIPT_CHECK_MIN_POINTS: '-2',
      RECEIPT_CHECK_MIN_RISE_PCT: '-15',
      RECEIPT_CHECK_MAX_RISE_PCT: '-100',
      RECEIPT_CHECK_MIN_AMOUNT: '-1',
      RECEIPT_CHECK_MAX_FINDINGS: '-5',
    });
    expect(cfg).toEqual({
      lookbackWeeks: 0,
      minPoints: 0,
      minRisePct: 0,
      maxRisePct: 0,
      minAmount: 0,
      maxFindings: 0,
    });
  });
});
