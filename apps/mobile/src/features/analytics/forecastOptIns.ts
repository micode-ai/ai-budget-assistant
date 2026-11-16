import type { CashFlowForecastResponse } from '@budget/shared-types';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The forecast with money owed to the user (`expectedInflows`, lent debts) counted
 * in, for when the user opts in on the forecast card (ABA-786).
 *
 * The server never counts these in `days` — a forecast should not lean on someone
 * else's punctuality — so this adds each one from its due day onward, then
 * recomputes `lowest` and `endBalance` the way the server does (the earliest of
 * equal lows wins). The owed rows join `events`, sorted by date.
 */
export function forecastWithOwed(forecast: CashFlowForecastResponse): CashFlowForecastResponse {
  const owed = forecast.expectedInflows ?? [];
  if (owed.length === 0) return forecast;

  const byDay = new Map<string, number>();
  for (const e of owed) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.amount);

  let added = 0;
  const days = forecast.days.map((d) => {
    const today = byDay.get(d.date) ?? 0;
    added += today;
    return { date: d.date, balance: r2(d.balance + added), scheduled: r2(d.scheduled + today) };
  });

  const events = [...forecast.events, ...owed].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return withDays({ ...forecast, events }, days);
}

/**
 * The forecast with irregular income (`irregularDailyIncome`: freelance, refunds —
 * income in no monthly series) counted in, for when the user opts in (ABA-787).
 * Mirrors how the server subtracts the typical day: nothing on today, one day's
 * worth on every later day.
 */
export function forecastWithIrregularIncome(forecast: CashFlowForecastResponse): CashFlowForecastResponse {
  const daily = forecast.irregularDailyIncome ?? 0;
  if (daily <= 0) return forecast;
  const days = forecast.days.map((d, i) => ({ ...d, balance: r2(d.balance + daily * i) }));
  return withDays(forecast, days);
}

/** Replace the days and recompute the low (the earliest of equal lows wins, as on the server) and the end. */
function withDays(forecast: CashFlowForecastResponse, days: CashFlowForecastResponse['days']): CashFlowForecastResponse {
  let lowest = days[0];
  for (const d of days) if (d.balance < lowest.balance) lowest = d;
  return {
    ...forecast,
    days,
    lowest: { date: lowest.date, balance: lowest.balance },
    endBalance: days[days.length - 1].balance,
  };
}

/** Sum of what is owed to the user within the horizon. */
export function owedTotal(forecast: CashFlowForecastResponse): number {
  return r2((forecast.expectedInflows ?? []).reduce((s, e) => s + e.amount, 0));
}
