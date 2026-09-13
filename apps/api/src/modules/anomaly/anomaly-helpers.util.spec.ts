import { detectCycle, DUP_DAY_MS, expensePayee, monthKey, normalizeMerchant } from './anomaly-helpers.util';

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
