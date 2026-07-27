import { isValidPaymentHandle, getPaymentConsequence, applyPaymentInfoPatch } from '../paymentInfo';

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

  it('maps cash, other, and null (no method set) to "none"', () => {
    expect(getPaymentConsequence('cash')).toBe('none');
    expect(getPaymentConsequence('other')).toBe('none');
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
