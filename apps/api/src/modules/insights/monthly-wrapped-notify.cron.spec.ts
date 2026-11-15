import { MonthlyWrappedNotifyCron, periodEndedYesterday, previousMonth } from './monthly-wrapped-notify.cron';

describe('periodEndedYesterday (ABA-782)', () => {
  it('turns a calendar account over on the 1st only', () => {
    expect(periodEndedYesterday(new Date(2026, 10, 1, 9), null)).toEqual({ year: 2026, month: 10 });
    expect(periodEndedYesterday(new Date(2026, 10, 2, 9), null)).toBeNull();
    expect(periodEndedYesterday(new Date(2026, 0, 1, 9), null)).toEqual({ year: 2025, month: 12 });
  });

  it('turns an anchored account over on its anchor day, naming the month the period started in', () => {
    // Salary on the 10th: on 10 November the period 10 Oct – 9 Nov ("October") just ended.
    expect(periodEndedYesterday(new Date(2026, 10, 10, 9), 10)).toEqual({ year: 2026, month: 10 });
    expect(periodEndedYesterday(new Date(2026, 10, 1, 9), 10)).toBeNull();
  });

  it('turns an anchor of 31 over on the last day of a shorter month', () => {
    // 30 November: the period that started 31 October just ended.
    expect(periodEndedYesterday(new Date(2026, 10, 30, 9), 31)).toEqual({ year: 2026, month: 10 });
    expect(periodEndedYesterday(new Date(2026, 10, 29, 9), 31)).toBeNull();
  });

  it('keeps previousMonth for callers that still mean the calendar month', () => {
    expect(previousMonth(new Date(2026, 0, 15))).toEqual({ year: 2025, month: 12 });
  });
});

describe('MonthlyWrappedNotifyCron.handleMonthlyWrapped', () => {
  function make(users: Array<{ id: string; defaultAccountId: string }>, anchors: Record<string, number | null>) {
    const prisma: any = {
      user: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(users.map((u) => ({ ...u, currencyCode: 'PLN' })))
          .mockResolvedValue([]),
      },
      account: {
        findMany: jest.fn().mockResolvedValue(Object.entries(anchors).map(([id, monthAnchorDay]) => ({ id, monthAnchorDay }))),
      },
    };
    const wrapped: any = { getMonthlyWrapped: jest.fn().mockResolvedValue({ hasEnoughData: true }) };
    const ledger: any = { tryRecord: jest.fn().mockResolvedValue(true) };
    const notifications: any = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    return { cron: new MonthlyWrappedNotifyCron(prisma, notifications, wrapped, ledger), wrapped, notifications };
  }

  it('on the 10th notifies only the accounts whose month turned over that day', async () => {
    const { cron, wrapped, notifications } = make(
      [
        { id: 'u-cal', defaultAccountId: 'a-cal' },
        { id: 'u-10', defaultAccountId: 'a-10' },
        { id: 'u-25', defaultAccountId: 'a-25' },
      ],
      { 'a-cal': null, 'a-10': 10, 'a-25': 25 },
    );

    await cron.handleMonthlyWrapped(new Date(2026, 10, 10, 9));

    expect(wrapped.getMonthlyWrapped).toHaveBeenCalledTimes(1);
    expect(wrapped.getMonthlyWrapped).toHaveBeenCalledWith('a-10', 'u-10', 'PLN', 2026, 10, 10);
    expect(notifications.sendToUser).toHaveBeenCalledTimes(1);
  });
});
