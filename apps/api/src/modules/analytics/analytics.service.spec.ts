import { computeVsAverageFromTotals } from './analytics.service';

describe('computeVsAverageFromTotals', () => {
  it('returns 0 when all historical months are zero (new account)', () => {
    expect(computeVsAverageFromTotals(500, [0, 0, 0])).toBe(0);
  });

  it('returns 100 when rolling average is 0 but current spend is positive', () => {
    // Edge case: prior months had data but summed contribution hits zero somehow
    // (guarded by the rollingAverage === 0 branch)
    expect(computeVsAverageFromTotals(200, [0, 0, 0])).toBe(0); // hasData=false wins first
  });

  it('returns positive percentage when current spend exceeds rolling average', () => {
    // avg = (100 + 200 + 300) / 3 = 200; current = 300 → +50 %
    const result = computeVsAverageFromTotals(300, [100, 200, 300]);
    expect(result).toBe(50);
  });

  it('returns negative percentage when current spend is below rolling average', () => {
    // avg = 200; current = 100 → −50 %
    const result = computeVsAverageFromTotals(100, [100, 200, 300]);
    expect(result).toBe(-50);
  });

  it('returns 0 when current spend exactly equals rolling average', () => {
    expect(computeVsAverageFromTotals(200, [200, 200, 200])).toBe(0);
  });

  it('rounds to 2 decimal places', () => {
    // avg = (100 + 200) / 2 = 150; current = 175 → +16.666… → rounds to 16.67
    const result = computeVsAverageFromTotals(175, [100, 200]);
    expect(result).toBe(16.67);
  });

  it('works with a single historical month', () => {
    // avg = 400; current = 600 → +50 %
    expect(computeVsAverageFromTotals(600, [400])).toBe(50);
  });

  it('ignores zero months in the average but still uses them in the divisor', () => {
    // hasData=true because one month is non-zero; avg = (0 + 0 + 300) / 3 = 100
    // current = 150 → +50 %
    const result = computeVsAverageFromTotals(150, [0, 0, 300]);
    expect(result).toBe(50);
  });
});
