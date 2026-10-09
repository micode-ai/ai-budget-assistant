/**
 * ABA-660: the EXPENSE totals that summed without `EXCLUDE_SPLIT_RECEIVABLE` (the gap ABA-659 recorded)
 * now exclude split receivables: the monthly digest, the scheduled weekly and monthly report e-mails,
 * gamification's net-positive month (and its budget check), the spending story, the goal planner and
 * the report export's totals. This DELIBERATELY changes figures for anyone with a receipt split: the
 * split's debt rows (`isDebt: true, isSplitReceivable: true`) record a receivable for money that
 * already left as the receipt itself, and the budget mirror's linked group cash legs carry the same
 * flag, so counting them reports 350 of spend for one 200 dinner.
 *
 * The proof, per total: each service runs against a fake Prisma whose `expense` model evaluates the
 * `where` the way Postgres would. Then:
 *  - ordinary rows are all counted (the figure equals their sum: unchanged for everyone else);
 *  - adding a receipt split's debt rows changes NOTHING, deep-equal (they are now excluded);
 *  - every expense TOTAL query carries `isSplitReceivable: false` and never `isDebt` (a standalone cash
 *    loan's debt row IS the outflow, the receipt-split rule).
 * The report export still LISTS the flagged row (it is a ledger of what was recorded); only its totals
 * and category table leave it out.
 */
import { DigestService } from '../../modules/reports/digest.service';
import { ReportSchedulerService } from '../../modules/reports/report-scheduler.service';
import { ReportsService } from '../../modules/reports/reports.service';
import { GamificationService } from '../../modules/gamification/gamification.service';
import { StoryService } from '../../modules/insights/story.service';
import { GoalPlannerService } from '../../modules/ai/services/goal-planner.service';

type Row = Record<string, any>;

const NOW = new Date('2026-10-15T12:00:00.000Z');
const day = (d: string) => new Date(`${d}T12:00:00.000Z`);

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
    const value = row[key] ?? (key === 'isSplitReceivable' || key === 'isDeleted' || key === 'isDebt' ? false : undefined);
    if (cond === null || typeof cond !== 'object' || cond instanceof Date) {
      if (value === undefined) continue;
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
  }
  return true;
}

function model(rows: Row[], wheres: Row[]) {
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
      const out = [...groups.values()];
      if (args.orderBy?._sum?.amount === 'desc') out.sort((a, b) => b._sum.amount - a._sum.amount);
      return args.take ? out.slice(0, args.take) : out;
    }),
  };
}

function defaultModel(): Row {
  return new Proxy({}, {
    get: (target: Row, method: string) => {
      if (!target[method]) {
        target[method] = jest.fn(async () => {
          if (method === 'findMany' || method === 'groupBy') return [];
          if (method === 'count') return 0;
          if (method === 'aggregate') return { _sum: { amount: null } };
          if (method === 'findUnique' || method === 'findFirst') return null;
          return {};
        });
      }
      return target[method];
    },
  });
}

function fakePrisma(expenses: Row[], incomes: Row[]) {
  const wheres: Row[] = [];
  const models: Record<string, Row> = { expense: model(expenses, wheres), income: model(incomes, []) };
  const prisma = new Proxy({}, {
    get: (_t, name: string) => {
      if (name === 'expenseWheres') return wheres;
      if (name === '$transaction') return async (x: unknown) => (Array.isArray(x) ? Promise.all(x) : (x as (tx: unknown) => unknown)(prisma));
      if (!models[name]) models[name] = defaultModel();
      return models[name];
    },
  }) as any;
  return prisma;
}

const rates = { getRates: jest.fn(async () => ({ rates: { PLN: 1, EUR: 0.25, USD: 0.27 } })) };

const exp = (over: Row = {}): Row => ({
  id: 'e', accountId: 'a1', userId: 'u1', amount: 0, currencyCode: 'PLN', date: day('2026-10-05'), categoryId: 'cat-food',
  category: { id: 'cat-food', name: 'Food' }, description: 'Groceries', isDeleted: false, isDebt: false, isPlanned: false,
  expenseTags: [], projectExpenses: [], clientId: 'c', ...over,
});
/** A receipt split's receivable: a debt row for money that already left as the receipt. */
const receivable = (over: Row = {}): Row =>
  exp({ id: 'rcv', clientId: 'rcv', amount: 900, description: 'Kolya owes', isDebt: true, isSplitReceivable: true, debtContactName: 'Kolya', ...over });
const inc = (over: Row = {}): Row => ({ id: 'i', accountId: 'a1', userId: 'u1', amount: 1000, currencyCode: 'PLN', date: day('2026-10-02'), isDeleted: false, incomeTags: [], projectIncomes: [], ...over });

