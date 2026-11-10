import { bankCopySource, defaultMergeWithBank, describeDuplicateMatch, mergeableSource } from '../receiptDuplicate';

const match = {
  kind: 'exact' as const,
  expenseId: 'srv-1',
  clientId: 'cli-1',
  merchant: 'Biedronka',
  description: 'Groceries',
  amount: 40.85,
  currencyCode: 'PLN',
  date: '2026-09-25T12:00:00.000Z',
};

describe('describeDuplicateMatch', () => {
  it('names the merchant, the amount and the calendar day', () => {
    const text = describeDuplicateMatch(match, 'en-GB');
    expect(text.startsWith('Biedronka · ')).toBe(true);
    expect(text).toMatch(/40[.,]85/);
    expect(text.endsWith('25/09/2026')).toBe(true);
  });

  it('falls back to the description when there is no merchant', () => {
    expect(describeDuplicateMatch({ ...match, merchant: '  ' }, 'en-GB').startsWith('Groceries · ')).toBe(true);
  });

  it('reads the stored day in UTC, so a late-evening save keeps its date', () => {
    const text = describeDuplicateMatch({ ...match, date: '2026-09-25T23:30:00.000Z' }, 'en-GB');
    expect(text.endsWith('25/09/2026')).toBe(true);
  });

  it('omits an unparseable date rather than printing "Invalid Date"', () => {
    expect(describeDuplicateMatch({ ...match, date: 'nope' }, 'en-GB')).not.toContain('Invalid');
  });
});

describe('bankCopySource / defaultMergeWithBank', () => {
  const likely = { ...match, kind: 'likely' as const };

  it('offers a merge for a push or an imported row, ticked by default', () => {
    expect(bankCopySource({ ...likely, source: 'notification' })).toBe('notification');
    expect(bankCopySource({ ...likely, source: 'import' })).toBe('import');
    expect(defaultMergeWithBank({ ...likely, source: 'import' })).toBe(true);
  });

  it('leaves the box unticked when only the amount matched', () => {
    expect(defaultMergeWithBank({ ...likely, source: 'notification', amountOnly: true })).toBe(false);
    expect(bankCopySource({ ...likely, source: 'notification', amountOnly: true })).toBe('notification');
  });

  it('never offers a merge for a manual row, an exact re-upload, or an older server', () => {
    expect(bankCopySource({ ...likely, source: 'manual' })).toBeNull();
    expect(bankCopySource({ ...match, source: 'import' })).toBeNull();
    expect(bankCopySource(likely)).toBeNull();
    expect(bankCopySource(null)).toBeNull();
  });
});

describe('mergeableSource (ABA-743)', () => {
  const likely = { ...match, kind: 'likely' as const };

  it('offers a hand-entered row for merging, unticked by default', () => {
    expect(mergeableSource({ ...likely, source: 'manual' })).toBe('userEntered');
    expect(mergeableSource({ ...likely, source: 'voice' })).toBe('userEntered');
    expect(mergeableSource({ ...likely, source: 'telegram' })).toBe('userEntered');
    expect(defaultMergeWithBank({ ...likely, source: 'manual' })).toBe(false);
  });

  it('still offers the bank copies', () => {
    expect(mergeableSource({ ...likely, source: 'notification' })).toBe('notification');
    expect(mergeableSource({ ...likely, source: 'import' })).toBe('import');
  });

  it('never offers an exact re-upload, a receipt or an API row', () => {
    expect(mergeableSource({ ...match, source: 'manual' })).toBeNull();
    expect(mergeableSource({ ...likely, source: 'ocr' })).toBeNull();
    expect(mergeableSource({ ...likely, source: 'api' as any })).toBeNull();
    expect(mergeableSource(null)).toBeNull();
  });
});
