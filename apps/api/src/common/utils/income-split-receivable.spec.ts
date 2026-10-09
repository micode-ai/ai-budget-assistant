/**
 * Shared-groups phase 2, task H1: `Income.isSplitReceivable` is spread into
 * every income total through `EXCLUDE_SPLIT_RECEIVABLE`. Nothing sets the
 * flag yet, so the change must be behaviour-neutral.
 *
 * The proof, per touched total: each service runs against a fake Prisma whose
 * `income` model evaluates the `where` the way Postgres would, with an absent
 * `isSplitReceivable` reading as `false` (the migration's `NOT NULL DEFAULT
 * false`). Then:
 *  - unflagged rows are all counted: the figure equals the sum of the rows,
 *    which is exactly what the query returned before the predicate existed;
 *  - adding a flagged income changes NOTHING in the result, deep-equal;
 *  - every income query carries `isSplitReceivable: false` and never `isDebt`
 *    (a borrowed-money row is a real inflow, the receipt-split rule).
 *
 * Moved past only by a deliberate change: delete the spread from any of these
 * queries and its "flagged changes nothing" case fails.
 */
import { AnalyticsService } from '../../modules/analytics/analytics.service';
import { WalletService } from '../../modules/wallet/wallet.service';
import { SafeToSpendService } from '../../modules/insights/safe-to-spend.service';
import { WrappedService } from '../../modules/insights/wrapped.service';
import { StoryService } from '../../modules/insights/story.service';
import { RealSalaryService } from '../../modules/insights/real-salary/real-salary.service';
import { DigestService } from '../../modules/reports/digest.service';
import { ReportSchedulerService } from '../../modules/reports/report-scheduler.service';
import { GamificationService } from '../../modules/gamification/gamification.service';
import { GoalPlannerService } from '../../modules/ai/services/goal-planner.service';

type Row = Record<string, any>;

const NOW = new Date('2026-10-15T12:00:00.000Z');
const day = (d: string) => new Date(`${d}T12:00:00.000Z`);

/** Row-level `where` evaluation for the subset of Prisma the income queries use. */
function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (key === 'OR') {
      if (!(cond as Row[]).some((c) => matches(row, c))) return false;
      continue;
    }
    if (key === 'AND') {
      if (!(cond as Row[]).every((c) => matches(row, c))) return false;
      continue;
    }
    // Column defaults, as the database applies them.
    const value = row[key] ?? (key === 'isSplitReceivable' || key === 'isDeleted' ? false : undefined);
    if (cond === null || typeof cond !== 'object' || cond instanceof Date) {
      if (value === undefined) continue; // a field the fixture does not model
      const a = value instanceof Date ? value.getTime() : value;
      const b = cond instanceof Date ? cond.getTime() : cond;
      if (a !== b) return false;
      continue;
    }
    const c = cond as Row;
    if ('in' in c) {
      if (value !== undefined && !(c.in as unknown[]).includes(value)) return false;
      continue;
    }
    if ('gte' in c || 'lte' in c || 'gt' in c || 'lt' in c) {
      if (value === undefined) continue;
      const t = value instanceof Date ? value.getTime() : Number(value);
      if (c.gte !== undefined && t < new Date(c.gte).getTime()) return false;
      if (c.lte !== undefined && t > new Date(c.lte).getTime()) return false;
      if (c.gt !== undefined && t <= new Date(c.gt).getTime()) return false;
      if (c.lt !== undefined && t >= new Date(c.lt).getTime()) return false;
      continue;
    }
    // A relation filter (`account: {...}`) — not modelled; every row passes.
  }
  return true;
}

