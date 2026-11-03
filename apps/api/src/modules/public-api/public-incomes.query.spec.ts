import type { PrismaService } from '../../database/prisma.service';
import { decodeCursor, encodeCursor } from './cursor.util';
import { PublicApiError } from './public-api-error';
import {
  getPublicIncome,
  listPublicIncomeChanges,
  listPublicIncomes,
} from './public-incomes.query';

/**
 * A tiny in-memory evaluator for the subset of Prisma `where` the income queries emit on scalar
 * columns: equality, `lt`/`gt`/`gte`/`lte`, `contains` (+ `mode: 'insensitive'`), and `AND`/`OR`.
 */
type Row = Record<string, unknown>;
const cmp = (a: unknown, b: unknown) => {
  const av = a instanceof Date ? a.getTime() : (a as string);
  const bv = b instanceof Date ? b.getTime() : (b as string);
  return av < bv ? -1 : av > bv ? 1 : 0;
};
function matches(r: Row, where: Record<string, any>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'AND') return (cond as Row[]).every((w) => matches(r, w));
    if (key === 'OR') return (cond as Row[]).some((w) => matches(r, w));
    if (key === 'projectIncomes') return true;
    const v = r[key];
    if (cond === null || typeof cond !== 'object' || cond instanceof Date)
      return cmp(v, cond) === 0;
    return Object.entries(cond).every(([op, arg]) => {
      switch (op) {
        case 'lt':
          return cmp(v, arg) < 0;
        case 'gt':
          return cmp(v, arg) > 0;
        case 'gte':
          return cmp(v, arg) >= 0;
        case 'lte':
          return cmp(v, arg) <= 0;
        case 'contains': {
          if (typeof v !== 'string') return false;
          return cond.mode === 'insensitive'
            ? v.toLowerCase().includes(String(arg).toLowerCase())
            : v.includes(String(arg));
        }
        case 'mode':
          return true;
        default:
          throw new Error(`fake prisma: unsupported operator ${op}`);
      }
    });
  });
}

function fakePrisma(rows: Row[]) {
  const findMany = jest.fn(async (args: any) => {
    let out = rows.filter((r) => matches(r, args.where));
    if (args.orderBy) {
      const order: Array<Record<string, 'asc' | 'desc'>> = Array.isArray(args.orderBy)
        ? args.orderBy
        : [args.orderBy];
      out = [...out].sort((a, b) => {
        for (const o of order) {
          const [k, dir] = Object.entries(o)[0];
          const c = cmp(a[k], b[k]);
          if (c !== 0) return dir === 'desc' ? -c : c;
        }
        return 0;
      });
    }
    if (args.take !== undefined) out = out.slice(0, args.take);
    return out;
  });
  const findFirst = jest.fn(async (args: any) => (await findMany({ ...args, take: 1 }))[0] ?? null);
  // The DB clock for the changes feed's safety lag; far ahead of every fixture unless a test moves it.
  const clock = { now: new Date('2030-01-01T00:00:00.000Z') };
  const $queryRaw = jest.fn(async () => [{ now: clock.now }]);
  return {
    prisma: { income: { findMany, findFirst }, $queryRaw } as unknown as PrismaService,
    findMany,
    findFirst,
    clock,
    $queryRaw,
  };
}

const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function income(n: number, date: string, extra: Row = {}): Row {
  return {
    id: id(n),
    accountId: 'acc-1',
    date: day(date),
    isDeleted: false,
    description: null,
    notes: null,
    categoryId: null,
    ...extra,
  };
}

