import { previousMonthParams } from '../previousMonth';

describe('previousMonthParams', () => {
  it('returns the month before', () => {
    expect(previousMonthParams(new Date(2026, 9, 1))).toEqual({ year: '2026', month: '9' });
  });
  it('rolls January back to December of the previous year', () => {
    expect(previousMonthParams(new Date(2027, 0, 15))).toEqual({ year: '2026', month: '12' });
  });
});

describe('previousMonthParams — financial month (ABA-782)', () => {
  it('is the previous FINANCIAL month, named by the month it started in', () => {
    // Salary on the 10th; on 5 November the current period is October, the one before September.
    expect(previousMonthParams(new Date(2026, 10, 5), 10)).toEqual({ year: '2026', month: '9' });
    // On 12 November the current period is November, so October just ended.
    expect(previousMonthParams(new Date(2026, 10, 12), 10)).toEqual({ year: '2026', month: '10' });
  });
});
