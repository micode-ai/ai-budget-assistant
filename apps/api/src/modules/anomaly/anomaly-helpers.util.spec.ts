import {
  detectCycle,
  DUP_DAY_MS,
  expensePayee,
  isPushReceiptPair,
  monthKey,
  normalizeMerchant,
  payeesLooselyMatch,
  pickManualReceiptCounterpart,
  pickPushReceiptCounterpart,
} from './anomaly-helpers.util';

describe('pure helpers', () => {
  it('normalizeMerchant trims and lowercases', () => {
    expect(normalizeMerchant('  Netflix ')).toBe('netflix');
  });

  it('expensePayee prefers merchant over description', () => {
    expect(expensePayee({ merchant: ' Netflix ', description: 'Other' })).toBe('netflix');
  });

  it('expensePayee falls back to description when merchant is absent', () => {
    expect(expensePayee({ merchant: null, description: '  Coffee  ' })).toBe('coffee');
  });

  it('expensePayee falls back to description when merchant is empty string', () => {
    expect(expensePayee({ merchant: '', description: 'Tea' })).toBe('tea');
  });

  it('expensePayee returns empty string when both merchant and description are absent', () => {
    expect(expensePayee({ merchant: null, description: null })).toBe('');
  });

  it('DUP_DAY_MS equals 24 * 60 * 60 * 1000', () => {
    expect(DUP_DAY_MS).toBe(86_400_000);
  });

  it('monthKey formats UTC year-month', () => {
    expect(monthKey(new Date(Date.UTC(2026, 5, 10)))).toBe('2026-06');
  });

  it('detectCycle: 3 charges ~30 days apart → monthly', () => {
    expect(detectCycle([new Date('2026-04-01'), new Date('2026-05-01'), new Date('2026-05-31')])).toBe('monthly');
  });

  it('detectCycle: 3 charges 7 days apart → weekly', () => {
    expect(detectCycle([new Date('2026-05-17'), new Date('2026-05-24'), new Date('2026-05-31')])).toBe('weekly');
  });

  it('detectCycle: gap of 24 days → null (below monthly window)', () => {
    expect(detectCycle([new Date('2026-04-07'), new Date('2026-05-01'), new Date('2026-05-31')])).toBe(null);
  });

  it('detectCycle: gap of 36 days → null (above monthly window)', () => {
    expect(detectCycle([new Date('2026-03-26'), new Date('2026-05-01'), new Date('2026-05-31')])).toBe(null);
  });

  it('detectCycle: fewer than 3 dates → null', () => {
    expect(detectCycle([new Date('2026-05-01'), new Date('2026-05-31')])).toBe(null);
  });
});

