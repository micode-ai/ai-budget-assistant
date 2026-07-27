import {
  isValidPaymentHandle,
  normalizePaymentHandle,
  getPaymentConsequence,
  applyPaymentInfoPatch,
  getAvailableMethods,
  isValidPaymentMethodList,
  toPaymentMethodPayload,
  seedPaymentMethodRows,
  applyPaymentMethodsPatch,
  ALL_PAYMENT_METHODS,
  type PaymentMethodRow,
} from '../paymentInfo';

describe('isValidPaymentHandle', () => {
  it('accepts a typical Revolut/PayPal-style handle', () => {
    expect(isValidPaymentHandle('john-doe123')).toBe(true);
  });

  it('accepts a BLIK phone number with a leading + and spaces', () => {
    expect(isValidPaymentHandle('+48 123 456 789')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isValidPaymentHandle('')).toBe(false);
  });

  it('rejects a disallowed character (e.g. @)', () => {
    expect(isValidPaymentHandle('john@doe')).toBe(false);
  });

  it('accepts exactly 50 characters', () => {
    expect(isValidPaymentHandle('a'.repeat(50))).toBe(true);
  });

  it('rejects 51 characters (over the server cap)', () => {
    expect(isValidPaymentHandle('a'.repeat(51))).toBe(false);
  });
});

describe('getPaymentConsequence', () => {
  it('maps revolut and paypal to "link"', () => {
    expect(getPaymentConsequence('revolut')).toBe('link');
    expect(getPaymentConsequence('paypal')).toBe('link');
  });

  it('maps blik to "manual"', () => {
    expect(getPaymentConsequence('blik')).toBe('manual');
  });

  it('maps cash and other to "instructions" — they now render the handle as free-text instructions on the guest page, not nothing', () => {
    expect(getPaymentConsequence('cash')).toBe('instructions');
    expect(getPaymentConsequence('other')).toBe('instructions');
  });

  it('maps null (no method set at all) to "none"', () => {
    expect(getPaymentConsequence(null)).toBe('none');
  });
});