function incomeModel(rows: Row[], wheres: Row[]) {
  const pick = (args: Row = {}) => {
    wheres.push(args.where ?? {});
    return rows.filter((r) => matches(r, args.where));
  };
  return {
    findMany: jest.fn(async (args?: Row) => pick(args)),
    count: jest.fn(async (args?: Row) => pick(args).length),
    aggregate: jest.fn(async (args?: Row) => {
      const hit = pick(args);
      return { _sum: { amount: hit.length ? hit.reduce((s, r) => s + Number(r.amount), 0) : null } };
    }),
    groupBy: jest.fn(async (args: Row) => {
      const hit = pick(args);
      const groups = new Map<string, Row>();
      for (const r of hit) {
        const key = (args.by as string[]).map((k) => r[k]).join('|');
        const g = groups.get(key) ?? { ...Object.fromEntries((args.by as string[]).map((k) => [k, r[k]])), _sum: { amount: 0 } };
        g._sum.amount += Number(r.amount);
        groups.set(key, g);
      }
      return [...groups.values()];
    }),
  };
}

/** Every other model answers "nothing here", unless a case overrides it. */
function defaultModel(): Row {
  return new Proxy({}, {
    get: (target: Row, method: string) => {
      if (!target[method]) {
        target[method] = jest.fn(async () => {
          if (method === 'findMany' || method === 'groupBy') return [];
          if (method === 'count') return 0;
          if (method === 'aggregate') return { _sum: { amount: null, fromAmount: null, toAmount: null } };
          if (method === 'findUnique' || method === 'findFirst') return null;
          return {};
        });
      }
      return target[method];
    },
  });
}

function fakePrisma(incomes: Row[], overrides: Record<string, Row> = {}) {
  const wheres: Row[] = [];
  const models: Record<string, Row> = { income: incomeModel(incomes, wheres), ...overrides };
  const prisma = new Proxy({}, {
    get: (_t, model: string) => {
      if (model === 'incomeWheres') return wheres;
      if (model === '$transaction') return async (x: unknown) => (Array.isArray(x) ? Promise.all(x) : (x as (tx: unknown) => unknown)(prisma));
      if (!models[model]) models[model] = defaultModel();
      return models[model];
    },
  }) as any;
  return prisma;
}

const rates = { getRates: jest.fn(async () => ({ rates: { PLN: 1, EUR: 0.25, USD: 0.27 } })) };
const cache = () => ({ get: jest.fn(async () => null), set: jest.fn(async () => undefined), del: jest.fn(async () => undefined), delByPrefix: jest.fn(async () => undefined) });

const plain = (over: Row = {}): Row => ({
  id: 'i', accountId: 'a1', userId: 'u1', amount: 0, currencyCode: 'PLN', date: day('2026-10-05'),
  description: 'Salary', isDeleted: false, isDebt: false, isDebtRepayment: false, clientId: 'c', ...over,
});

/** An incoming settlement transfer, as the budget mirror (H2) will flag it. */
const flagged = (over: Row = {}): Row => plain({ id: 'settle', clientId: 'settle', amount: 777, description: 'Group settle-up', isSplitReceivable: true, ...over });

/** Runs `run` twice — the base rows, then the same rows plus flagged incomes — and returns both. */
async function twice<T>(base: Row[], extra: Row[], run: (prisma: any) => Promise<T>) {
  const withoutFlag = fakePrisma(base);
  const withFlag = fakePrisma([...base, ...extra]);
  const settle = async (p: any) => {
    try { return { ok: await run(p) }; } catch (e) { return { error: String(e) }; }
  };
  const a = await settle(withoutFlag);
  const b = await settle(withFlag);
  return { a, b, wheres: [...withoutFlag.incomeWheres, ...withFlag.incomeWheres] as Row[] };
}

function expectEveryIncomeQueryExcludes(wheres: Row[]) {
  expect(wheres.length).toBeGreaterThan(0);
  for (const w of wheres) {
    expect(w.isSplitReceivable).toBe(false);
    expect(w.isDebt).toBeUndefined();
  }
}

beforeAll(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
});
afterAll(() => jest.useRealTimers());

const salary = [plain({ id: 's1', clientId: 's1', amount: 3000 }), plain({ id: 's2', clientId: 's2', amount: 200, isSplitReceivable: false, currencyCode: 'EUR' })];

