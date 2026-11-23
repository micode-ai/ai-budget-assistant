import { periodRange } from '../periods';
import { changeRatio } from '../allAccountsDisplay';

describe('periodRange', () => {
  const now = new Date(2026, 2, 31);
  it('lastMonth on Mar 31 is February', () => {
    expect(periodRange('lastMonth', now)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });
  it('thisMonth runs to the end of the month', () => {
    expect(periodRange('thisMonth', now)).toEqual({ start: '2026-03-01', end: '2026-03-31' });
  });
  it('thisYear / lastYear', () => {
    expect(periodRange('thisYear', now)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(periodRange('lastYear', now)).toEqual({ start: '2025-01-01', end: '2025-12-31' });
  });
  it('custom passes through', () => {
    expect(periodRange('custom', now, { start: '2026-01-05', end: '2026-01-09' })).toEqual({
      start: '2026-01-05',
      end: '2026-01-09',
    });
  });
  it('lastMonth in January is December of the previous year', () => {
    expect(periodRange('lastMonth', new Date(2026, 0, 15))).toEqual({ start: '2025-12-01', end: '2025-12-31' });
  });
});

describe('changeRatio', () => {
  it('null for null or zero previous', () => {
    expect(changeRatio(10, null)).toBeNull();
    expect(changeRatio(10, 0)).toBeNull();
  });
  it('relative change', () => {
    expect(changeRatio(150, 100)).toBeCloseTo(0.5);
    expect(changeRatio(50, 100)).toBeCloseTo(-0.5);
  });
});
