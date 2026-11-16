import { isWalletBalanceUnsetLocal, localSafeToSpendInputs } from '../localSafeToSpend';

// 10 June 2026, midday. 1 EUR = 4 PLN; base PLN.
const NOW = new Date(2026, 5, 10, 12);
const convert = (amount: number, currency: string) => (currency === 'EUR' ? amount * 4 : amount);
const d = (m: number, day: number) => new Date(2026, m - 1, day);

const base = { now: NOW, incomes: [], expenses: [], subscriptions: [], goals: [], convert };

describe('localSafeToSpendInputs', () => {
  it('expects a monthly salary still to come and ends the horizon on it', () => {
    const r = localSafeToSpendInputs({
      ...base,
      incomes: [
        { amount: 5000, currencyCode: 'PLN', description: 'Salary', date: d(4, 25) },
        { amount: 5000, currencyCode: 'PLN', description: 'Salary', date: d(5, 25) },
      ],
    });
    expect(r.expectedIncome).toBe(5000);
    expect(r.horizonDate).toBe('2026-06-24'); // 25 May + 30-day gap
    expect(r.daysRemaining).toBe(15); // 10..24 June
  });

  it('does not count income already received this month', () => {
    const r = localSafeToSpendInputs({ ...base, incomes: [{ amount: 900, currencyCode: 'PLN', date: d(6, 2) }] });
    expect(r.expectedIncome).toBe(0);
    expect(r.horizonDate).toBe('2026-06-30');
  });

  it('ends the horizon with the financial month when the account has an anchor day (ABA-789)', () => {
    const r = localSafeToSpendInputs({ ...base, anchorDay: 15 });
    expect(r.horizonDate).toBe('2026-06-14'); // the month that started on 15 May ends on 14 June
    expect(r.daysRemaining).toBe(5); // 10..14 June
  });

  it('subtracts only FUTURE recurring due dates, from the newest instance', () => {
    const r = localSafeToSpendInputs({
      ...base,
      expenses: [
        { amount: 1500, currencyCode: 'PLN', date: d(6, 5), isRecurring: true, recurringId: 'rent', recurringPeriod: 'monthly' },
        { amount: 1500, currencyCode: 'PLN', date: d(5, 5), isRecurring: true, recurringId: 'rent', recurringPeriod: 'monthly' },
        { amount: 20, currencyCode: 'PLN', date: d(6, 3), isRecurring: true, recurringId: 'gym', recurringPeriod: 'weekly' },
      ],
    });
    // rent: next 5 July — outside June; gym: 17 and 24 June (10 June was the previous instance+7 = 10 June, today, already booked)
    expect(r.upcomingRecurring).toBe(40);
  });

  it('counts subscription renewals today through the horizon, converted', () => {
    const r = localSafeToSpendInputs({
      ...base,
      subscriptions: [
        { amount: 10, currencyCode: 'EUR', billingCycle: 'monthly', nextRenewalDate: d(6, 10), isActive: true },
        { amount: 99, currencyCode: 'PLN', billingCycle: 'monthly', nextRenewalDate: d(6, 20), isActive: false },
      ],
    });
    expect(r.upcomingSubscriptions).toBe(40);
  });

  it('reserves the goal pace for the days in the horizon', () => {
    const r = localSafeToSpendInputs({
      ...base,
      goals: [{ targetAmount: 3000, currentAmount: 0, currencyCode: 'PLN', deadline: new Date(2026, 8, 7, 12), status: 'active' }],
    });
    // 3000 over 89 days ≈ 33.71/day × 21 days (10..30 June)
    expect(r.goalContributions).toBeCloseTo((3000 / 89) * 21, 0);
  });
});

describe('isWalletBalanceUnsetLocal (ABA-794)', () => {
  it('is unset with no starting balance and no correction', () => {
    expect(isWalletBalanceUnsetLocal([], {})).toBe(true);
    expect(isWalletBalanceUnsetLocal([{ initialAmount: 0 }], { PLN: 0 })).toBe(true);
  });

  it('is set by a non-zero starting balance that is not deleted', () => {
    expect(isWalletBalanceUnsetLocal([{ initialAmount: 1200 }], {})).toBe(false);
    expect(isWalletBalanceUnsetLocal([{ initialAmount: 1200, isDeleted: true }], {})).toBe(true);
  });

  it('is set by a balance correction', () => {
    expect(isWalletBalanceUnsetLocal([{ initialAmount: 0 }], { EUR: -35.5 })).toBe(false);
  });
});