describe('listPublicIncomes', () => {
  it('is account-scoped and excludes deleted incomes, with no isPlanned predicate', async () => {
    const { prisma, findMany } = fakePrisma([
      income(1, '2026-10-01'),
      income(2, '2026-10-03', { isDeleted: true }),
      income(3, '2026-10-04', { accountId: 'acc-2' }),
    ]);
    const page = await listPublicIncomes(prisma, 'acc-1', {});
    expect(page.rows.map((r) => r.id)).toEqual([id(1)]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
    expect(findMany.mock.calls[0][0].where).toEqual({ accountId: 'acc-1', isDeleted: false });
  });

  it('date range is inclusive: a row dated exactly `to` (and `from`) is included', async () => {
    const { prisma } = fakePrisma([
      income(1, '2026-09-30'),
      income(2, '2026-10-01'),
      income(3, '2026-10-31'),
      income(4, '2026-11-01'),
    ]);
    const page = await listPublicIncomes(prisma, 'acc-1', { date_from: '2026-10-01', date_to: '2026-10-31' });
    expect(page.rows.map((r) => r.id)).toEqual([id(3), id(2)]);
  });

  it('puts the category and project filters into the query itself', async () => {
    const { prisma, findMany } = fakePrisma([]);
    await listPublicIncomes(prisma, 'acc-1', { category_id: 'c-1', project_id: 'p-1' });
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      categoryId: 'c-1',
      projectIncomes: { some: { projectId: 'p-1', isDeleted: false } },
    });
  });

  it('orders date desc, id desc and keyset page 2 starts right after page 1 with equal dates', async () => {
    const { prisma } = fakePrisma([
      income(1, '2026-10-05'),
      income(2, '2026-10-05'),
      income(3, '2026-10-05'),
      income(4, '2026-10-05'),
      income(5, '2026-10-04'),
      income(6, '2026-10-06'),
    ]);
    const p1 = await listPublicIncomes(prisma, 'acc-1', { limit: 3 });
    expect(p1.rows.map((r) => r.id)).toEqual([id(6), id(4), id(3)]);
    expect(p1.hasMore).toBe(true);
    expect(decodeCursor(p1.nextCursor!, 2)).toEqual(['2026-10-05', id(3)]);

    const p2 = await listPublicIncomes(prisma, 'acc-1', { limit: 3, cursor: p1.nextCursor! });
    expect(p2.rows.map((r) => r.id)).toEqual([id(2), id(1), id(5)]);
    expect(p2.hasMore).toBe(false);
    expect(p2.nextCursor).toBeNull();
  });

  it('defaults to 50 and fetches one extra row to know has_more', async () => {
    const { prisma, findMany } = fakePrisma([]);
    await listPublicIncomes(prisma, 'acc-1', {});
    expect(findMany.mock.calls[0][0].take).toBe(51);
  });

  it('keeps search and the cursor predicate both applied (AND, not a clobbered OR)', async () => {
    const { prisma } = fakePrisma([
      income(1, '2026-10-01', { description: 'salary' }),
      income(2, '2026-10-02', { notes: 'Salary bonus' }),
      income(3, '2026-10-03', { description: 'gift' }),
      income(4, '2026-10-04', { description: 'SALARY' }),
    ]);
    const p1 = await listPublicIncomes(prisma, 'acc-1', { search: 'salary', limit: 1 });
    expect(p1.rows.map((r) => r.id)).toEqual([id(4)]);
    const p2 = await listPublicIncomes(prisma, 'acc-1', {
      search: 'salary',
      limit: 5,
      cursor: p1.nextCursor!,
    });
    expect(p2.rows.map((r) => r.id)).toEqual([id(2), id(1)]);
  });

  it.each([
    ['a non-date first part', encodeCursor(['yesterday', id(1)])],
    ['an impossible date', encodeCursor(['2026-02-30', id(1)])],
    ['an empty id', encodeCursor(['2026-10-01', ''])],
    ['garbage', '%%%'],
  ])('rejects a cursor with %s as invalid_cursor', async (_label, cursor) => {
    const { prisma } = fakePrisma([]);
    await expect(listPublicIncomes(prisma, 'acc-1', { cursor })).rejects.toMatchObject({
      code: 'invalid_cursor',
    });
  });
});

