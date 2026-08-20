import { GamificationService } from './gamification.service';

type AchievementRow = {
  id: string;
  userId: string;
  accountId: string;
  achievementId: string;
  progress: number;
  isCompleted: boolean;
  unlockedAt: Date | null;
};

/** In-memory double for `prisma.userAchievement` — mirrors the real upsert/update/findUnique
 * semantics closely enough to exercise the service's existing-vs-not-existing branching. */
function makeAchievementStore(initial: AchievementRow[] = []) {
  const store = new Map<string, AchievementRow>();
  for (const row of initial) {
    store.set(`${row.accountId}::${row.achievementId}`, row);
  }
  let counter = 0;

  const findByKey = (where: any): AchievementRow | null => {
    const k = where.userId_accountId_achievementId;
    if (!k) return null;
    return store.get(`${k.accountId}::${k.achievementId}`) ?? null;
  };

  return {
    _store: store,
    findUnique: jest.fn(async ({ where }: any) => findByKey(where)),
    update: jest.fn(async ({ where, data }: any) => {
      for (const row of store.values()) {
        if (row.id === where.id) {
          Object.assign(row, data);
          return { ...row };
        }
      }
      throw new Error(`no row with id ${where.id}`);
    }),
    upsert: jest.fn(async ({ where, create, update }: any) => {
      const key = where.userId_accountId_achievementId;
      const mapKey = `${key.accountId}::${key.achievementId}`;
      const existing = store.get(mapKey);
      if (existing) {
        Object.assign(existing, update);
        return { ...existing };
      }
      const row: AchievementRow = { id: `ua-${++counter}`, unlockedAt: null, ...create };
      store.set(mapKey, row);
      return { ...row };
    }),
    findMany: jest.fn(async ({ where }: any) =>
      Array.from(store.values()).filter(
        (r) => r.accountId === where.accountId && r.userId === where.userId,
      ),
    ),
  };
}

interface PrismaOverrides {
  expenseCount?: number;
  incomeCount?: number;
  budgetCount?: number;
  referralCount?: number;
  timezone?: string;
  defaultAccountId?: string | null;
  activeBudgets?: any[];
  monthlyExpenses?: number;
  monthlyIncome?: number;
  budgetSpentByCurrency?: number;
  achievementRows?: AchievementRow[];
}

function makePrisma(overrides: PrismaOverrides = {}) {
  const {
    expenseCount = 0,
    incomeCount = 0,
    budgetCount = 0,
    referralCount = 0,
    timezone = 'UTC',
    defaultAccountId = null,
    activeBudgets = [],
    monthlyExpenses = 0,
    monthlyIncome = 0,
    budgetSpentByCurrency = 0,
    achievementRows = [],
  } = overrides;

  return {
    user: {
      findUnique: jest.fn(async ({ select }: any) => {
        if (select?.timezone !== undefined) return { timezone };
        if (select?.defaultAccountId !== undefined) return { defaultAccountId };
        return null;
      }),
    },
    expense: {
      count: jest.fn().mockResolvedValue(expenseCount),
      aggregate: jest.fn(async ({ where }: any) => {
        if (where.currencyCode) {
          return { _sum: { amount: budgetSpentByCurrency } };
        }
        return { _sum: { amount: monthlyExpenses } };
      }),
    },
    income: {
      count: jest.fn().mockResolvedValue(incomeCount),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: monthlyIncome } }),
    },
    budget: {
      count: jest.fn().mockResolvedValue(budgetCount),
      findMany: jest.fn().mockResolvedValue(activeBudgets),
    },
    referral: {
      count: jest.fn().mockResolvedValue(referralCount),
    },
    userAchievement: makeAchievementStore(achievementRows),
  };
}

function makeStreakService(streak: any, updateResult?: any) {
  return {
    getStreak: jest.fn().mockResolvedValue(streak),
    updateStreak: jest.fn().mockResolvedValue(
      updateResult ?? {
        currentStreak: streak?.currentStreak ?? 0,
        longestStreak: streak?.longestStreak ?? 0,
        updated: true,
      },
    ),
  };
}

