import { withFinancialMonthDefault } from './financial-month-args';

describe('withFinancialMonthDefault (ABA-795)', () => {
  it('starts an undated get_expenses at the financial month', () => {
    expect(withFinancialMonthDefault('get_expenses', { endDate: '2026-11-16' }, '2026-11-10')).toEqual({
      endDate: '2026-11-16',
      startDate: '2026-11-10',
    });
  });

  it('leaves the call alone without an anchor, with dates, a keyword or a category, and for other tools', () => {
    const args = { descriptionKeyword: 'beer' };
    expect(withFinancialMonthDefault('get_expenses', {}, undefined)).toEqual({});
    expect(withFinancialMonthDefault('get_expenses', { startDate: '2026-11-01' }, '2026-11-10')).toEqual({ startDate: '2026-11-01' });
    expect(withFinancialMonthDefault('get_expenses', args, '2026-11-10')).toBe(args);
    expect(withFinancialMonthDefault('get_expenses', { categoryName: 'Food' }, '2026-11-10')).toEqual({ categoryName: 'Food' });
    expect(withFinancialMonthDefault('get_budget_status', {}, '2026-11-10')).toEqual({});
  });
});
