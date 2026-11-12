import type { PrismaService } from '../../database/prisma.service';
import { decodeCursor, encodeCursor } from './cursor.util';
import { PublicApiError } from './public-api-error';
import { getPublicExpense, getPublicReceipt, listPublicExpenseChanges, listPublicExpenses } from './public-expenses.query';

/**
 * A tiny in-memory evaluator for the subset of Prisma `where` this query emits on scalar
 * columns: equality, `lt`/`gte`/`lte`, `in`, `contains` (+ `mode: 'insensitive'`), `not: null`,
 * and `AND`/`OR`. Relation filters are not evaluated (the fixtures don't need them).
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
    if (key === 'projectExpenses') return true;
    const v = r[key];
    if (cond === null || typeof cond !== 'object' || cond instanceof Date) return cmp(v, cond) === 0;
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
        case 'in':
          return (arg as unknown[]).includes(v);
        case 'not':
          return arg === null ? v !== null && v !== undefined : cmp(v, arg) !== 0;
        case 'contains': {
          if (typeof v !== 'string') return false;
          return cond.mode === 'insensitive' ? v.toLowerCase().includes(String(arg).toLowerCase()) : v.includes(String(arg));
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
      const order: Array<Record<string, 'asc' | 'desc'>> = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy];
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
    prisma: { expense: { findMany, findFirst }, $queryRaw } as unknown as PrismaService,
    findMany,
    findFirst,
    clock,
    $queryRaw,
  };
}

const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function expense(n: number, date: string, extra: Row = {}): Row {
  return {
    id: id(n),
    accountId: 'acc-1',
    date: day(date),
    isDeleted: false,
    isPlanned: false,
    merchant: null,
    description: null,
    notes: null,
    categoryId: null,
    receiptImage: null,
    ...extra,
  };
}

describe('listPublicExpenses', () => {
  it('excludes planned and deleted expenses and other accounts', async () => {
    const { prisma } = fakePrisma([
      expense(1, '2026-10-01'),
      expense(2, '2026-10-02', { isPlanned: true }),
      expense(3, '2026-10-03', { isDeleted: true }),
      expense(4, '2026-10-04', { accountId: 'acc-2' }),
    ]);
    const page = await listPublicExpenses(prisma, 'acc-1', {});
    expect(page.rows.map((r) => r.id)).toEqual([id(1)]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('puts isPlanned:false in the query itself', async () => {
    const { prisma, findMany } = fakePrisma([]);
    await listPublicExpenses(prisma, 'acc-1', {});
    expect(findMany.mock.calls[0][0].where).toMatchObject({ accountId: 'acc-1', isDeleted: false, isPlanned: false });
  });

  it('merchant filter is a case-insensitive contains', async () => {
    const { prisma, findMany } = fakePrisma([
      expense(1, '2026-10-01', { merchant: 'BIEDRONKA 123' }),
      expense(2, '2026-10-02', { merchant: 'Lidl' }),
      expense(3, '2026-10-03', { merchant: 'biedronka' }),
    ]);
    const page = await listPublicExpenses(prisma, 'acc-1', { merchant: 'Biedronka' });
    expect(page.rows.map((r) => r.id)).toEqual([id(3), id(1)]);
    expect(findMany.mock.calls[0][0].where.merchant).toEqual({ contains: 'Biedronka', mode: 'insensitive' });
  });

  it('amount bounds (MCP only) are inclusive gte/lte on the row amount, and absent leaves amount unfiltered', async () => {
    const { prisma, findMany } = fakePrisma([]);
    await listPublicExpenses(prisma, 'acc-1', { min_amount: '10', max_amount: '25.50' });
    expect(findMany.mock.calls[0][0].where.amount).toEqual({ gte: '10', lte: '25.50' });
    await listPublicExpenses(prisma, 'acc-1', { min_amount: '10' });
    expect(findMany.mock.calls[1][0].where.amount).toEqual({ gte: '10' });
    await listPublicExpenses(prisma, 'acc-1', {});
    expect(findMany.mock.calls[2][0].where).not.toHaveProperty('amount');
  });

  it('date range is inclusive', async () => {
    const { prisma } = fakePrisma([
      expense(1, '2026-09-30'),
      expense(2, '2026-10-01'),
      expense(3, '2026-10-31'),
      expense(4, '2026-11-01'),
    ]);
    const page = await listPublicExpenses(prisma, 'acc-1', { date_from: '2026-10-01', date_to: '2026-10-31' });
    expect(page.rows.map((r) => r.id)).toEqual([id(3), id(2)]);
  });

  it('orders date desc, id desc and keyset page 2 starts right after page 1 with equal dates', async () => {
    const rows = [
      expense(1, '2026-10-05'),
      expense(2, '2026-10-05'),
      expense(3, '2026-10-05'),
      expense(4, '2026-10-05'),
      expense(5, '2026-10-04'),
      expense(6, '2026-10-06'),
    ];
    const { prisma } = fakePrisma(rows);

    const p1 = await listPublicExpenses(prisma, 'acc-1', { limit: 3 });
    expect(p1.rows.map((r) => r.id)).toEqual([id(6), id(4), id(3)]);
    expect(p1.hasMore).toBe(true);
    expect(decodeCursor(p1.nextCursor!, 2)).toEqual(['2026-10-05', id(3)]);

    const p2 = await listPublicExpenses(prisma, 'acc-1', { limit: 3, cursor: p1.nextCursor! });
    expect(p2.rows.map((r) => r.id)).toEqual([id(2), id(1), id(5)]);
    expect(p2.hasMore).toBe(false);
    expect(p2.nextCursor).toBeNull();
  });

  it('defaults to 50 and fetches one extra row to know has_more', async () => {
    const { prisma, findMany } = fakePrisma([]);
    await listPublicExpenses(prisma, 'acc-1', {});
    expect(findMany.mock.calls[0][0].take).toBe(51);
  });

  it('keeps search and the cursor predicate both applied (AND, not a clobbered OR)', async () => {
    const { prisma } = fakePrisma([
      expense(1, '2026-10-01', { description: 'coffee' }),
      expense(2, '2026-10-02', { notes: 'Coffee beans' }),
      expense(3, '2026-10-03', { description: 'tea' }),
      expense(4, '2026-10-04', { description: 'COFFEE' }),
    ]);
    const p1 = await listPublicExpenses(prisma, 'acc-1', { search: 'coffee', limit: 1 });
    expect(p1.rows.map((r) => r.id)).toEqual([id(4)]);
    const p2 = await listPublicExpenses(prisma, 'acc-1', { search: 'coffee', limit: 5, cursor: p1.nextCursor! });
    expect(p2.rows.map((r) => r.id)).toEqual([id(2), id(1)]);
  });

  it('marks has_receipt from receiptImage IS NOT NULL without selecting the bytes', async () => {
    const { prisma, findMany } = fakePrisma([
      expense(1, '2026-10-01', { receiptImage: Buffer.from('x') }),
      expense(2, '2026-10-02'),
    ]);
    const page = await listPublicExpenses(prisma, 'acc-1', {});
    expect(page.rows.map((r) => [r.id, r.hasReceipt])).toEqual([
      [id(2), false],
      [id(1), true],
    ]);
    for (const call of findMany.mock.calls) {
      expect(JSON.stringify(call[0].select)).not.toContain('receiptImage');
    }
  });

  it.each([
    ['a non-date first part', encodeCursor(['yesterday', id(1)])],
    ['an impossible date', encodeCursor(['2026-02-30', id(1)])],
    ['an empty id', encodeCursor(['2026-10-01', ''])],
    ['garbage', '%%%'],
  ])('rejects a cursor with %s as invalid_cursor', async (_label, cursor) => {
    const { prisma } = fakePrisma([]);
    await expect(listPublicExpenses(prisma, 'acc-1', { cursor })).rejects.toMatchObject({ code: 'invalid_cursor' });
  });
});

describe('getPublicExpense', () => {
  it('matches the server id only and returns the row with items selected', async () => {
    const { prisma, findFirst } = fakePrisma([expense(1, '2026-10-01')]);
    const r = await getPublicExpense(prisma, 'acc-1', id(1));
    expect(r.id).toBe(id(1));
    expect(r.hasReceipt).toBe(false);
    const where = findFirst.mock.calls[0][0].where;
    expect(where).toEqual({ id: id(1), accountId: 'acc-1', isDeleted: false, isPlanned: false });
    expect(findFirst.mock.calls[0][0].select.items).toBeDefined();
  });

  it.each([
    ['planned', { isPlanned: true }],
    ['deleted', { isDeleted: true }],
    ['in another account', { accountId: 'acc-2' }],
  ])('404s an expense that is %s', async (_label, extra) => {
    const { prisma } = fakePrisma([expense(1, '2026-10-01', extra)]);
    const err = await getPublicExpense(prisma, 'acc-1', id(1)).catch((e) => e);
    expect(err).toBeInstanceOf(PublicApiError);
    expect(err.getStatus()).toBe(404);
    expect(err.code).toBe('not_found');
  });

  it('does not resolve by clientId', async () => {
    const { prisma } = fakePrisma([expense(1, '2026-10-01', { clientId: 'local-1' })]);
    await expect(getPublicExpense(prisma, 'acc-1', 'local-1')).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('listPublicExpenseChanges', () => {
  const at = (iso: string) => new Date(iso);
  const T0 = '2026-10-01T10:00:00.123Z';
  const changeId = (c: { type: 'upsert'; row: { id: string } } | { type: 'delete'; id: string }) =>
    c.type === 'upsert' ? c.row.id : c.id;

  it('returns 250 rows with an identical updatedAt exactly once across pages of 100 (Review Focus 5)', async () => {
    const rows = Array.from({ length: 250 }, (_, i) => expense(i + 1, '2026-10-01', { updatedAt: at(T0) }));
    const { prisma } = fakePrisma(rows);

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
      const page = await listPublicExpenseChanges(prisma, 'acc-1', { limit: 100, cursor });
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
    const { prisma } = fakePrisma([expense(1, '2026-10-01', { updatedAt: at(T0) })]);
    const page = await listPublicExpenseChanges(prisma, 'acc-1', {});
    expect(decodeCursor(page.nextCursor, 2)).toEqual([T0, id(1)]);
  });

  it('orders by (updatedAt, id) ascending and resumes strictly after the cursor tuple', async () => {
    const { prisma, findMany } = fakePrisma([
      expense(3, '2026-10-01', { updatedAt: at('2026-10-01T10:00:00.002Z') }),
      expense(1, '2026-10-01', { updatedAt: at('2026-10-01T10:00:00.001Z') }),
      expense(2, '2026-10-01', { updatedAt: at('2026-10-01T10:00:00.001Z') }),
    ]);
    const p1 = await listPublicExpenseChanges(prisma, 'acc-1', { limit: 2 });
    expect(p1.changes.map(changeId)).toEqual([id(1), id(2)]);
    expect(p1.hasMore).toBe(true);
    expect(findMany.mock.calls[0][0].orderBy).toEqual([{ updatedAt: 'asc' }, { id: 'asc' }]);

    const p2 = await listPublicExpenseChanges(prisma, 'acc-1', { limit: 2, cursor: p1.nextCursor });
    expect(p2.changes.map(changeId)).toEqual([id(3)]);
    expect(p2.hasMore).toBe(false);
  });

  it('emits a soft-deleted row as a delete with deleted_at = its updatedAt', async () => {
    const { prisma } = fakePrisma([expense(1, '2026-10-01', { isDeleted: true, updatedAt: at(T0) })]);
    const page = await listPublicExpenseChanges(prisma, 'acc-1', {});
    expect(page.changes).toEqual([{ type: 'delete', id: id(1), deletedAt: at(T0) }]);
  });

  it('emits a planned row as a delete (an expense that became planned leaves the integrator view)', async () => {
    const { prisma } = fakePrisma([expense(1, '2026-10-01', { isPlanned: true, updatedAt: at(T0) })]);
    const page = await listPublicExpenseChanges(prisma, 'acc-1', {});
    expect(page.changes).toEqual([{ type: 'delete', id: id(1), deletedAt: at(T0) }]);
  });

  it('upserts a live row with items selected and has_receipt attached, never selecting the bytes', async () => {
    const { prisma, findMany } = fakePrisma([
      expense(1, '2026-10-01', { updatedAt: at(T0), receiptImage: Buffer.from('x') }),
    ]);
    const page = await listPublicExpenseChanges(prisma, 'acc-1', {});
    expect(page.changes).toHaveLength(1);
    const [c] = page.changes;
    expect(c.type).toBe('upsert');
    if (c.type === 'upsert') expect(c.row.hasReceipt).toBe(true);
    expect(findMany.mock.calls[0][0].select.items).toBeDefined();
    for (const call of findMany.mock.calls) {
      expect(JSON.stringify(call[0].select)).not.toContain('receiptImage');
    }
  });

  it("never returns another account's rows", async () => {
    const { prisma, findMany } = fakePrisma([expense(1, '2026-10-01', { accountId: 'acc-2', updatedAt: at(T0) })]);
    const page = await listPublicExpenseChanges(prisma, 'acc-1', {});
    expect(page.changes).toEqual([]);
    expect(findMany.mock.calls[0][0].where.accountId).toBe('acc-1');
  });

  it('returns the input cursor unchanged on an empty page', async () => {
    const { prisma } = fakePrisma([expense(1, '2026-10-01', { updatedAt: at(T0) })]);
    const p1 = await listPublicExpenseChanges(prisma, 'acc-1', {});
    const p2 = await listPublicExpenseChanges(prisma, 'acc-1', { cursor: p1.nextCursor });
    expect(p2.changes).toEqual([]);
    expect(p2.hasMore).toBe(false);
    expect(p2.nextCursor).toBe(p1.nextCursor);
  });

  it('returns a usable start cursor on an empty first page, which later picks up new rows', async () => {
    const rows: Row[] = [];
    const { prisma } = fakePrisma(rows);
    const p1 = await listPublicExpenseChanges(prisma, 'acc-1', {});
    expect(p1.changes).toEqual([]);
    expect(typeof p1.nextCursor).toBe('string');
    rows.push(expense(1, '2026-10-01', { updatedAt: at(T0) }));
    const p2 = await listPublicExpenseChanges(prisma, 'acc-1', { cursor: p1.nextCursor });
    expect(p2.changes.map(changeId)).toEqual([id(1)]);
  });

  it('re-delivers an expense whose updatedAt was bumped after the client passed it', async () => {
    const row = expense(1, '2026-10-01', { updatedAt: at(T0) });
    const { prisma } = fakePrisma([row]);
    const p1 = await listPublicExpenseChanges(prisma, 'acc-1', {});
    expect(p1.changes).toHaveLength(1);
    // What touchExpenses does after a line-item edit.
    row.updatedAt = at('2026-10-01T10:00:01.000Z');
    const p2 = await listPublicExpenseChanges(prisma, 'acc-1', { cursor: p1.nextCursor });
    expect(p2.changes.map(changeId)).toEqual([id(1)]);
  });

  describe('safety lag (Ruling 21)', () => {
    const NOW = new Date('2026-10-01T12:00:00.000Z');
    const ago = (s: number) => new Date(NOW.getTime() - s * 1000);

    it('holds back a row updated 5 s ago (DB clock) and serves it once it is 11 s old', async () => {
      const row = expense(1, '2026-10-01', { updatedAt: ago(5) });
      const { prisma, clock, $queryRaw } = fakePrisma([row]);
      clock.now = NOW;

      const p1 = await listPublicExpenseChanges(prisma, 'acc-1', {});
      expect(p1.changes).toEqual([]);
      expect($queryRaw).toHaveBeenCalled();

      row.updatedAt = ago(11);
      const p2 = await listPublicExpenseChanges(prisma, 'acc-1', {});
      expect(p2.changes.map(changeId)).toEqual([id(1)]);
    });

    it('an empty page with only in-window rows returns the input cursor and has_more=false', async () => {
      const rows = [expense(1, '2026-10-01', { updatedAt: ago(30) })];
      const { prisma, clock } = fakePrisma(rows);
      clock.now = NOW;
      const p1 = await listPublicExpenseChanges(prisma, 'acc-1', {});
      expect(p1.changes.map(changeId)).toEqual([id(1)]);

      rows.push(expense(2, '2026-10-01', { updatedAt: ago(5) }), expense(3, '2026-10-01', { updatedAt: ago(1) }));
      const p2 = await listPublicExpenseChanges(prisma, 'acc-1', { cursor: p1.nextCursor, limit: 1 });
      expect(p2.changes).toEqual([]);
      expect(p2.hasMore).toBe(false);
      expect(p2.nextCursor).toBe(p1.nextCursor);
    });

    it('next_cursor stops at the last settled row, before in-window rows', async () => {
      const { prisma, clock } = fakePrisma([
        expense(1, '2026-10-01', { updatedAt: ago(20) }),
        expense(2, '2026-10-01', { updatedAt: ago(3) }),
      ]);
      clock.now = NOW;
      const page = await listPublicExpenseChanges(prisma, 'acc-1', {});
      expect(page.changes.map(changeId)).toEqual([id(1)]);
      expect(page.hasMore).toBe(false);
      expect(decodeCursor(page.nextCursor, 2)).toEqual([ago(20).toISOString(), id(1)]);
    });

    it('puts updatedAt <= dbNow - 10 s into the query itself', async () => {
      const { prisma, clock, findMany } = fakePrisma([]);
      clock.now = NOW;
      await listPublicExpenseChanges(prisma, 'acc-1', {});
      expect(findMany.mock.calls[0][0].where.updatedAt).toEqual({ lte: ago(10) });
    });
  });

  it('defaults to 200 and fetches one extra row', async () => {
    const { prisma, findMany } = fakePrisma([]);
    await listPublicExpenseChanges(prisma, 'acc-1', {});
    expect(findMany.mock.calls[0][0].take).toBe(201);
  });

  it.each([
    ['a date-only first part', encodeCursor(['2026-10-01', id(1)])],
    ['a timestamp without milliseconds', encodeCursor(['2026-10-01T10:00:00Z', id(1)])],
    ['a non-canonical timestamp', encodeCursor(['2026-10-01T10:00:00.000+00:00', id(1)])],
    ['an impossible timestamp', encodeCursor(['2026-02-30T10:00:00.000Z', id(1)])],
    ['a bad id', encodeCursor(['2026-10-01T10:00:00.000Z', "x' OR 1=1"])],
    ['the wrong arity', encodeCursor(['2026-10-01T10:00:00.000Z'])],
  ])('rejects a cursor with %s as invalid_cursor', async (_label, cursor) => {
    const { prisma } = fakePrisma([]);
    await expect(listPublicExpenseChanges(prisma, 'acc-1', { cursor })).rejects.toMatchObject({ code: 'invalid_cursor' });
  });
});

describe('getPublicReceipt', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

  it('returns the bytes with the sniffed content type and extension, ignoring the stored mime', async () => {
    const { prisma, findFirst } = fakePrisma([
      expense(1, '2026-10-01', { receiptImage: PNG, receiptMimeType: 'text/html' }),
    ]);
    const r = await getPublicReceipt(prisma, 'acc-1', id(1));
    expect(r.id).toBe(id(1));
    expect(r.contentType).toBe('image/png');
    expect(r.extension).toBe('png');
    expect(Buffer.compare(r.bytes, PNG)).toBe(0);
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: id(1), accountId: 'acc-1', isDeleted: false, isPlanned: false });
  });

  it('serves unrecognised bytes as application/octet-stream rather than a guessed or stored type', async () => {
    const { prisma } = fakePrisma([
      expense(1, '2026-10-01', { receiptImage: Buffer.from('<html>'), receiptMimeType: 'text/html' }),
    ]);
    const r = await getPublicReceipt(prisma, 'acc-1', id(1));
    expect(r.contentType).toBe('application/octet-stream');
    expect(r.extension).toBe('bin');
  });

  it.each([
    ['has no image', {}],
    ['is planned', { isPlanned: true, receiptImage: PNG }],
    ['is deleted', { isDeleted: true, receiptImage: PNG }],
    ['is in another account', { accountId: 'acc-2', receiptImage: PNG }],
  ])('404s when the expense %s', async (_label, extra) => {
    const { prisma } = fakePrisma([expense(1, '2026-10-01', extra)]);
    await expect(getPublicReceipt(prisma, 'acc-1', id(1))).rejects.toMatchObject({ code: 'not_found' });
  });
});