describe('getPublicIncome', () => {
  it('matches the server id within the account only', async () => {
    const { prisma, findFirst } = fakePrisma([income(1, '2026-10-01')]);
    const r = await getPublicIncome(prisma, 'acc-1', id(1));
    expect(r.id).toBe(id(1));
    expect(findFirst.mock.calls[0][0].where).toEqual({
      id: id(1),
      accountId: 'acc-1',
      isDeleted: false,
    });
  });

  it.each([
    ['deleted', { isDeleted: true }],
    ['in another account', { accountId: 'acc-2' }],
  ])('404s an income that is %s', async (_label, extra) => {
    const { prisma } = fakePrisma([income(1, '2026-10-01', extra)]);
    const err = await getPublicIncome(prisma, 'acc-1', id(1)).catch((e) => e);
    expect(err).toBeInstanceOf(PublicApiError);
    expect(err.getStatus()).toBe(404);
    expect(err.code).toBe('not_found');
  });

  it('does not resolve by clientId', async () => {
    const { prisma } = fakePrisma([income(1, '2026-10-01', { clientId: 'local-1' })]);
    await expect(getPublicIncome(prisma, 'acc-1', 'local-1')).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('listPublicIncomeChanges', () => {
  const at = (iso: string) => new Date(iso);
  const T0 = '2026-10-01T10:00:00.123Z';
  const changeId = (c: { type: 'upsert'; row: { id: string } } | { type: 'delete'; id: string }) =>
    c.type === 'upsert' ? c.row.id : c.id;

  it('returns 250 rows with an identical updatedAt exactly once across pages of 100', async () => {
    const rows = Array.from({ length: 250 }, (_, i) =>
      income(i + 1, '2026-10-01', { updatedAt: at(T0) })
    );
    const { prisma } = fakePrisma(rows);

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
      const page = await listPublicIncomeChanges(prisma, 'acc-1', { limit: 100, cursor });
      pages++;
      seen.push(...page.changes.map(changeId));
      expect(typeof page.nextCursor).toBe('string');
      cursor = page.nextCursor;
      if (!page.hasMore) break;
    }
    expect(pages).toBe(3);
    expect(seen).toHaveLength(250);
    expect(new Set(seen).size).toBe(250);
    expect(seen).toEqual(rows.map((r) => r.id));
  });

  it('keeps the exact millisecond of updated_at in the cursor', async () => {
    const { prisma } = fakePrisma([income(1, '2026-10-01', { updatedAt: at(T0) })]);
    const page = await listPublicIncomeChanges(prisma, 'acc-1', {});
    expect(decodeCursor(page.nextCursor, 2)).toEqual([T0, id(1)]);
  });

  it('orders by (updatedAt, id) ascending and resumes strictly after the cursor tuple', async () => {
    const { prisma, findMany } = fakePrisma([
      income(3, '2026-10-01', { updatedAt: at('2026-10-01T10:00:00.002Z') }),
      income(1, '2026-10-01', { updatedAt: at('2026-10-01T10:00:00.001Z') }),
      income(2, '2026-10-01', { updatedAt: at('2026-10-01T10:00:00.001Z') }),
    ]);
    const p1 = await listPublicIncomeChanges(prisma, 'acc-1', { limit: 2 });
    expect(p1.changes.map(changeId)).toEqual([id(1), id(2)]);
    expect(p1.hasMore).toBe(true);
    expect(findMany.mock.calls[0][0].orderBy).toEqual([{ updatedAt: 'asc' }, { id: 'asc' }]);

    const p2 = await listPublicIncomeChanges(prisma, 'acc-1', { limit: 2, cursor: p1.nextCursor });
    expect(p2.changes.map(changeId)).toEqual([id(3)]);
    expect(p2.hasMore).toBe(false);
  });

  it('emits a soft-deleted row as a delete with deleted_at = its updatedAt', async () => {
    const { prisma } = fakePrisma([
      income(1, '2026-10-01', { isDeleted: true, updatedAt: at(T0) }),
    ]);
    const page = await listPublicIncomeChanges(prisma, 'acc-1', {});
    expect(page.changes).toEqual([{ type: 'delete', id: id(1), deletedAt: at(T0) }]);
  });

  it('upserts a live row without the feed-only flag', async () => {
    const { prisma } = fakePrisma([income(1, '2026-10-01', { updatedAt: at(T0) })]);
    const page = await listPublicIncomeChanges(prisma, 'acc-1', {});
    const [c] = page.changes;
    expect(c.type).toBe('upsert');
    if (c.type === 'upsert') expect(c.row).not.toHaveProperty('isDeleted');
  });

  it("never returns another account's rows", async () => {
    const { prisma, findMany } = fakePrisma([
      income(1, '2026-10-01', { accountId: 'acc-2', updatedAt: at(T0) }),
    ]);
    const page = await listPublicIncomeChanges(prisma, 'acc-1', {});
    expect(page.changes).toEqual([]);
    expect(findMany.mock.calls[0][0].where.accountId).toBe('acc-1');
  });

  it('returns the input cursor unchanged on an empty page', async () => {
    const { prisma } = fakePrisma([income(1, '2026-10-01', { updatedAt: at(T0) })]);
    const p1 = await listPublicIncomeChanges(prisma, 'acc-1', {});
    const p2 = await listPublicIncomeChanges(prisma, 'acc-1', { cursor: p1.nextCursor });
    expect(p2.changes).toEqual([]);
    expect(p2.hasMore).toBe(false);
    expect(p2.nextCursor).toBe(p1.nextCursor);
  });

  it('returns a usable start cursor on an empty first page, which later picks up new rows', async () => {
    const rows: Row[] = [];
    const { prisma } = fakePrisma(rows);
    const p1 = await listPublicIncomeChanges(prisma, 'acc-1', {});
    expect(p1.changes).toEqual([]);
    rows.push(income(1, '2026-10-01', { updatedAt: at(T0) }));
    const p2 = await listPublicIncomeChanges(prisma, 'acc-1', { cursor: p1.nextCursor });
    expect(p2.changes.map(changeId)).toEqual([id(1)]);
  });

  it('re-delivers an income whose updatedAt was bumped after the client passed it', async () => {
    const row = income(1, '2026-10-01', { updatedAt: at(T0) });
    const { prisma } = fakePrisma([row]);
    const p1 = await listPublicIncomeChanges(prisma, 'acc-1', {});
    expect(p1.changes).toHaveLength(1);
    row.updatedAt = at('2026-10-01T10:00:01.000Z');
    const p2 = await listPublicIncomeChanges(prisma, 'acc-1', { cursor: p1.nextCursor });
    expect(p2.changes.map(changeId)).toEqual([id(1)]);
  });

  describe('safety lag', () => {
    const NOW = new Date('2026-10-01T12:00:00.000Z');
    const ago = (s: number) => new Date(NOW.getTime() - s * 1000);

    it('holds back a row updated 5 s ago (DB clock) and serves it once it is 11 s old', async () => {
      const row = income(1, '2026-10-01', { updatedAt: ago(5) });
      const { prisma, clock, $queryRaw } = fakePrisma([row]);
      clock.now = NOW;

      const p1 = await listPublicIncomeChanges(prisma, 'acc-1', {});
      expect(p1.changes).toEqual([]);
      expect($queryRaw).toHaveBeenCalled();

      row.updatedAt = ago(11);
      const p2 = await listPublicIncomeChanges(prisma, 'acc-1', {});
      expect(p2.changes.map(changeId)).toEqual([id(1)]);
    });

    it('an empty page with only in-window rows returns the input cursor and has_more=false', async () => {
      const rows = [income(1, '2026-10-01', { updatedAt: ago(30) })];
      const { prisma, clock } = fakePrisma(rows);
      clock.now = NOW;
      const p1 = await listPublicIncomeChanges(prisma, 'acc-1', {});
      expect(p1.changes.map(changeId)).toEqual([id(1)]);

      rows.push(
        income(2, '2026-10-01', { updatedAt: ago(5) }),
        income(3, '2026-10-01', { updatedAt: ago(1) })
      );
      const p2 = await listPublicIncomeChanges(prisma, 'acc-1', {
        cursor: p1.nextCursor,
        limit: 1,
      });
      expect(p2.changes).toEqual([]);
      expect(p2.hasMore).toBe(false);
      expect(p2.nextCursor).toBe(p1.nextCursor);
    });

    it('next_cursor stops at the last settled row, before in-window rows', async () => {
      const { prisma, clock } = fakePrisma([
        income(1, '2026-10-01', { updatedAt: ago(20) }),
        income(2, '2026-10-01', { updatedAt: ago(3) }),
      ]);
      clock.now = NOW;
      const page = await listPublicIncomeChanges(prisma, 'acc-1', {});
      expect(page.changes.map(changeId)).toEqual([id(1)]);
      expect(page.hasMore).toBe(false);
      expect(decodeCursor(page.nextCursor, 2)).toEqual([ago(20).toISOString(), id(1)]);
    });

    it('puts updatedAt <= dbNow - 10 s into the query itself', async () => {
      const { prisma, clock, findMany } = fakePrisma([]);
      clock.now = NOW;
      await listPublicIncomeChanges(prisma, 'acc-1', {});
      expect(findMany.mock.calls[0][0].where.updatedAt).toEqual({ lte: ago(10) });
    });
  });

  it('defaults to 200 and fetches one extra row', async () => {
    const { prisma, findMany } = fakePrisma([]);
    await listPublicIncomeChanges(prisma, 'acc-1', {});
    expect(findMany.mock.calls[0][0].take).toBe(201);
  });

  it.each([
    ['a date-only first part', encodeCursor(['2026-10-01', id(1)])],
    ['a timestamp without milliseconds', encodeCursor(['2026-10-01T10:00:00Z', id(1)])],
    ['an impossible timestamp', encodeCursor(['2026-02-30T10:00:00.000Z', id(1)])],
    ['a bad id', encodeCursor(['2026-10-01T10:00:00.000Z', "x' OR 1=1"])],
    ['the wrong arity', encodeCursor(['2026-10-01T10:00:00.000Z'])],
  ])('rejects a cursor with %s as invalid_cursor', async (_label, cursor) => {
    const { prisma } = fakePrisma([]);
    await expect(listPublicIncomeChanges(prisma, 'acc-1', { cursor })).rejects.toMatchObject({
      code: 'invalid_cursor',
    });
  });
});
