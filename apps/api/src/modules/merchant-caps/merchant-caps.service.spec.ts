import { MerchantCapsService, merchantKey, monthPeriod, reachedThreshold } from './merchant-caps.service';

describe('merchant cap helpers', () => {
  it('keys like the category rules', () => {
    expect(merchantKey('  Wolt ')).toBe('wolt');
  });
  it('reaches the highest threshold only', () => {
    expect(reachedThreshold(79.9)).toBeNull();
    expect(reachedThreshold(80)).toBe(80);
    expect(reachedThreshold(250)).toBe(100);
  });
  it('builds calendar month bounds', () => {
    const p = monthPeriod(new Date(2026, 10, 26));
    expect(p.period).toBe('2026-11');
    expect(p.start.getDate()).toBe(1);
    expect(p.end.getDate()).toBe(30);
  });
});

describe('MerchantCapsService.checkAccount', () => {
  const today = new Date(2026, 10, 26);
  function make(cap: any, spent: number, claimCount = 1, sendOk = true) {
    const prisma: any = {
      merchantSpendingCap: {
        findMany: jest.fn().mockResolvedValue([cap]),
        updateMany: jest.fn().mockResolvedValue({ count: claimCount }),
      },
      expense: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: spent } }) },
    };
    const notifications: any = { sendToUser: jest.fn().mockResolvedValue(sendOk) };
    return { svc: new MerchantCapsService(prisma, notifications), prisma, notifications };
  }
  const base = {
    id: 'c1', userId: 'u1', accountId: 'a1', merchantNormalized: 'wolt', merchantLabel: 'Wolt',
    amount: 100, currencyCode: 'PLN', lastAlertPeriod: null, lastAlertThreshold: null,
  };

  it('pushes once at 80%', async () => {
    const { svc, notifications } = make(base, 85);
    await svc.checkAccount('a1', 'PLN', today);
    expect(notifications.sendToUser).toHaveBeenCalledTimes(1);
  });

  it('does not repeat a threshold already sent this month', async () => {
    const { svc, notifications } = make({ ...base, lastAlertPeriod: '2026-11', lastAlertThreshold: 80 }, 90);
    await svc.checkAccount('a1', 'PLN', today);
    expect(notifications.sendToUser).not.toHaveBeenCalled();
  });

  it('pushes 100% after 80% in the same month', async () => {
    const { svc, notifications } = make({ ...base, lastAlertPeriod: '2026-11', lastAlertThreshold: 80 }, 120);
    await svc.checkAccount('a1', 'PLN', today);
    expect(notifications.sendToUser).toHaveBeenCalledTimes(1);
  });

  it('re-arms in a new month', async () => {
    const { svc, notifications } = make({ ...base, lastAlertPeriod: '2026-10', lastAlertThreshold: 100 }, 85);
    await svc.checkAccount('a1', 'PLN', today);
    expect(notifications.sendToUser).toHaveBeenCalledTimes(1);
  });

  it('skips when another request claimed the row', async () => {
    const { svc, notifications } = make(base, 85, 0);
    await svc.checkAccount('a1', 'PLN', today);
    expect(notifications.sendToUser).not.toHaveBeenCalled();
  });

  it('rolls the claim back when the push fails', async () => {
    const { svc, prisma } = make(base, 85, 1, false);
    await svc.checkAccount('a1', 'PLN', today);
    expect(prisma.merchantSpendingCap.updateMany).toHaveBeenCalledTimes(2);
  });

  it('never throws', async () => {
    const { svc, prisma } = make(base, 85);
    prisma.merchantSpendingCap.findMany.mockRejectedValue(new Error('db'));
    await expect(svc.checkAccount('a1', 'PLN', today)).resolves.toBeUndefined();
  });
});