describe('applyPaymentInfoPatch', () => {
  it('always applies locally', () => {
    const applyLocal = jest.fn();
    const persist = jest.fn().mockResolvedValue(undefined);
    applyPaymentInfoPatch({ paymentMethod: 'revolut', paymentHandle: 'john' }, { applyLocal, persist });
    expect(applyLocal).toHaveBeenCalledWith({ paymentMethod: 'revolut', paymentHandle: 'john' });
  });

  it('persists the same patch', () => {
    const persist = jest.fn().mockResolvedValue(undefined);
    applyPaymentInfoPatch({ paymentMethod: null, paymentHandle: null }, { applyLocal: jest.fn(), persist });
    expect(persist).toHaveBeenCalledWith({ paymentMethod: null, paymentHandle: null });
  });

  it('routes a rejected persist to onPersistError (non-fatal)', async () => {
    const err = new Error('offline');
    const persist = jest.fn().mockRejectedValue(err);
    const onPersistError = jest.fn();
    applyPaymentInfoPatch(
      { paymentMethod: 'blik', paymentHandle: '+48123123123' },
      { applyLocal: jest.fn(), persist, onPersistError },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(onPersistError).toHaveBeenCalledWith(err);
  });
});

describe('getAvailableMethods', () => {
  it('offers all 5 methods when the list is empty', () => {
    expect(getAvailableMethods([], 0)).toEqual(ALL_PAYMENT_METHODS);
  });

  it('excludes a method already claimed by a different row', () => {
    const rows: PaymentMethodRow[] = [
      { method: 'revolut', handle: 'a' },
      { method: 'blik', handle: 'b' },
    ];
    // Picking for a brand-new third row — both existing rows are "others".
    expect(getAvailableMethods(rows, 2)).toEqual(['paypal', 'cash', 'other']);
  });

  it("keeps a row's OWN current method available when re-opening its own picker", () => {
    const rows: PaymentMethodRow[] = [
      { method: 'revolut', handle: 'a' },
      { method: 'blik', handle: 'b' },
    ];
    // Row 0's own method ('revolut') must still be offered to row 0 itself.
    expect(getAvailableMethods(rows, 0)).toEqual(['revolut', 'paypal', 'cash', 'other']);
  });

  it('offers nothing once all 5 methods are already used by other rows', () => {
    const rows: PaymentMethodRow[] = ALL_PAYMENT_METHODS.map((method) => ({ method, handle: 'x' }));
    expect(getAvailableMethods(rows, 5)).toEqual([]);
  });
});

describe('isValidPaymentMethodList', () => {
  it('accepts an empty list (clears every configured method)', () => {
    expect(isValidPaymentMethodList([])).toBe(true);
  });

  it('accepts a full 5-row list with distinct methods and valid handles', () => {
    const rows: PaymentMethodRow[] = ALL_PAYMENT_METHODS.map((method) => ({ method, handle: 'ok-handle' }));
    expect(isValidPaymentMethodList(rows)).toBe(true);
  });

  it('rejects more than 5 rows', () => {
    const rows: PaymentMethodRow[] = [
      ...ALL_PAYMENT_METHODS.map((method) => ({ method, handle: 'ok' })),
      { method: 'revolut', handle: 'dup' },
    ];
    expect(isValidPaymentMethodList(rows)).toBe(false);
  });

  it('rejects a duplicate method across two rows', () => {
    const rows: PaymentMethodRow[] = [
      { method: 'revolut', handle: 'a' },
      { method: 'revolut', handle: 'b' },
    ];
    expect(isValidPaymentMethodList(rows)).toBe(false);
  });

  it('rejects a blank handle (whitespace-only counts as blank)', () => {
    expect(isValidPaymentMethodList([{ method: 'revolut', handle: '   ' }])).toBe(false);
  });

  it('rejects a handle that fails isValidPaymentHandle', () => {
    expect(isValidPaymentMethodList([{ method: 'paypal', handle: 'john@doe' }])).toBe(false);
  });
});

describe('toPaymentMethodPayload', () => {
  it('trims each handle', () => {
    const rows: PaymentMethodRow[] = [{ method: 'revolut', handle: '  spaced-out  ' }];
    expect(toPaymentMethodPayload(rows)).toEqual([{ method: 'revolut', handle: 'spaced-out' }]);
  });

  it('preserves row order', () => {
    const rows: PaymentMethodRow[] = [
      { method: 'blik', handle: '+48123123123' },
      { method: 'revolut', handle: 'rev' },
    ];
    expect(toPaymentMethodPayload(rows)).toEqual([
      { method: 'blik', handle: '+48123123123' },
      { method: 'revolut', handle: 'rev' },
    ]);
  });
});

describe('seedPaymentMethodRows', () => {
  it('seeds from paymentMethods when non-empty, ignoring the legacy pair even if also set', () => {
    const rows = seedPaymentMethodRows({
      paymentMethods: [{ method: 'blik', handle: 'list-blik' }],
      paymentMethod: 'revolut',
      paymentHandle: 'legacy-revolut',
    });
    expect(rows).toEqual([{ method: 'blik', handle: 'list-blik' }]);
  });

  it('falls back to the legacy pair as one pre-filled row when the list is empty', () => {
    const rows = seedPaymentMethodRows({
      paymentMethods: [],
      paymentMethod: 'revolut',
      paymentHandle: 'legacy-revolut',
    });
    expect(rows).toEqual([{ method: 'revolut', handle: 'legacy-revolut' }]);
  });

  it('returns an empty list when neither the list nor the legacy pair is set', () => {
    expect(seedPaymentMethodRows({ paymentMethods: [], paymentMethod: null, paymentHandle: null })).toEqual([]);
  });

  it('returns an empty list for a null/undefined user', () => {
    expect(seedPaymentMethodRows(null)).toEqual([]);
    expect(seedPaymentMethodRows(undefined)).toEqual([]);
  });

  it('does not fall back to a half-set legacy pair (method without handle)', () => {
    expect(seedPaymentMethodRows({ paymentMethods: [], paymentMethod: 'revolut', paymentHandle: null })).toEqual([]);
  });
});

describe('applyPaymentMethodsPatch', () => {
  it('always applies locally', () => {
    const applyLocal = jest.fn();
    const persist = jest.fn().mockResolvedValue(undefined);
    const methods = [{ method: 'revolut' as const, handle: 'john' }];
    applyPaymentMethodsPatch(methods, { applyLocal, persist });
    expect(applyLocal).toHaveBeenCalledWith(methods);
  });

  it('persists the same list', () => {
    const persist = jest.fn().mockResolvedValue(undefined);
    applyPaymentMethodsPatch([], { applyLocal: jest.fn(), persist });
    expect(persist).toHaveBeenCalledWith([]);
  });

  it('routes a rejected persist to onPersistError (non-fatal)', async () => {
    const err = new Error('offline');
    const persist = jest.fn().mockRejectedValue(err);
    const onPersistError = jest.fn();
    applyPaymentMethodsPatch([{ method: 'blik', handle: '+48123123123' }], {
      applyLocal: jest.fn(),
      persist,
      onPersistError,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(onPersistError).toHaveBeenCalledWith(err);
  });
});

describe('normalizePaymentHandle', () => {
  // Revolut and PayPal both DISPLAY usernames as "@name", so that is what a user
  // types — but the stored handle must not carry it: the guest page builds
  // `revolut.me/${encodeURIComponent(handle)}`, so "@name" would yield
  // revolut.me/%40name, a dead link. The field's placeholder used to suggest the
  // "@" form, which made following it an instant validation error.
  it('strips a single leading @', () => {
    expect(normalizePaymentHandle('@mynick')).toBe('mynick');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizePaymentHandle('  mynick  ')).toBe('mynick');
  });

  it('strips the @ after trimming, not before', () => {
    expect(normalizePaymentHandle('  @mynick ')).toBe('mynick');
  });

  it('leaves a handle without @ untouched', () => {
    expect(normalizePaymentHandle('mynick')).toBe('mynick');
  });

  it('leaves a BLIK phone number intact, spaces and plus included', () => {
    expect(normalizePaymentHandle(' +48 123 456 789 ')).toBe('+48 123 456 789');
  });

  it('strips only the FIRST @ — an inner one is genuinely invalid and must still fail validation', () => {
    const out = normalizePaymentHandle('@my@nick');
    expect(out).toBe('my@nick');
    expect(isValidPaymentHandle(out)).toBe(false);
  });

  it('makes the placeholder form pass validation, which is the whole point', () => {
    expect(isValidPaymentHandle('@your-revolut-username')).toBe(false);
    expect(isValidPaymentHandle(normalizePaymentHandle('@your-revolut-username'))).toBe(true);
  });
});
