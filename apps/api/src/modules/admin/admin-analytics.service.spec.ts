import { AdminAnalyticsService } from './admin-analytics.service';

function makePrisma() {
  return {
    user: {
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as any;
}

describe('AdminAnalyticsService.getAcquisitionBreakdown', () => {
  it('buckets a null acquisitionSource as "direct" rather than dropping it', async () => {
    const prisma = makePrisma();
    prisma.user.count
      .mockResolvedValueOnce(100) // totalUsers
      .mockResolvedValueOnce(10) // windowSignups
      .mockResolvedValueOnce(6); // attributedWindowSignups
    prisma.user.groupBy
      .mockResolvedValueOnce([
        { acquisitionSource: 'landing', _count: 6 },
        { acquisitionSource: null, _count: 4 },
      ])
      .mockResolvedValueOnce([{ acquisitionLocation: null, _count: 10 }])
      .mockResolvedValueOnce([{ acquisitionLanguage: 'pl', _count: 10 }])
      .mockResolvedValueOnce([{ acquisitionPlan: null, _count: 10 }]);

    const svc = new AdminAnalyticsService(prisma);
    const res = await svc.getAcquisitionBreakdown(30);

    expect(res.windowDays).toBe(30);
    expect(res.totalUsers).toBe(100);
    expect(res.windowSignups).toBe(10);
    expect(res.attributedWindowSignups).toBe(6);
    expect(res.bySource).toEqual([
      { value: 'landing', count: 6 },
      { value: 'direct', count: 4 },
    ]);
    expect(res.byLocation).toEqual([{ value: 'direct', count: 10 }]);
  });

  it('sorts each breakdown by count descending', async () => {
    const prisma = makePrisma();
    prisma.user.groupBy.mockResolvedValueOnce([
      { acquisitionSource: 'blog', _count: 2 },
      { acquisitionSource: 'landing', _count: 9 },
      { acquisitionSource: null, _count: 5 },
    ]);

    const svc = new AdminAnalyticsService(prisma);
    const res = await svc.getAcquisitionBreakdown(30);

    expect(res.bySource.map((r) => r.value)).toEqual(['landing', 'direct', 'blog']);
  });
});
