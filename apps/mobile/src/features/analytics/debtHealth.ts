/**
 * The Financial Health Score's debt component (up to 25 points) — pure.
 *
 * Weighted by MONEY, not by count: the score drops by the share of the
 * still-outstanding debt amount that is overdue. One small overdue loan next
 * to a large healthy one barely moves it; a large overdue one dominates. (It
 * used to count debts, so a forgotten 20 zł IOU cost as much as an overdue
 * 20 000 zł loan.) Amounts are converted to the base currency first so that
 * debts in different currencies weigh comparably. Fully repaid debts and
 * debts with nothing left to repay carry no weight.
 */

export interface HealthDebt {
  remainingAmount: number;
  currencyCode: string;
  status: 'active' | 'paid' | 'overdue';
}

export interface DebtHealth {
  points: number;
  overdueCount: number;
  /** Overdue share of the outstanding amount, 0..1. */
  overdueShare: number;
}

export function computeDebtHealth(
  debts: HealthDebt[],
  convert: (amount: number, currencyCode: string) => number,
): DebtHealth {
  let outstanding = 0;
  let overdue = 0;
  let overdueCount = 0;
  for (const d of debts) {
    if (d.status === 'paid' || !(d.remainingAmount > 0)) continue;
    const amount = convert(d.remainingAmount, d.currencyCode);
    outstanding += amount;
    if (d.status === 'overdue') {
      overdue += amount;
      overdueCount += 1;
    }
  }
  const overdueShare = outstanding > 0 ? overdue / outstanding : 0;
  return { points: Math.round((1 - overdueShare) * 25), overdueCount, overdueShare };
}
