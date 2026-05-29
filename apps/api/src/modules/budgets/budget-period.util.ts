function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as first day
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date: Date): Date {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

// Compute the rolling [periodStart, periodEnd] window for a budget. For
// daily/weekly/monthly/yearly budgets the window tracks the current calendar
// period. `custom` budgets keep their fixed [startDate, endDate] window.
// Shared by BudgetsService and BudgetAlertService to guarantee both use the
// same (Monday-based) week boundary and identical period edges.
export function computeBudgetPeriod(
  budget: { period: string; startDate: Date; endDate: Date | null },
  now: Date = new Date(),
): { periodStart: Date; periodEnd: Date } {
  switch (budget.period) {
    case 'daily': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return { periodStart: start, periodEnd: end };
    }
    case 'weekly':
      return { periodStart: startOfWeek(now), periodEnd: endOfWeek(now) };
    case 'yearly': {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      return { periodStart: start, periodEnd: end };
    }
    case 'custom':
      return {
        periodStart: budget.startDate,
        periodEnd: budget.endDate ?? now,
      };
    case 'monthly':
    default: {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      return { periodStart: start, periodEnd: end };
    }
  }
}
