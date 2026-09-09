import {
  MIN_DAYS_FOR_BUDGET_PROJECTION,
  projectBudgetSpend,
} from './budget-projection';

/**
 * The reported case is the first test, with the real figures, because the whole
 * point of this function is that the old one turned a 4350 zl rent payment into
 * a 19 795 zl month.
 */
describe('projectBudgetSpend', () => {
  it('does not re-spend a one-off lump for the rest of the month', () => {
    // The account that prompted this: 8000 PLN budget, 9 September, 5938,73
    // spent, of which 4350 was rent paid once on the 8th.
    const dailyTotals = [119.47, 125.09, 893.87, 222.58, 4350, 96.6, 131.12];
    const spent = 5938.73;

    const { projectedTotal, dailyRate } = projectBudgetSpend({
      spent,
      dailyTotals,
      daysElapsed: 9,
      totalDays: 30,
    });

    // The old formula: 5938.73 / 9 * 30 = 19 795, i.e. rent charged three times.
    const oldFormula = (spent / 9) * 30;
    expect(oldFormula).toBeGreaterThan(19_000);

    // The rate excludes the rent day; the rent itself is still inside `spent`.
    expect(dailyRate).toBeCloseTo((spent - 4350) / 8, 2);
    expect(projectedTotal).toBeCloseTo(spent + ((spent - 4350) / 8) * 21, 2);

    // Still over the 8000 budget — the sign was never the problem — but by
    // roughly 2 100 rather than 10 383.
    expect(projectedTotal!).toBeGreaterThan(8000);
    expect(projectedTotal! - 8000).toBeLessThan(3000);
  });

  it('says nothing before there is enough of the period behind us', () => {
    // Dropping the largest of two or three days leaves almost no signal, and a
    // confident sentence built on that is the ABA-521 class of claim.
    for (let d = 1; d < MIN_DAYS_FOR_BUDGET_PROJECTION; d++) {
      const r = projectBudgetSpend({ spent: 4350, dailyTotals: [4350], daysElapsed: d, totalDays: 30 });
      expect(r.projectedTotal).toBeNull();
      expect(r.dailyRate).toBeNull();
    }

    expect(
      projectBudgetSpend({
        spent: 4350,
        dailyTotals: [4350],
        daysElapsed: MIN_DAYS_FOR_BUDGET_PROJECTION,
        totalDays: 30,
      }).projectedTotal,
    ).not.toBeNull();
  });

  it('counts days with no spending, rather than averaging spending days only', () => {
    // Spending on 2 of 10 days. Averaging the two would report the rate of a
    // spending DAY (150) and inflate every projection; the honest rate spreads
    // it over the period.
    const { dailyRate } = projectBudgetSpend({
      spent: 300,
      dailyTotals: [150, 150],
      daysElapsed: 10,
      totalDays: 30,
    });

    // One 150 day is dropped as the largest; the rest is 150 over 9 days.
    expect(dailyRate).toBeCloseTo(150 / 9, 4);
  });

  it('never projects below what is already spent', () => {
    const { projectedTotal } = projectBudgetSpend({
      spent: 4350,
      dailyTotals: [4350],
      daysElapsed: 9,
      totalDays: 30,
    });

    // The single day is also the largest, so the rate is 0 — and the projection
    // is exactly the money already gone. It must not come out lower.
    expect(projectedTotal).toBe(4350);
  });

  it('adds nothing once the period is over', () => {
    const { projectedTotal } = projectBudgetSpend({
      spent: 1000,
      dailyTotals: [500, 500],
      daysElapsed: 30,
      totalDays: 30,
    });

    expect(projectedTotal).toBe(1000);
  });

  it('handles a period with no spending at all', () => {
    const { projectedTotal, dailyRate } = projectBudgetSpend({
      spent: 0,
      dailyTotals: [],
      daysElapsed: 15,
      totalDays: 30,
    });

    expect(dailyRate).toBe(0);
    expect(projectedTotal).toBe(0);
  });

  it('ignores junk in the daily totals rather than poisoning the rate', () => {
    // A NaN would make every comparison false and the mean NaN, which would
    // reach the UI as "projected to exceed by NaN" — the same failure the
    // receipt price check had to guard against.
    const { dailyRate, projectedTotal } = projectBudgetSpend({
      spent: 300,
      dailyTotals: [100, Number.NaN, 200, -50, 0],
      daysElapsed: 10,
      totalDays: 30,
    });

    expect(Number.isFinite(dailyRate!)).toBe(true);
    expect(Number.isFinite(projectedTotal!)).toBe(true);
    // 100 and 200 survive; 200 is dropped as the largest; 100 over 9 days.
    expect(dailyRate).toBeCloseTo(100 / 9, 4);
  });

  it('is unmoved by which order the days arrive in', () => {
    const a = projectBudgetSpend({ spent: 900, dailyTotals: [700, 100, 100], daysElapsed: 8, totalDays: 30 });
    const b = projectBudgetSpend({ spent: 900, dailyTotals: [100, 700, 100], daysElapsed: 8, totalDays: 30 });

    expect(a).toEqual(b);
  });
});