const ACCOUNT_ID = 'acc-1';
const USER_ID = 'user-1';

describe('GamificationService.getProfile', () => {
  it('sums XP only from completed achievements and derives level/progress from it', async () => {
    const prisma = makePrisma();
    prisma.userAchievement.findMany = jest.fn().mockResolvedValue([
      { achievementId: 'first_expense', isCompleted: true, progress: 100, unlockedAt: new Date('2026-08-01') }, // +10 xp
      { achievementId: 'expenses_10', isCompleted: true, progress: 100, unlockedAt: new Date('2026-08-02') }, // +25 xp
      { achievementId: 'expenses_50', isCompleted: false, progress: 20, unlockedAt: null }, // not counted
    ]);
    const streakService = makeStreakService({ currentStreak: 5, longestStreak: 9, lastActivityDate: new Date('2026-08-02') });
    const service = new GamificationService(prisma as any, streakService as any);

    const profile = await service.getProfile(ACCOUNT_ID, USER_ID);

    expect(profile.totalXp).toBe(35);
    expect(profile.level).toBe(1);
    expect(profile.levelProgress).toBe(35);
    expect(profile.currentStreak).toBe(5);
    expect(profile.longestStreak).toBe(9);
    expect(profile.lastActivityDate).toBe(new Date('2026-08-02').toISOString());
  });

  it('reports zeroed streak fields when the user has no streak row', async () => {
    const prisma = makePrisma();
    const streakService = makeStreakService(null);
    const service = new GamificationService(prisma as any, streakService as any);

    const profile = await service.getProfile(ACCOUNT_ID, USER_ID);

    expect(profile.currentStreak).toBe(0);
    expect(profile.longestStreak).toBe(0);
    expect(profile.lastActivityDate).toBeUndefined();
    expect(profile.totalXp).toBe(0);
  });

  it('sorts recentBadges newest-first and caps at 5, excluding incomplete or unlockedAt-less rows', async () => {
    const prisma = makePrisma();
    const completedWithDates = Array.from({ length: 7 }, (_, i) => ({
      achievementId: `a${i}`,
      isCompleted: true,
      progress: 100,
      unlockedAt: new Date(2026, 0, i + 1),
    }));
    prisma.userAchievement.findMany = jest.fn().mockResolvedValue([
      ...completedWithDates,
      { achievementId: 'completed-no-date', isCompleted: true, progress: 100, unlockedAt: null },
      { achievementId: 'incomplete', isCompleted: false, progress: 40, unlockedAt: new Date(2026, 0, 20) },
    ]);
    const streakService = makeStreakService(null);
    const service = new GamificationService(prisma as any, streakService as any);

    const profile = await service.getProfile(ACCOUNT_ID, USER_ID);

    expect(profile.recentBadges).toHaveLength(5);
    expect(profile.recentBadges.map((b) => b.achievementId)).toEqual(['a6', 'a5', 'a4', 'a3', 'a2']);
  });
});

