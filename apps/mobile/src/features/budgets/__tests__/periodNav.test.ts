import { isCurrentBudgetPeriod, stepBudgetPeriod, formatBudgetPeriodRange } from '../periodNav';

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

describe('formatBudgetPeriodRange', () => {
  it('returns an anchored monthly range, not the calendar month', () => {
    // 5 Sep, anchor 10 -> the live financial month is 10 Aug - 9 Sep.
    const range = formatBudgetPeriodRange('monthly', new Date(2026, 8, 5), 10, 'en-US');
    expect(range).toBe('Aug 10 – Sep 9');
  });

  it('returns the calendar month range with no anchor', () => {
    const range = formatBudgetPeriodRange('monthly', new Date(2026, 7, 20), null, 'en-US');
    expect(range).toBe('Aug 1 – Aug 31');
  });

  it('returns a Mon-first week range', () => {
    const range = formatBudgetPeriodRange('weekly', new Date(2026, 7, 15), null, 'en-US');
    // 15 Aug 2026 is a Saturday; the week starts Monday 10 Aug.
    expect(range).toBe('Aug 10 – Aug 16');
  });

  it('returns just the year for yearly', () => {
    expect(formatBudgetPeriodRange('yearly', new Date(2026, 7, 15), null, 'en-US')).toBe('2026');
  });

  it('returns the single day for daily', () => {
    expect(formatBudgetPeriodRange('daily', new Date(2026, 7, 15), null, 'en-US')).toBe('Aug 15');
  });

  it('returns the budget\'s own fixed range for custom', () => {
    const range = formatBudgetPeriodRange('custom', new Date(2026, 7, 15), null, 'en-US', {
      startDate: new Date(2026, 5, 1),
      endDate: new Date(2026, 7, 31),
    });
    expect(range).toBe('Jun 1 – Aug 31');
  });

  it('returns a single date for an open-ended custom range', () => {
    const range = formatBudgetPeriodRange('custom', new Date(2026, 7, 15), null, 'en-US', {
      startDate: new Date(2026, 5, 1),
    });
    expect(range).toBe('Jun 1');
  });

  it('returns empty for custom with no range supplied', () => {
    expect(formatBudgetPeriodRange('custom', new Date(2026, 7, 15), null, 'en-US')).toBe('');
  });
});