describe('income totals exclude split-receivable incomes and are otherwise unchanged (task H1)', () => {
  it('AnalyticsService.getSummary — totalIncome', async () => {
    const { a, b, wheres } = await twice(salary, [flagged()], (p) =>
      new AnalyticsService(p, cache() as any).getSummary('a1', day('2026-10-01'), day('2026-10-31')),
    );
    expect((a.ok as any).totalIncome).toBe(3200);
    expect(b).toEqual(a);
    expectEveryIncomeQueryExcludes(wheres);
  });

  it('AnalyticsService.getAggregatedSummary — totalIncome across accounts', async () => {
    const run = (p: any) => {
      p.accountMember.findMany.mockResolvedValue([{ accountId: 'a1' }]);
      p.account.findMany.mockResolvedValue([{ id: 'a1', encryptionTier: 0 }]);
      return new AnalyticsService(p, cache() as any).getAggregatedSummary('u1', day('2026-10-01'), day('2026-10-31'));
    };
    const { a, b, wheres } = await twice(salary, [flagged()], run);
    expect((a.ok as any).totalIncome).toBe(3200);
    expect(b).toEqual(a);
    expectEveryIncomeQueryExcludes(wheres);
  });

  it('AnalyticsService.getProjectBreakdown — a project`s income total filters the linked income', async () => {
    const p = fakePrisma([]);
    await new AnalyticsService(p, cache() as any).getProjectBreakdown('a1');
    const include = p.project.findMany.mock.calls[0][0].include;
    expect(include.projectIncomes.where.income).toEqual({ isSplitReceivable: false });
    expect(include.projectExpenses.where.expense).toEqual({ isSplitReceivable: false });
  });

  it('WalletService.getSummary — balance and totalIncomes per currency', async () => {
    const run = (p: any) => {
      p.walletBalance.findMany.mockResolvedValue([{ currencyCode: 'PLN', initialAmount: 100, isDeleted: false }]);
      return new WalletService(p).getSummary('a1');
    };
    const { a, b, wheres } = await twice(salary, [flagged(), flagged({ id: 'f2', currencyCode: 'USD' })], run);
    const pln = (a.ok as any).balances.find((s: Row) => s.currencyCode === 'PLN');
    expect(pln.totalIncomes).toBe(3000);
    expect(pln.currentBalance).toBe(3100);
    expect(b).toEqual(a);
    expectEveryIncomeQueryExcludes(wheres);
  });

  it('WalletService.getSummariesForAccounts — every account card', async () => {
    const run = (p: any) => {
      p.accountMember.findMany.mockResolvedValue([{ accountId: 'a1', account: { id: 'a1', name: 'Main', type: 'personal', currencyCode: 'PLN', encryptionTier: 0, isActive: true } }]);
      p.account.findMany.mockResolvedValue([{ id: 'a1', name: 'Main', type: 'personal', currencyCode: 'PLN', encryptionTier: 0 }]);
      p.walletBalance.findMany.mockResolvedValue([{ accountId: 'a1', currencyCode: 'PLN', initialAmount: 0, isDeleted: false }]);
      return new WalletService(p).getSummariesForAccounts('u1');
    };
    const { a, b, wheres } = await twice(salary, [flagged()], run);
    expect(b).toEqual(a);
    expectEveryIncomeQueryExcludes(wheres);
  });

  it('WalletService.getBalanceHistory — daily points', async () => {
    const run = (p: any) => {
      p.walletBalance.findMany.mockResolvedValue([{ currencyCode: 'PLN', initialAmount: 100, isDeleted: false }]);
      return new WalletService(p).getBalanceHistory('a1', 30);
    };
    const { a, b, wheres } = await twice(salary, [flagged()], run);
    expect((a.ok as any).points.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
    expectEveryIncomeQueryExcludes(wheres);
  });

  it('WalletService.getMonthlyBalanceHistory — monthly net change', async () => {
    const { a, b, wheres } = await twice(salary, [flagged()], (p) => new WalletService(p).getMonthlyBalanceHistory('a1', 3));
    const months = (a.ok as any).months as Row[];
    expect(JSON.stringify(months)).toContain('3000');
    expect(b).toEqual(a);
    expectEveryIncomeQueryExcludes(wheres);
  });

  it('SafeToSpendService — inferred monthly income ignores a recurring flagged inflow', async () => {
    const base = [
      plain({ id: 'm1', amount: 3000, date: day('2026-07-20') }),
      plain({ id: 'm2', amount: 3000, date: day('2026-08-20') }),
      plain({ id: 'm3', amount: 3000, date: day('2026-09-20') }),
    ];
    // A larger flagged monthly series, due again this month: counted, it would
    // win the inference and replace the salary as the expected income.
    const extra = [
      flagged({ id: 'f1', amount: 5000, date: day('2026-07-25') }),
      flagged({ id: 'f2', amount: 5000, date: day('2026-08-25') }),
      flagged({ id: 'f3', amount: 5000, date: day('2026-09-25') }),
    ];
    const run = (p: any) => {
      const svc = new SafeToSpendService(p, {} as any, rates as any, cache() as any);
      return (svc as any).inferMonthlyIncome('a1', 'PLN', { PLN: 1 }, day('2026-10-31'), NOW);
    };
    const { a, b, wheres } = await twice(base, extra, run);
    expect((a.ok as any).expectedIncome).toBe(3000);
    expect(b).toEqual(a);
    expectEveryIncomeQueryExcludes(wheres);
  });

  const wrappedDeps = () => [
    rates as any,
    cache() as any,
    { getPriceIndexSeries: jest.fn(async () => []), getPersonalInflation: jest.fn(async () => null) } as any,
    { getStreak: jest.fn(async () => ({ currentStreak: 0, longestStreak: 0 })) } as any,
  ] as const;

  it('WrappedService.getWrapped — yearly deck', async () => {
    const { a, b, wheres } = await twice(salary, [flagged()], (p) =>
      new WrappedService(p, ...wrappedDeps()).getWrapped('a1', 'u1', 'PLN', 2026),
    );
    expect(b).toEqual(a);
    expectEveryIncomeQueryExcludes(wheres);
  });

  it('WrappedService.getMonthlyWrapped — monthly deck', async () => {
    const { a, b, wheres } = await twice(salary, [flagged()], (p) =>
      new WrappedService(p, ...wrappedDeps()).getMonthlyWrapped('a1', 'u1', 'PLN', 2026, 10),
    );
    expect(b).toEqual(a);
    expectEveryIncomeQueryExcludes(wheres);
  });

  it('DigestService.getDigest — totalIncome, savings rate, change vs last month', async () => {
    const base = [...salary, plain({ id: 'prev', amount: 1000, date: day('2026-09-10') })];
    const run = (p: any) => {
      p.account.findUnique.mockResolvedValue({ encryptionTier: 0, currencyCode: 'PLN' });
      p.monthlyDigestCache.upsert.mockImplementation(async (args: Row) => ({ createdAt: NOW, ...args.create }));
      return new DigestService(p).getDigest('a1', '2026-10');
    };
    const { a, b, wheres } = await twice(base, [flagged(), flagged({ id: 'f2', date: day('2026-09-12') })], run);
    expect(JSON.stringify(a)).toContain('"totalIncome":3000');
    expect(b).toEqual(a);
    expectEveryIncomeQueryExcludes(wheres);
  });

  it('ReportSchedulerService — weekly e-mail and monthly digest figures', async () => {
    const user = {
      id: 'u1', email: 'u@example.com', name: 'U', weeklyEmailEnabled: true, monthlyDigestEnabled: true, language: 'en',
      subscription: { tier: 'business' },
      accountMembers: [{ account: { id: 'a1', name: 'Main', currencyCode: 'PLN', encryptionTier: 0 } }],
    };
    const base = [plain({ id: 'w', amount: 900, date: day('2026-10-12') }), plain({ id: 'm', amount: 2500, date: day('2026-09-05') })];
    const extra = [flagged({ date: day('2026-10-13') }), flagged({ id: 'f2', date: day('2026-09-06') })];
    const run = async (p: any) => {
      p.user.findUnique.mockResolvedValue(user);
      p.user.findMany.mockResolvedValue([user]);
      const mail = { sendWeeklyReport: jest.fn(async () => undefined), sendMonthlyDigest: jest.fn(async () => undefined) };
      const svc = new ReportSchedulerService(p, mail as any, rates as any);
      await svc.processWeeklyEmailsForUser('u1');
      await svc.processMonthlyDigests();
      return { weekly: mail.sendWeeklyReport.mock.calls, monthly: mail.sendMonthlyDigest.mock.calls };
    };
    const { a, b, wheres } = await twice(base, extra, run);
    expect((a.ok as any).weekly).toHaveLength(1);
    expect((a.ok as any).monthly).toHaveLength(1);
    expect(JSON.stringify((a.ok as any).weekly)).toContain('900');
    expect(JSON.stringify((a.ok as any).monthly)).toContain('2500');
    expect(b).toEqual(a);
    expectEveryIncomeQueryExcludes(wheres);
  });

  it('GamificationService.checkAchievements — the net-positive-month income sum', async () => {
    const run = (p: any) => {
      const streak = {
        updateStreak: jest.fn(async () => ({ currentStreak: 1, longestStreak: 1, isNewDay: false })),
        getStreak: jest.fn(async () => ({ currentStreak: 1, longestStreak: 1 })),
      };
      // 1000 spent this month against a 10 income: not net positive, unless
      // the flagged 5000 were counted.
      p.expense.aggregate.mockResolvedValue({ _sum: { amount: 1000 } });
      return new GamificationService(p, streak as any).checkAchievements('a1', 'u1');
    };
    // The base keeps one ordinary income so `first_income` (incomeCount >= 1,
    // the only count-based income rule) is met in both runs.
    const { a, b, wheres } = await twice([plain({ id: 'tiny', amount: 10 })], [flagged({ amount: 5000 })], run);
    expect(b).toEqual(a);
    // The achievement-count query (`income.count`) is activity, not a total,
    // and deliberately keeps every logged income.
    const sums = wheres.filter((w) => w.date);
    expectEveryIncomeQueryExcludes(sums);
  });

  it('StoryService — the period income the narrative is built from', async () => {
    const run = async (p: any) => {
      const svc = new StoryService({ get: () => 'test-key' } as any, p, {} as any, {} as any, rates as any);
      (svc as any).openai = { chat: { completions: { create: jest.fn(async () => { throw new Error('no network in tests'); }) } } };
      return (svc as any).generateStory('a1', day('2026-10-01'), day('2026-10-31'), 'Oct', 'en', 0, 'balanced', 'u1', 'PLN');
    };
    const { a, b, wheres } = await twice(salary, [flagged()], run);
    expect(b).toEqual(a);
    expectEveryIncomeQueryExcludes(wheres);
  });

  it('GoalPlannerService.generatePlan — average monthly income', async () => {
    const run = async (p: any) => {
      p.savingsGoal.findFirst.mockResolvedValue({ id: 'g1', accountId: 'a1', userId: 'u1', name: 'Car', targetAmount: 1000, currentAmount: 0, currencyCode: 'PLN', deadline: day('2027-06-01') });
      const svc = new GoalPlannerService({ get: () => 'test-key' } as any, p);
      (svc as any).openai = { chat: { completions: { create: jest.fn(async () => { throw new Error('no network in tests'); }) } } };
      return svc.generatePlan('a1', 'g1', 'u1');
    };
    const { a, b, wheres } = await twice(salary, [flagged()], run);
    expect(b).toEqual(a);
    expectEveryIncomeQueryExcludes(wheres);
  });

  it('RealSalaryService — the salary history it reads', async () => {
    const run = async (p: any) => {
      p.account.findUnique.mockResolvedValue({ encryptionTier: 0 });
      p.user.findUnique.mockResolvedValue({ timezone: 'UTC', inflationCountry: 'PL' });
      p.salaryProfile.findUnique.mockResolvedValue({ salaryKey: 'desc:salary', manualPreviousMonthly: null });
      const any = () => new Proxy({}, { get: () => jest.fn(async () => null) });
      const svc = new RealSalaryService(p, cache() as any, rates as any, any() as any, any() as any, any() as any);
      return svc.compute('a1', 'u1', 'PLN');
    };
    const { a, b, wheres } = await twice(salary, [flagged()], run);
    expect(b).toEqual(a);
    expectEveryIncomeQueryExcludes(wheres);
  });
});
