import { previousMonthParams } from '../previousMonth';

describe('previousMonthParams', () => {
  it('returns the month before', () => {
    expect(previousMonthParams(new Date(2026, 9, 1))).toEqual({ year: '2026', month: '9' });
  });
  it('rolls January back to December of the previous year', () => {
    expect(previousMonthParams(new Date(2027, 0, 15))).toEqual({ year: '2026', month: '12' });
  });
});
