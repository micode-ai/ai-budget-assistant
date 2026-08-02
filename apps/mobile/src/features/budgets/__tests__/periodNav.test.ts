import { isCurrentBudgetPeriod, stepBudgetPeriod } from '../periodNav';

describe('isCurrentBudgetPeriod', () => {
  it('recognises an anchored period that spans two calendar months', () => {
    // 5 Sep, anchor 10 -> the live period is 10 Aug - 9 Sep.
    const ref = new Date(2026, 8, 5);
    expect(isCurrentBudgetPeriod('monthly', ref, 10, new Date(2026, 8, 5))).toBe(true);
  });

  it('rejects a period that is genuinely in the past', () => {
    expect(isCurrentBudgetPeriod('monthly', new Date(2026, 6, 15), 10, new Date(2026, 8, 5)))
      .toBe(false);
  });

  it('still works for calendar months', () => {
    expect(isCurrentBudgetPeriod('monthly', new Date(2026, 7, 3), null, new Date(2026, 7, 20)))
      .toBe(true);
  });
});

describe('stepBudgetPeriod', () => {
  it('steps monthly back from the 31st without skipping February', () => {
    const ref = stepBudgetPeriod('monthly', new Date(2026, 2, 31), -1, null);
    expect(ref.getMonth()).toBe(1);
  });

  it('steps an anchored period back a whole period', () => {
    const ref = stepBudgetPeriod('monthly', new Date(2026, 7, 15), -1, 10);
    expect(ref.getMonth()).toBe(6);
    expect(ref.getDate()).toBe(10);
  });

  it('leaves weekly stepping alone', () => {
    const ref = stepBudgetPeriod('weekly', new Date(2026, 7, 15), -1, 10);
    expect(ref.getDate()).toBe(8);
  });
});
