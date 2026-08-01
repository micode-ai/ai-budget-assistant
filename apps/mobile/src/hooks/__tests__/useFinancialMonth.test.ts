import { resolveFinancialMonth } from '../useFinancialMonth';

describe('resolveFinancialMonth', () => {
  it('falls back to the calendar month when no account is loaded', () => {
    const { anchorDay, current } = resolveFinancialMonth(null, new Date(2026, 7, 15));
    expect(anchorDay).toBeNull();
    expect(current.start).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
  });

  it('uses the account anchor', () => {
    const { anchorDay, current } = resolveFinancialMonth(
      { monthAnchorDay: 10 } as any,
      new Date(2026, 7, 15),
    );
    expect(anchorDay).toBe(10);
    expect(current.start).toEqual(new Date(2026, 7, 10, 0, 0, 0, 0));
  });

  it('treats a corrupt stored anchor as the calendar month', () => {
    const { anchorDay, current } = resolveFinancialMonth(
      { monthAnchorDay: 99 } as any,
      new Date(2026, 7, 15),
    );
    expect(anchorDay).toBeNull();
    expect(current.start).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
  });
});
