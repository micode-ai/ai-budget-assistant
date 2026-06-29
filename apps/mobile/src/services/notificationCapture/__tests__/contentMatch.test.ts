/**
 * Unit tests for the notification-capture content-dedup predicate (Tier 1, Case B).
 *
 * All inputs are plain objects — no React Native, no store, no async.
 * Run: npx jest apps/mobile/src/services/notificationCapture/__tests__/contentMatch.test.ts
 */

import {
  contentMatchesExisting,
  payeeOf,
  stubPayeeOf,
  type ParsedNotificationStub,
  type MinimalExpense,
} from '../contentMatch';

// ---------------------------------------------------------------------------
// payeeOf / stubPayeeOf helpers
// ---------------------------------------------------------------------------
describe('payeeOf', () => {
  it('prefers merchant over description', () => {
    expect(payeeOf({ merchant: 'Żabka', description: 'some bank text' })).toBe('żabka');
  });

  it('falls back to description when merchant is absent', () => {
    expect(payeeOf({ merchant: null, description: 'Lidl Purchase' })).toBe('lidl purchase');
  });

  it('trims and lowercases merchant', () => {
    expect(payeeOf({ merchant: '  BIEDRONKA  ', description: null })).toBe('biedronka');
  });

  it('returns empty string when both are null', () => {
    expect(payeeOf({ merchant: null, description: null })).toBe('');
  });

  it('returns empty string when both are empty strings', () => {
    expect(payeeOf({ merchant: '', description: '' })).toBe('');
  });
});

describe('stubPayeeOf', () => {
  it('returns lowercased trimmed merchant', () => {
    const stub: ParsedNotificationStub = {
      amount: 15,
      currencyCode: 'PLN',
      occurredAt: new Date('2026-06-29'),
      merchant: '  Żabka  ',
    };
    expect(stubPayeeOf(stub)).toBe('żabka');
  });

  it('returns empty string when merchant is null', () => {
    const stub: ParsedNotificationStub = {
      amount: 15,
      currencyCode: 'PLN',
      occurredAt: new Date('2026-06-29'),
      merchant: null,
    };
    expect(stubPayeeOf(stub)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// contentMatchesExisting — main predicate
// ---------------------------------------------------------------------------

function makeStub(overrides: Partial<ParsedNotificationStub> = {}): ParsedNotificationStub {
  return {
    amount: 15.0,
    currencyCode: 'PLN',
    occurredAt: new Date('2026-06-29T10:00:00Z'),
    merchant: 'Żabka',
    ...overrides,
  };
}

function makeExpense(overrides: Partial<MinimalExpense> = {}): MinimalExpense {
  return {
    isDeleted: false,
    amount: 15.0,
    currencyCode: 'PLN',
    date: new Date('2026-06-29T08:00:00Z'),
    merchant: 'Żabka',
    description: null,
    ...overrides,
  };
}

describe('contentMatchesExisting', () => {
  it('returns true when a non-deleted manual expense matches on all four criteria', () => {
    const stub = makeStub();
    const expenses = [makeExpense()];
    expect(contentMatchesExisting(stub, expenses)).toBe(true);
  });

  it('returns false when the matching expense is deleted', () => {
    const stub = makeStub();
    const expenses = [makeExpense({ isDeleted: true })];
    expect(contentMatchesExisting(stub, expenses)).toBe(false);
  });

  it('returns false when currencies differ', () => {
    const stub = makeStub({ currencyCode: 'EUR' });
    const expenses = [makeExpense({ currencyCode: 'PLN' })];
    expect(contentMatchesExisting(stub, expenses)).toBe(false);
  });

  it('returns false when amounts differ', () => {
    const stub = makeStub({ amount: 14.99 });
    const expenses = [makeExpense({ amount: 15.0 })];
    expect(contentMatchesExisting(stub, expenses)).toBe(false);
  });

  it('returns false when date is exactly 2 days apart (> 1 day)', () => {
    const stub = makeStub({ occurredAt: new Date('2026-06-29T10:00:00Z') });
    const expenses = [makeExpense({ date: new Date('2026-06-27T10:00:00Z') })];
    expect(contentMatchesExisting(stub, expenses)).toBe(false);
  });

  it('returns true when date is within 1 day (same day, different hour)', () => {
    const stub = makeStub({ occurredAt: new Date('2026-06-29T23:59:59Z') });
    const expenses = [makeExpense({ date: new Date('2026-06-29T00:00:00Z') })];
    expect(contentMatchesExisting(stub, expenses)).toBe(true);
  });

  it('returns true when date is exactly 1 day apart', () => {
    // Gap = exactly 86400000 ms — must match (≤ 1 day)
    const base = new Date('2026-06-29T10:00:00Z');
    const dayBefore = new Date(base.getTime() - 86_400_000);
    const stub = makeStub({ occurredAt: base });
    const expenses = [makeExpense({ date: dayBefore })];
    expect(contentMatchesExisting(stub, expenses)).toBe(true);
  });

  it('returns false when merchants differ exactly (Żabka vs ZABKA Z123)', () => {
    // Documents the accepted miss — Case A on the server is the backstop
    const stub = makeStub({ merchant: 'Żabka' });
    const expenses = [makeExpense({ merchant: 'ZABKA Z123 WARSZAWA', description: null })];
    expect(contentMatchesExisting(stub, expenses)).toBe(false);
  });

  it('returns false when stub merchant is empty (unidentifiable stub)', () => {
    const stub = makeStub({ merchant: null });
    const expenses = [makeExpense({ merchant: null, description: null })];
    expect(contentMatchesExisting(stub, expenses)).toBe(false);
  });

  it('returns false when existing expense has no payee (unidentifiable existing)', () => {
    const stub = makeStub({ merchant: 'Żabka' });
    const expenses = [makeExpense({ merchant: null, description: null })];
    expect(contentMatchesExisting(stub, expenses)).toBe(false);
  });

  it('falls back to description on existing expense when merchant is absent', () => {
    const stub = makeStub({ merchant: 'Żabka' });
    // Existing has no merchant but description matches
    const expenses = [makeExpense({ merchant: null, description: 'Żabka' })];
    expect(contentMatchesExisting(stub, expenses)).toBe(true);
  });

  it('returns false against an empty list', () => {
    expect(contentMatchesExisting(makeStub(), [])).toBe(false);
  });

  it('matches the first of multiple candidates', () => {
    const stub = makeStub();
    const expenses = [
      makeExpense({ currencyCode: 'EUR' }), // currency mismatch — no match
      makeExpense(),                          // full match
    ];
    expect(contentMatchesExisting(stub, expenses)).toBe(true);
  });

  it('handles date as ISO string on existing expense', () => {
    const stub = makeStub({ occurredAt: new Date('2026-06-29T10:00:00Z') });
    const expenses = [makeExpense({ date: '2026-06-29T09:00:00Z' })];
    expect(contentMatchesExisting(stub, expenses)).toBe(true);
  });

  it('handles amount as string on existing expense (decimal comparison)', () => {
    const stub = makeStub({ amount: 15.0 });
    const expenses = [makeExpense({ amount: '15.00' as any })];
    expect(contentMatchesExisting(stub, expenses)).toBe(true);
  });
});
