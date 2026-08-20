import { StreakService } from './streak.service';

const ACCOUNT_ID = 'acc-1';
const USER_ID = 'user-1';

function makePrisma(existing: any = null) {
  return {
    userStreak: {
      findUnique: jest.fn().mockResolvedValue(existing),
      create: jest.fn(async ({ data }: any) => ({ id: 'streak-new', ...data })),
      update: jest.fn(async ({ data }: any) => ({ ...existing, ...data })),
    },
  };
}

describe('StreakService.getStreak', () => {
  it('looks the streak row up by the (userId, accountId, streakType) compound key', async () => {
    const prisma = makePrisma({ currentStreak: 3 });
    const service = new StreakService(prisma as any);

    const streak = await service.getStreak(ACCOUNT_ID, USER_ID);

    expect(prisma.userStreak.findUnique).toHaveBeenCalledWith({
      where: {
        userId_accountId_streakType: { userId: USER_ID, accountId: ACCOUNT_ID, streakType: 'daily_tracking' },
      },
    });
    expect(streak).toEqual({ currentStreak: 3 });
  });
});

describe('StreakService.updateStreak', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a fresh streak of 1 on the very first activity', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-20T12:00:00Z'));
    const prisma = makePrisma(null);
    const service = new StreakService(prisma as any);

    const result = await service.updateStreak(ACCOUNT_ID, USER_ID, 'UTC');

    expect(result).toEqual({ currentStreak: 1, longestStreak: 1, updated: true });
    expect(prisma.userStreak.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        accountId: ACCOUNT_ID,
        streakType: 'daily_tracking',
        currentStreak: 1,
        longestStreak: 1,
      }),
    });
  });

  it('is a no-op when activity was already recorded today', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-20T12:00:00Z'));
    const existing = {
      id: 'streak-1',
      currentStreak: 5,
      longestStreak: 9,
      lastActivityDate: new Date('2026-08-20'),
      streakStartDate: new Date('2026-08-16'),
    };
    const prisma = makePrisma(existing);
    const service = new StreakService(prisma as any);

    const result = await service.updateStreak(ACCOUNT_ID, USER_ID, 'UTC');

    expect(result).toEqual({ currentStreak: 5, longestStreak: 9, updated: false });
    expect(prisma.userStreak.update).not.toHaveBeenCalled();
    expect(prisma.userStreak.create).not.toHaveBeenCalled();
  });

  it('extends the streak by one on a consecutive day and raises longestStreak when a new record is set', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-20T12:00:00Z'));
    const existing = {
      id: 'streak-1',
      currentStreak: 9,
      longestStreak: 9,
      lastActivityDate: new Date('2026-08-19'), // yesterday relative to UTC "today"
      streakStartDate: new Date('2026-08-11'),
    };
    const prisma = makePrisma(existing);
    const service = new StreakService(prisma as any);

    const result = await service.updateStreak(ACCOUNT_ID, USER_ID, 'UTC');

    expect(result).toEqual({ currentStreak: 10, longestStreak: 10, updated: true });
    expect(prisma.userStreak.update).toHaveBeenCalledWith({
      where: { id: 'streak-1' },
      data: expect.objectContaining({
        currentStreak: 10,
        longestStreak: 10,
        streakStartDate: existing.streakStartDate, // preserved — the run isn't broken
      }),
    });
  });

  it('preserves the historical longestStreak when a shorter streak continues', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-20T12:00:00Z'));
    const existing = {
      id: 'streak-1',
      currentStreak: 2,
      longestStreak: 30,
      lastActivityDate: new Date('2026-08-19'),
      streakStartDate: new Date('2026-08-18'),
    };
    const prisma = makePrisma(existing);
    const service = new StreakService(prisma as any);

    const result = await service.updateStreak(ACCOUNT_ID, USER_ID, 'UTC');

    expect(result.currentStreak).toBe(3);
    expect(result.longestStreak).toBe(30);
  });

  it('resets the streak to 1 and restarts streakStartDate when a day was missed', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-20T12:00:00Z'));
    const existing = {
      id: 'streak-1',
      currentStreak: 15,
      longestStreak: 15,
      lastActivityDate: new Date('2026-08-10'), // 10 days ago — the streak is broken
      streakStartDate: new Date('2026-07-27'),
    };
    const prisma = makePrisma(existing);
    const service = new StreakService(prisma as any);

    const result = await service.updateStreak(ACCOUNT_ID, USER_ID, 'UTC');

    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(15); // the old record still stands
    expect(prisma.userStreak.update).toHaveBeenCalledWith({
      where: { id: 'streak-1' },
      data: expect.objectContaining({
        currentStreak: 1,
        streakStartDate: new Date('2026-08-20'),
      }),
    });
  });

  it('computes "today" in the user timezone, so the same wall-clock instant can yield a different verdict per user', async () => {
    // 2026-08-20T05:00:00Z is already 2026-08-20 in UTC, but still 2026-08-19 in Honolulu (UTC-10).
    jest.useFakeTimers().setSystemTime(new Date('2026-08-20T05:00:00Z'));
    const lastActivityDate = new Date('2026-08-18');

    const utcPrisma = makePrisma({
      id: 'streak-utc',
      currentStreak: 4,
      longestStreak: 4,
      lastActivityDate,
      streakStartDate: new Date('2026-08-15'),
    });
    const utcResult = await new StreakService(utcPrisma as any).updateStreak(ACCOUNT_ID, USER_ID, 'UTC');
    // UTC "today" is the 20th, so the 18th is a 2-day-old gap — streak breaks.
    expect(utcResult.currentStreak).toBe(1);

    const honoluluPrisma = makePrisma({
      id: 'streak-honolulu',
      currentStreak: 4,
      longestStreak: 4,
      lastActivityDate,
      streakStartDate: new Date('2026-08-15'),
    });
    const honoluluResult = await new StreakService(honoluluPrisma as any).updateStreak(
      ACCOUNT_ID,
      USER_ID,
      'Pacific/Honolulu',
    );
    // Honolulu "today" is still the 19th, so the 18th is yesterday — streak extends.
    expect(honoluluResult.currentStreak).toBe(5);
  });

  it('falls back to UTC when no timezone is provided', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-20T12:00:00Z'));
    const prisma = makePrisma(null);
    const service = new StreakService(prisma as any);

    await service.updateStreak(ACCOUNT_ID, USER_ID, '');

    expect(prisma.userStreak.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ lastActivityDate: new Date('2026-08-20') }),
    });
  });
});
