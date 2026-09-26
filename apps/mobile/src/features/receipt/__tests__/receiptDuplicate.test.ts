import { describeDuplicateMatch } from '../receiptDuplicate';

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