async function twice<T>(base: Row[], extra: Row[], incomes: Row[], run: (prisma: any) => Promise<T>) {
  const without = fakePrisma(base, incomes);
  const withRcv = fakePrisma([...base, ...extra], incomes);
  const settle = async (p: any) => {
    try { return { ok: await run(p) }; } catch (e) { return { error: String(e) }; }
  };
  const a = await settle(without);
  const b = await settle(withRcv);
  return { a, b, wheres: [...without.expenseWheres, ...withRcv.expenseWheres] as Row[] };
}

/** Every expense query that has a date range is a total here; each must exclude, never by isDebt. */
function expectTotalsExclude(wheres: Row[]) {
  const totals = wheres.filter((w) => w.date);
  expect(totals.length).toBeGreaterThan(0);
  for (const w of totals) {
    expect(w.isSplitReceivable).toBe(false);
    expect(w.isDebt).toBeUndefined();
  }
}

beforeAll(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
});
afterAll(() => jest.useRealTimers());

const spend = [exp({ id: 'e1', clientId: 'e1', amount: 200 }), exp({ id: 'e2', clientId: 'e2', amount: 100, categoryId: 'cat-fun', category: { id: 'cat-fun', name: 'Fun' } })];

describe('expense totals exclude split receivables (ABA-660, the gap ABA-659 recorded)', () => {
  it('DigestService.getDigest — total spend, top categories, change vs last month', async () => {
    const base = [...spend, exp({ id: 'prev', amount: 150, date: day('2026-09-10') })];
    const run = (p: any) => {
      p.account.findUnique.mockResolvedValue({ encryptionTier: 0, currencyCode: 'PLN' });
      p.monthlyDigestCache.upsert.mockImplementation(async (args: Row) => ({ createdAt: NOW, ...args.create }));
      return new DigestService(p).getDigest('a1', '2026-10');
    };
    const { a, b, wheres } = await twice(base, [receivable(), receivable({ id: 'rcv-prev', date: day('2026-09-11') })], [inc()], run);
    expect(JSON.stringify(a)).toContain('"totalExpenses":300');
    expect(b).toEqual(a);
    expectTotalsExclude(wheres);
  });

  it('ReportSchedulerService — the weekly e-mail and the monthly digest figures', async () => {
    const user = {
      id: 'u1', email: 'u@example.com', name: 'U', weeklyEmailEnabled: true, monthlyDigestEnabled: true, language: 'en',
      subscription: { tier: 'business' },
      accountMembers: [{ account: { id: 'a1', name: 'Main', currencyCode: 'PLN', encryptionTier: 0 } }],
    };
    const base = [exp({ id: 'w', amount: 120, date: day('2026-10-12') }), exp({ id: 'm', amount: 640, date: day('2026-09-05') })];
    const extra = [receivable({ date: day('2026-10-13') }), receivable({ id: 'rcv-2', date: day('2026-09-06') })];
    const run = async (p: any) => {
      p.user.findUnique.mockResolvedValue(user);
      p.user.findMany.mockResolvedValue([user]);
      const mail = { sendWeeklyReport: jest.fn(async () => undefined), sendMonthlyDigest: jest.fn(async () => undefined) };
      const svc = new ReportSchedulerService(p, mail as any, rates as any);
      await svc.processWeeklyEmailsForUser('u1');
      await svc.processMonthlyDigests();
      return { weekly: mail.sendWeeklyReport.mock.calls, monthly: mail.sendMonthlyDigest.mock.calls };
    };
    const { a, b, wheres } = await twice(base, extra, [inc({ date: day('2026-10-12') })], run);
    expect((a.ok as any).weekly).toHaveLength(1);
    expect((a.ok as any).monthly).toHaveLength(1);
    expect(JSON.stringify((a.ok as any).weekly)).toContain('120');
    expect(JSON.stringify((a.ok as any).monthly)).toContain('640');
    expect(b).toEqual(a);
    expectTotalsExclude(wheres);
  });

  it('GamificationService — a receipt split no longer costs the net-positive month', async () => {
    const run = (p: any) => {
      const streak = {
        updateStreak: jest.fn(async () => ({ currentStreak: 1, longestStreak: 1, isNewDay: false })),
        getStreak: jest.fn(async () => ({ currentStreak: 1, longestStreak: 1 })),
      };
      p.budget.findMany.mockResolvedValue([{ id: 'b1', currencyCode: 'PLN', amount: 500, startDate: day('2026-10-01'), endDate: null, categoryAllocations: [] }]);
      return new GamificationService(p, streak as any).checkAchievements('a1', 'u1');
    };
    // Income 1000, real spend 300: net positive. Counted, the 900 receivable made it 1200 > 1000.
    const { a, b, wheres } = await twice(spend, [receivable()], [inc()], run);
    const pick = (r: any) => ({
      net: r.ok.newlyUnlocked.some((x: Row) => x.achievementId === 'net_positive_month'),
      progress: r.ok.updatedProgress.filter((x: Row) => x.achievementId.startsWith('budget_')),
    });
    expect(pick(a).net).toBe(true);
    expect(pick(b)).toEqual(pick(a));
    // The achievement count (`expense.count`, no date) is activity, not a total, and keeps every row.
    expectTotalsExclude(wheres);
  });

  it('StoryService — the spending the narrative is built from', async () => {
    const run = async (p: any) => {
      const svc = new StoryService({ get: () => 'test-key' } as any, p, {} as any, {} as any, rates as any);
      (svc as any).openai = { chat: { completions: { create: jest.fn(async () => { throw new Error('no network in tests'); }) } } };
      return (svc as any).generateStory('a1', day('2026-10-01'), day('2026-10-31'), 'Oct', 'en', 0, 'balanced', 'u1', 'PLN');
    };
    const { a, b, wheres } = await twice(spend, [receivable(), receivable({ id: 'rcv-prev', date: day('2026-09-20') })], [inc()], run);
    expect(b).toEqual(a);
    expectTotalsExclude(wheres);
  });

  it('GoalPlannerService.generatePlan — average monthly spend', async () => {
    const run = async (p: any) => {
      p.savingsGoal.findFirst.mockResolvedValue({ id: 'g1', accountId: 'a1', userId: 'u1', name: 'Car', targetAmount: 1000, currentAmount: 0, currencyCode: 'PLN', deadline: day('2027-06-01') });
      const svc = new GoalPlannerService({ get: () => 'test-key' } as any, p);
      (svc as any).openai = { chat: { completions: { create: jest.fn(async () => { throw new Error('no network in tests'); }) } } };
      return svc.generatePlan('a1', 'g1', 'u1');
    };
    const { a, b, wheres } = await twice(spend, [receivable()], [inc()], run);
    expect(b).toEqual(a);
    expectTotalsExclude(wheres);
  });

  describe('ReportsService.generateReport — totals exclude, the rows are still listed', () => {
    const run = (format: 'pdf' | 'csv' | 'xlsx') => async (p: any) => {
      p.account.findUnique.mockResolvedValue({ encryptionTier: 0, name: 'Main', currencyCode: 'PLN' });
      p.generatedReport.create.mockImplementation(async (args: Row) => ({ id: 'r1', ...args.data }));
      const pdf = { generate: jest.fn(async (_data: Row) => Buffer.from('pdf')) };
      const csv = { generate: jest.fn((_rows: Row[]) => Buffer.from('csv')) };
      const xlsx = { generate: jest.fn(async (_data: Row) => Buffer.from('xlsx')) };
      const svc = new ReportsService(p, csv as any, pdf as any, xlsx as any, rates as any);
      await svc.generateReport('a1', 'u1', { format, startDate: '2026-10-01', endDate: '2026-10-31' } as any, 'PLN');
      return { pdf: pdf.generate.mock.calls[0]?.[0], csv: csv.generate.mock.calls[0]?.[0], xlsx: xlsx.generate.mock.calls[0]?.[0] };
    };

    it('PDF: totalExpenses and the category table leave the receivable out; the transaction list keeps it', async () => {
      const { a, b } = await twice(spend, [receivable()], [inc()], run('pdf'));
      const pa = (a.ok as any).pdf;
      const pb = (b.ok as any).pdf;
      expect(pa.totalExpenses).toBe(300);
      expect(pb.totalExpenses).toBe(300);
      expect(pb.categories).toEqual(pa.categories);
      expect(pb.totalIncome).toBe(1000);
      expect(pb.transactions).toHaveLength(pa.transactions.length + 1);
      expect(pb.transactions.some((t: Row) => t.amount === 900)).toBe(true);
    });

    it('Excel: the same totals, every recorded row on the sheet', async () => {
      const { a, b } = await twice(spend, [receivable()], [inc()], run('xlsx'));
      expect((b.ok as any).xlsx.totalExpenses).toBe((a.ok as any).xlsx.totalExpenses);
      expect((b.ok as any).xlsx.categories).toEqual((a.ok as any).xlsx.categories);
      expect((b.ok as any).xlsx.expenses).toHaveLength(3);
    });

    it('CSV is a plain ledger: the receivable row is exported as recorded', async () => {
      const { b } = await twice(spend, [receivable()], [inc()], run('csv'));
      expect((b.ok as any).csv.filter((r: Row) => r.type === 'expense')).toHaveLength(3);
    });
  });

  it('a standalone cash loan (isDebt WITHOUT the split flag) is still counted: never filtered by isDebt', async () => {
    const loan = exp({ id: 'loan', amount: 500, isDebt: true, description: 'Lent Kolya 500' });
    const run = (p: any) => {
      p.account.findUnique.mockResolvedValue({ encryptionTier: 0, currencyCode: 'PLN' });
      p.monthlyDigestCache.upsert.mockImplementation(async (args: Row) => ({ createdAt: NOW, ...args.create }));
      return new DigestService(p).getDigest('a1', '2026-10');
    };
    const { a } = await twice([...spend, loan], [], [inc()], run);
    expect(JSON.stringify(a)).toContain('"totalExpenses":800');
  });
});