describe('push ↔ receipt loose matching (ABA-625)', () => {
  it('matches a bank push merchant against the receipt store name', () => {
    expect(payeesLooselyMatch('ZABKA Z5712 K.1 WARSZAWA', 'Żabka')).toBe(true);
    expect(payeesLooselyMatch('LIDL SP. Z O.O. SP. K.', 'LIDL WARSZAWA UL. MARYWILSKA')).toBe(true);
    expect(payeesLooselyMatch('JMP S.A. BIEDRONKA 1234', 'Biedronka')).toBe(true);
    expect(payeesLooselyMatch('Łódź Kawiarnia Ślimak', 'SLIMAK')).toBe(true);
  });

  it('does not match on legal-form or city words alone', () => {
    expect(payeesLooselyMatch('ZABKA WARSZAWA', 'Rossmann Warszawa')).toBe(false);
    expect(payeesLooselyMatch('Kaufland Polska sp. z o.o.', 'Lidl Polska sp. z o.o.')).toBe(false);
  });

  it('never matches an empty label', () => {
    expect(payeesLooselyMatch('', 'Zabka')).toBe(false);
    expect(payeesLooselyMatch('Zabka', '  ')).toBe(false);
  });

  it('isPushReceiptPair is symmetric and exclusive to notification/ocr', () => {
    expect(isPushReceiptPair('notification', 'ocr')).toBe(true);
    expect(isPushReceiptPair('ocr', 'notification')).toBe(true);
    expect(isPushReceiptPair('import', 'ocr')).toBe(false);
    expect(isPushReceiptPair('notification', 'notification')).toBe(false);
    expect(isPushReceiptPair('ocr', null)).toBe(false);
  });

  const receipt = { merchant: 'Żabka', description: null, source: 'ocr' };

  it('prefers the loosely-matching counterpart among several', () => {
    const picked = pickPushReceiptCounterpart(receipt, [
      { id: 'a', merchant: 'ROSSMANN 123', description: null, source: 'notification' },
      { id: 'b', merchant: 'ZABKA Z5712', description: null, source: 'notification' },
    ]);
    expect(picked?.id).toBe('b');
  });

  it('accepts a single counterpart with an unrelated payee (brand vs legal name)', () => {
    const picked = pickPushReceiptCounterpart({ merchant: 'Jeronimo Martins Polska', description: null, source: 'ocr' }, [
      { id: 'a', merchant: 'BIEDRONKA', description: null, source: 'notification' },
    ]);
    expect(picked?.id).toBe('a');
  });

  it('returns null when several counterparts are ambiguous', () => {
    const picked = pickPushReceiptCounterpart({ merchant: 'Jeronimo Martins Polska', description: null, source: 'ocr' }, [
      { id: 'a', merchant: 'BIEDRONKA', description: null, source: 'notification' },
      { id: 'b', merchant: 'ROSSMANN', description: null, source: 'notification' },
    ]);
    expect(picked).toBeNull();
  });

  it('ignores candidates that are not the other capture channel', () => {
    expect(
      pickPushReceiptCounterpart(receipt, [{ id: 'a', merchant: 'ZABKA', description: null, source: 'manual' }]),
    ).toBeNull();
    expect(
      pickPushReceiptCounterpart({ merchant: 'Zabka', description: null, source: 'manual' }, [
        { id: 'a', merchant: 'ZABKA Z1', description: null, source: 'notification' },
      ]),
    ).toBeNull();
  });
});

import { suppressionSubject } from './anomaly-helpers.util';

describe('suppressionSubject', () => {
  it('keys a spike on the category', () => {
    expect(suppressionSubject('category_spike', {}, 'c1')).toBe('cat:c1');
    expect(suppressionSubject('category_spike', {}, null)).toBeNull();
  });
  it('keys other types on the normalized merchant', () => {
    expect(suppressionSubject('price_increase', { merchant: '  Rent Co ' })).toBe('m:rent co');
    expect(suppressionSubject('duplicate_charge', { merchant: '' })).toBeNull();
  });
});

describe('manual ↔ receipt loose matching (ABA-743)', () => {
  const receipt = { merchant: 'Netto nr 541', description: 'Netto nr 541 (2 items)', source: 'ocr' };

  it('pairs a hand-typed shop name with the branch the receipt prints', () => {
    expect(
      pickManualReceiptCounterpart(receipt, [{ id: 'm', merchant: null, description: 'Netto', source: 'manual' }]),
    ).toMatchObject({ id: 'm' });
    expect(
      pickManualReceiptCounterpart({ merchant: null, description: 'netto', source: 'manual' }, [
        { id: 'r', ...receipt },
      ]),
    ).toMatchObject({ id: 'r' });
  });

  it('never pairs on amount alone, nor a label-less manual row', () => {
    expect(pickManualReceiptCounterpart(receipt, [{ id: 'm', merchant: null, description: 'Lunch', source: 'manual' }])).toBeNull();
    expect(pickManualReceiptCounterpart({ merchant: null, description: null, source: 'manual' }, [{ id: 'r', ...receipt }])).toBeNull();
  });

  it('ignores every other channel pair', () => {
    expect(pickManualReceiptCounterpart(receipt, [{ id: 'n', merchant: 'NETTO', description: null, source: 'notification' }])).toBeNull();
    expect(
      pickManualReceiptCounterpart({ merchant: 'Netto', description: null, source: 'manual' }, [
        { id: 'm2', merchant: 'Netto nr 541', description: null, source: 'manual' },
      ]),
    ).toBeNull();
  });
});
