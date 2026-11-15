import { computeDebtHealth, type HealthDebt } from '../debtHealth';

// 1 EUR = 4 PLN
const convert = (amount: number, currency: string) => (currency === 'EUR' ? amount * 4 : amount);
const debt = (remainingAmount: number, status: HealthDebt['status'], currencyCode = 'PLN'): HealthDebt => ({
  remainingAmount,
  status,
  currencyCode,
});

describe('computeDebtHealth', () => {
  it('gives full points with no debts or none overdue', () => {
    expect(computeDebtHealth([], convert)).toEqual({ points: 25, overdueCount: 0, overdueShare: 0 });
    expect(computeDebtHealth([debt(500, 'active')], convert).points).toBe(25);
  });

  it('weighs by amount: a small overdue debt beside a large healthy one barely costs anything', () => {
    const r = computeDebtHealth([debt(20, 'overdue'), debt(19_980, 'active')], convert);
    expect(r.points).toBe(25); // 0.1% overdue
    expect(r.overdueCount).toBe(1);
  });

  it('a large overdue debt dominates', () => {
    expect(computeDebtHealth([debt(8_000, 'overdue'), debt(2_000, 'active')], convert).points).toBe(5); // 80% overdue
  });

  it('converts currencies before weighing', () => {
    // 250 EUR = 1000 PLN overdue vs 1000 PLN active → half overdue
    const r = computeDebtHealth([debt(250, 'overdue', 'EUR'), debt(1_000, 'active')], convert);
    expect(r.overdueShare).toBeCloseTo(0.5);
    expect(r.points).toBe(13);
  });

  it('ignores repaid debts and debts with nothing left', () => {
    expect(computeDebtHealth([debt(0, 'overdue'), debt(300, 'paid'), debt(100, 'active')], convert)).toEqual({
      points: 25,
      overdueCount: 0,
      overdueShare: 0,
    });
  });
});