describe('GamificationService.checkAchievements', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates every achievement definition at zero progress for a brand-new account, and never marks any complete', async () => {
    const prisma = makePrisma();
    const streakService = makeStreakService(null);
    const service = new GamificationService(prisma as any, streakService as any);

    const result = await service.checkAchievements(ACCOUNT_ID, USER_ID);

    expect(result.newlyUnlocked).toEqual([]);
    // every one of the 16 definitions is created and pushed to updatedProgress, even at 0% —
    // this mirrors the service's actual (not necessarily ideal) behavior on a cold account.
    expect(result.updatedProgress).toHaveLength(16);
    expect(result.updatedProgress.every((p) => p.progress === 0)).toBe(true);

    const created = prisma.userAchievement._store.get(`${ACCOUNT_ID}::first_expense`);
    expect(created).toMatchObject({ progress: 0, isCompleted: false, unlockedAt: null });
  });

  it('unlocks milestone/streak/income achievements once their thresholds are met, at the exact threshold value', async () => {
    const prisma = makePrisma({ expenseCount: 10, incomeCount: 1 });
    const streakService = makeStreakService({ currentStreak: 7, longestStreak: 7 });
    const service = new GamificationService(prisma as any, streakService as any);

    const result = await service.checkAchievements(ACCOUNT_ID, USER_ID);

    const unlockedIds = result.newlyUnlocked.map((u) => u.achievementId);
    expect(unlockedIds).toEqual(
      expect.arrayContaining(['first_expense', 'expenses_10', 'streak_3', 'streak_7', 'first_income']),
    );
    expect(unlockedIds).not.toEqual(expect.arrayContaining(['expenses_50', 'expenses_100', 'streak_30']));

    // partial progress for a threshold not yet reached: 10/50 => 20%
    const partial = result.updatedProgress.find((p) => p.achievementId === 'expenses_50');
    expect(partial?.progress).toBe(20);
  });

  it('flips an existing non-completed row to completed via update(), rather than upsert()', async () => {
    const existingRow: AchievementRow = {
      id: 'ua-existing',
      userId: USER_ID,
      accountId: ACCOUNT_ID,
      achievementId: 'first_expense',
      progress: 0,
      isCompleted: false,
      unlockedAt: null,
    };
    const prisma = makePrisma({ expenseCount: 1, achievementRows: [existingRow] });
    const streakService = makeStreakService(null);
    const service = new GamificationService(prisma as any, streakService as any);

    const result = await service.checkAchievements(ACCOUNT_ID, USER_ID);

    expect(prisma.userAchievement.update).toHaveBeenCalledWith({
      where: { id: 'ua-existing' },
      data: expect.objectContaining({ progress: 100, isCompleted: true }),
    });
    expect(result.newlyUnlocked.map((u) => u.achievementId)).toContain('first_expense');
    const stored = prisma.userAchievement._store.get(`${ACCOUNT_ID}::first_expense`);
    expect(stored?.isCompleted).toBe(true);
  });

  it('bumps progress on an existing incomplete row via update() when progress increased, without touching isCompleted', async () => {
    const existingRow: AchievementRow = {
      id: 'ua-existing',
      userId: USER_ID,
      accountId: ACCOUNT_ID,
      achievementId: 'expenses_50',
      progress: 10,
      isCompleted: false,
      unlockedAt: null,
    };
    const prisma = makePrisma({ expenseCount: 20, achievementRows: [existingRow] });
    const streakService = makeStreakService(null);
    const service = new GamificationService(prisma as any, streakService as any);

    const result = await service.checkAchievements(ACCOUNT_ID, USER_ID);

    expect(prisma.userAchievement.update).toHaveBeenCalledWith({
      where: { id: 'ua-existing' },
      data: { progress: 40 },
    });
    expect(result.updatedProgress).toContainEqual({ achievementId: 'expenses_50', progress: 40 });
  });

  it('makes no write and reports nothing when an already-completed achievement is re-evaluated at the same or lower progress', async () => {
    const existingRow: AchievementRow = {
      id: 'ua-existing',
      userId: USER_ID,
      accountId: ACCOUNT_ID,
      achievementId: 'streak_3',
      progress: 100,
      isCompleted: true,
      unlockedAt: new Date('2026-08-01'),
    };
    const prisma = makePrisma({ achievementRows: [existingRow] });
    const streakService = makeStreakService({ currentStreak: 7, longestStreak: 7 });
    const service = new GamificationService(prisma as any, streakService as any);

    const result = await service.checkAchievements(ACCOUNT_ID, USER_ID);

    expect(prisma.userAchievement.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ua-existing' } }),
    );
    expect(result.newlyUnlocked.map((u) => u.achievementId)).not.toContain('streak_3');
    expect(result.updatedProgress.map((u) => u.achievementId)).not.toContain('streak_3');
  });

  describe('budget_month_no_exceed', () => {
    const activeBudget = {
      id: 'budget-1',
      currencyCode: 'USD',
      amount: 500,
      startDate: new Date('2026-08-01'),
      endDate: null,
      categoryAllocations: [],
    };

    it('only completes once compliant AND the month is at least 28 days in', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-28T12:00:00Z'));
      const prisma = makePrisma({ activeBudgets: [activeBudget], budgetSpentByCurrency: 100 });
      const streakService = makeStreakService(null);
      const service = new GamificationService(prisma as any, streakService as any);

      const result = await service.checkAchievements(ACCOUNT_ID, USER_ID);

      expect(result.newlyUnlocked.map((u) => u.achievementId)).toContain('budget_month_no_exceed');
    });

    it('stays incomplete before day 28 even when spend is within budget', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-10T12:00:00Z'));
      const prisma = makePrisma({ activeBudgets: [activeBudget], budgetSpentByCurrency: 100 });
      const streakService = makeStreakService(null);
      const service = new GamificationService(prisma as any, streakService as any);

      const result = await service.checkAchievements(ACCOUNT_ID, USER_ID);

      expect(result.newlyUnlocked.map((u) => u.achievementId)).not.toContain('budget_month_no_exceed');
      const progress = result.updatedProgress.find((p) => p.achievementId === 'budget_month_no_exceed');
      // day 10 of ~30 => 33%
      expect(progress?.progress).toBe(33);
    });

    it('never completes when the budget was exceeded, regardless of day of month', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00Z'));
      const prisma = makePrisma({ activeBudgets: [activeBudget], budgetSpentByCurrency: 999 });
      const streakService = makeStreakService(null);
      const service = new GamificationService(prisma as any, streakService as any);

      const result = await service.checkAchievements(ACCOUNT_ID, USER_ID);

      expect(result.newlyUnlocked.map((u) => u.achievementId)).not.toContain('budget_month_no_exceed');
      const progress = result.updatedProgress.find((p) => p.achievementId === 'budget_month_no_exceed');
      expect(progress?.progress).toBe(0);
    });
  });

  describe('budget_3months_no_exceed — documented known limitation', () => {
    it('caps at 33% progress and never reports completed, even when the prerequisite month achievement is complete', async () => {
      const monthRow: AchievementRow = {
        id: 'ua-month',
        userId: USER_ID,
        accountId: ACCOUNT_ID,
        achievementId: 'budget_month_no_exceed',
        progress: 100,
        isCompleted: true,
        unlockedAt: new Date('2026-07-28'),
      };
      const prisma = makePrisma({ achievementRows: [monthRow] });
      const streakService = makeStreakService(null);
      const service = new GamificationService(prisma as any, streakService as any);

      const result = await service.checkAchievements(ACCOUNT_ID, USER_ID);

      expect(result.newlyUnlocked.map((u) => u.achievementId)).not.toContain('budget_3months_no_exceed');
      const progress = result.updatedProgress.find((p) => p.achievementId === 'budget_3months_no_exceed');
      // "Simplified" per the source comment: this is the entire multi-month formula today.
      expect(progress?.progress).toBe(33);
    });

    it('stays at 0% when the prerequisite month achievement was never completed', async () => {
      const prisma = makePrisma();
      const streakService = makeStreakService(null);
      const service = new GamificationService(prisma as any, streakService as any);

      const result = await service.checkAchievements(ACCOUNT_ID, USER_ID);

      const progress = result.updatedProgress.find((p) => p.achievementId === 'budget_3months_no_exceed');
      expect(progress?.progress).toBe(0);
    });
  });

  describe('net_positive_month', () => {
    it('completes when income exceeds expenses this month', async () => {
      const prisma = makePrisma({ monthlyIncome: 2000, monthlyExpenses: 1000 });
      const streakService = makeStreakService(null);
      const service = new GamificationService(prisma as any, streakService as any);

      const result = await service.checkAchievements(ACCOUNT_ID, USER_ID);

      expect(result.newlyUnlocked.map((u) => u.achievementId)).toContain('net_positive_month');
    });

    it('does not complete when expenses meet or exceed income', async () => {
      const prisma = makePrisma({ monthlyIncome: 500, monthlyExpenses: 1000 });
      const streakService = makeStreakService(null);
      const service = new GamificationService(prisma as any, streakService as any);

      const result = await service.checkAchievements(ACCOUNT_ID, USER_ID);

      expect(result.newlyUnlocked.map((u) => u.achievementId)).not.toContain('net_positive_month');
    });

    it('stays at 0% when there has been no income or expense activity at all this month', async () => {
      const prisma = makePrisma({ monthlyIncome: 0, monthlyExpenses: 0 });
      const streakService = makeStreakService(null);
      const service = new GamificationService(prisma as any, streakService as any);

      const result = await service.checkAchievements(ACCOUNT_ID, USER_ID);

      const progress = result.updatedProgress.find((p) => p.achievementId === 'net_positive_month');
      expect(progress?.progress).toBe(0);
      expect(result.newlyUnlocked.map((u) => u.achievementId)).not.toContain('net_positive_month');
    });
  });

  describe('social achievements (referrals) — achievementAccountId redirect', () => {
    it('writes referral achievement rows to the referral (default) account, not the current account', async () => {
      const referralAccountId = 'acc-referral';
      const prisma = makePrisma({ referralCount: 5, defaultAccountId: referralAccountId });
      const streakService = makeStreakService(null);
      const service = new GamificationService(prisma as any, streakService as any);

      const result = await service.checkAchievements(ACCOUNT_ID, USER_ID);

      expect(result.newlyUnlocked.map((u) => u.achievementId)).toContain('referrals_5');
      expect(prisma.userAchievement._store.has(`${referralAccountId}::referrals_5`)).toBe(true);
      expect(prisma.userAchievement._store.has(`${ACCOUNT_ID}::referrals_5`)).toBe(false);
    });

    it('falls back to the current account when the user has no defaultAccountId set', async () => {
      const prisma = makePrisma({ referralCount: 10, defaultAccountId: null });
      const streakService = makeStreakService(null);
      const service = new GamificationService(prisma as any, streakService as any);

      const result = await service.checkAchievements(ACCOUNT_ID, USER_ID);

      expect(result.newlyUnlocked.map((u) => u.achievementId)).toContain('referrals_10_ambassador');
      expect(prisma.userAchievement._store.has(`${ACCOUNT_ID}::referrals_10_ambassador`)).toBe(true);
    });

    it('reports partial progress before the referral threshold is reached', async () => {
      const prisma = makePrisma({ referralCount: 2 });
      const streakService = makeStreakService(null);
      const service = new GamificationService(prisma as any, streakService as any);

      const result = await service.checkAchievements(ACCOUNT_ID, USER_ID);

      const progress = result.updatedProgress.find((p) => p.achievementId === 'referrals_5');
      expect(progress?.progress).toBe(40); // 2/5 = 40%
      expect(result.newlyUnlocked.map((u) => u.achievementId)).not.toContain('referrals_5');
    });
  });

  it('surfaces the streak update result from StreakService alongside achievement outcomes', async () => {
    const prisma = makePrisma();
    const streakService = makeStreakService(
      { currentStreak: 4, longestStreak: 4 },
      { currentStreak: 4, longestStreak: 4, updated: true },
    );
    const service = new GamificationService(prisma as any, streakService as any);

    const result = await service.checkAchievements(ACCOUNT_ID, USER_ID);

    expect(streakService.updateStreak).toHaveBeenCalledWith(ACCOUNT_ID, USER_ID, 'UTC');
    expect(result.streakUpdated).toBe(true);
    expect(result.currentStreak).toBe(4);
  });
});
