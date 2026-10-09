import {
  buildFxBody,
  convertedPreview,
  entryCurrencies,
  fxAmountParts,
  fxIssue,
  initialFxState,
  isForeignExpense,
  isFxRateUnavailable,
  parseRate,
} from '../groupFx';

/** ABA-654: the app never converts a stored expense; it previews, and decides what to send. */

const foreign = { amount: 51.8, originalAmount: 12, originalCurrency: 'EUR', fxRate: 4.3167 };
const plain = { amount: 50, originalAmount: null, originalCurrency: null, fxRate: null };

describe('entryCurrencies', () => {
  it('puts the group currency first and lists it once', () => {
    const list = entryCurrencies('PLN');
    expect(list[0]).toBe('PLN');
    expect(list.filter((c) => c === 'PLN')).toHaveLength(1);
    expect(list).toEqual(expect.arrayContaining(['EUR', 'USD', 'GBP']));
  });

  it('keeps a group currency outside the app list as the first option', () => {
    expect(entryCurrencies('CZK')[0]).toBe('CZK');
  });
});

describe('isForeignExpense / fxAmountParts', () => {
  it('is foreign only with an original currency other than the group one', () => {
    expect(isForeignExpense(foreign, 'PLN')).toBe(true);
    expect(isForeignExpense(plain, 'PLN')).toBe(false);
    expect(isForeignExpense({ originalAmount: 50, originalCurrency: 'PLN' }, 'PLN')).toBe(false);
  });

  it('formats both stored figures, never recomputing the converted one', () => {
    const parts = fxAmountParts(foreign, 'PLN');
    expect(parts).not.toBeNull();
    expect(parts!.original).toContain('12');
    expect(parts!.converted).toContain('51');
    expect(parts!.line).toBe(`${parts!.original} → ${parts!.converted}`);
    // A different stored rate would not change what is shown: the amount is read as stored.
    expect(fxAmountParts({ ...foreign, fxRate: 99 } as any, 'PLN')).toEqual(parts);
    expect(fxAmountParts(plain, 'PLN')).toBeNull();
  });
});

describe('rate input', () => {
  it('parses comma and dot, rejects zero, negatives and junk', () => {
    expect(parseRate('4,3167')).toBe(4.3167);
    expect(parseRate(' 4.3167 ')).toBe(4.3167);
    expect(parseRate('0')).toBe(0);
    expect(parseRate('-2')).toBe(0);
    expect(parseRate('abc')).toBe(0);
    expect(parseRate('')).toBe(0);
  });

  it('previews the stored figure to the cent', () => {
    expect(convertedPreview(12, 4.3167)).toBe(51.8);
    expect(convertedPreview(0, 4)).toBe(0);
    expect(convertedPreview(10, 0)).toBe(0);
  });

  it('needs a usable rate only for a foreign currency', () => {
    expect(fxIssue('PLN', 'PLN', '')).toBeNull();
    expect(fxIssue('EUR', 'PLN', '')).toBe('rate');
    expect(fxIssue('EUR', 'PLN', '4.3')).toBeNull();
  });
});

describe('initialFxState', () => {
  it('restores what an edited foreign expense was entered with', () => {
    expect(initialFxState(foreign as any, 'PLN')).toEqual({ currency: 'EUR', rateText: '4.3167', entryAmountText: '12' });
  });

  it('starts a new or group-currency expense in the group currency', () => {
    expect(initialFxState(null, 'PLN')).toEqual({ currency: 'PLN', rateText: '', entryAmountText: '' });
    expect(initialFxState(plain as any, 'PLN')).toEqual({ currency: 'PLN', rateText: '', entryAmountText: '50' });
  });
});

describe('buildFxBody', () => {
  it('always sends the entry currency, and the rate only when the user overrode it', () => {
    expect(buildFxBody({ currency: 'PLN', groupCurrency: 'PLN', rateText: '', rateEdited: false })).toEqual({ currencyCode: 'PLN' });
    expect(buildFxBody({ currency: 'EUR', groupCurrency: 'PLN', rateText: '4.3', rateEdited: false })).toEqual({ currencyCode: 'EUR' });
    expect(buildFxBody({ currency: 'EUR', groupCurrency: 'PLN', rateText: '4,25', rateEdited: true })).toEqual({
      currencyCode: 'EUR',
      fxRate: 4.25,
    });
  });

  it('never sends a rate for the group currency, or an unusable one', () => {
    expect(buildFxBody({ currency: 'PLN', groupCurrency: 'PLN', rateText: '4', rateEdited: true })).toEqual({ currencyCode: 'PLN' });
    expect(buildFxBody({ currency: 'EUR', groupCurrency: 'PLN', rateText: 'x', rateEdited: true })).toEqual({ currencyCode: 'EUR' });
  });
});

describe('isFxRateUnavailable', () => {
  it('recognises the server refusal only', () => {
    expect(isFxRateUnavailable({ status: 400, code: 'FX_RATE_UNAVAILABLE' })).toBe(true);
    expect(isFxRateUnavailable({ status: 400, code: 'CURRENCY_UNSUPPORTED' })).toBe(false);
    expect(isFxRateUnavailable(null)).toBe(false);
  });
});
