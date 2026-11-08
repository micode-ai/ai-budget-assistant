import { buildDemoData } from '../demoData';
import { isDemoAccountId } from '../demoAccount';

const input = { accountId: 'demo-acc', userId: 'u1', currencyCode: 'USD' as const, now: new Date(2026, 10, 8) };

describe('buildDemoData', () => {
  const data = buildDemoData(input);
  it('is deterministic', () => {
    expect(buildDemoData(input)).toEqual(data);
  });
  it('spans about 3 months with two budgets and income', () => {
    expect(data.expenses.length).toBeGreaterThan(60);
    expect(data.incomes.length).toBeGreaterThanOrEqual(2);
    expect(data.budgets).toHaveLength(2);
  });
  it('never marks a row as needing sync and scopes everything to the demo account', () => {
    for (const r of [...data.expenses, ...data.incomes, ...data.budgets]) {
      expect(r.syncStatus).toBe('synced');
      expect(r.accountId).toBe('demo-acc');
      expect(r.id.startsWith('demo-')).toBe(true);
    }
  });
  it('keeps no future-dated rows', () => {
    expect(data.expenses.every((e) => e.date.getTime() <= input.now.getTime() + 86400000)).toBe(true);
  });
});

describe('isDemoAccountId', () => {
  it('detects only the prefix', () => {
    expect(isDemoAccountId('demo-1')).toBe(true);
    expect(isDemoAccountId('1-demo')).toBe(false);
    expect(isDemoAccountId(null)).toBe(false);
  });
});
