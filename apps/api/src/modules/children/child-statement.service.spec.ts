import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChildStatementService, selectReceipts } from './child-statement.service';
import { ChildrenService } from './children.service';
import { ChildProductRulesService } from './child-product-rules.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const childRow = (over: Record<string, any> = {}) => ({
  id: 'child-1',
  clientId: null,
  accountId: 'acc-1',
  name: 'Ala',
  color: null,
  archivedAt: null,
  isDeleted: false,
  syncVersion: 0,
  encryptedPayload: null,
  encryptionKeyVersion: null,
  ...over,
});

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

/** An expense row as the statement query selects it. */
const expenseRow = (over: Record<string, any> = {}) => ({
  id: 'e1',
  amount: 100,
  discountAmount: null,
  currencyCode: 'PLN',
  date: d('2026-03-10'),
  description: 'Shoes',
  merchant: 'CCC',
  categoryId: 'cat-clothes',
  isSplitReceivable: false,
  isPlanned: false,
  isDeleted: false,
  category: { name: 'Clothes' },
  categorySplits: [],
  expenseChildren: [{ childId: 'child-1', share: 1 }],
  items: [],
  ...over,
});

function makeService(opts: { encryptionTier?: number; rows?: any[]; child?: any; rates?: Record<string, number> } = {}) {
  const prisma: any = {
    account: {
      findUnique: jest.fn().mockResolvedValue({ name: 'Home', encryptionTier: opts.encryptionTier ?? 0 }),
    },
    child: {
      findFirst: jest.fn().mockResolvedValue(opts.child === undefined ? childRow() : opts.child),
    },
    expense: {
      findMany: jest.fn().mockImplementation((args: any) =>
        // The receipt-image query selects `receiptImage`; the main query does not.
        Promise.resolve(args?.select?.receiptImage ? [] : (opts.rows ?? [])),
      ),
    },
    // Receipt sizes (octet_length) — no bytes are loaded by the planning query.
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const children = new ChildrenService(prisma, new ChildProductRulesService(prisma));
  const rates = { getRates: jest.fn().mockResolvedValue({ rates: opts.rates ?? { PLN: 1, EUR: 0.25 } }) };
  const service = new ChildStatementService(prisma, children, rates as any);
  return { service, prisma, rates };
}

const build = (service: ChildStatementService, over: Partial<{ from: string; to: string; child: string }> = {}) =>
  service.build('acc-1', over.child ?? 'child-1', over.from ?? '2026-01-01', over.to ?? '2026-12-31', 'PLN', 'pl');

describe('ChildStatementService.build', () => {
  it('tier-1 account → 403 ENCRYPTED_ACCOUNT', async () => {
    const { service } = makeService({ encryptionTier: 1 });
    const err = await build(service).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toEqual(expect.objectContaining({ code: 'ENCRYPTED_ACCOUNT' }));
  });

  it('tier-2 account → 403 ENCRYPTED_ACCOUNT too', async () => {
    const { service } = makeService({ encryptionTier: 2 });
    await expect(build(service)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('excludes split receivables and planned (query predicate and defensively in memory)', async () => {
    const { service, prisma } = makeService({
      rows: [
        expenseRow({ id: 'e1', amount: 100 }),
        expenseRow({ id: 'e2', amount: 50, isSplitReceivable: true }),
        expenseRow({ id: 'e3', amount: 70, isPlanned: true }),
      ],
    });
    const data = await build(service);

    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where).toEqual(
      expect.objectContaining({ accountId: 'acc-1', isSplitReceivable: false, isPlanned: false, isDeleted: false }),
    );
    expect(where).not.toHaveProperty('isDebt');
    expect(data.lines.map((l) => l.amount)).toEqual([100]);
    expect(data.total).toBe(100);
  });

  it('unknown-rate line listed, excluded from total, flagged', async () => {
    const { service } = makeService({
      rows: [
        expenseRow({ id: 'e1', amount: 100 }),
        expenseRow({ id: 'e2', amount: 20, currencyCode: 'EUR', date: d('2026-04-02') }),
        expenseRow({ id: 'e3', amount: 30, currencyCode: 'XYZ', date: d('2026-05-02') }),
      ],
    });
    const data = await build(service);

    expect(data.lines).toHaveLength(3);
    const unknown = data.lines.find((l) => l.currencyCode === 'XYZ');
    expect(unknown?.converted).toBeNull();
    expect(data.lines.find((l) => l.currencyCode === 'EUR')?.converted).toBe(80);
    expect(data.total).toBe(180);
    expect(data.fxApproximate).toBe(true);
    expect(data.byMonth.find((m) => m.month === '2026-05')).toBeUndefined();
  });

  it('archived child allowed', async () => {
    const { service } = makeService({
      child: childRow({ archivedAt: new Date('2026-06-01T00:00:00Z') }),
      rows: [expenseRow()],
    });
    const data = await build(service);
    expect(data.childName).toBe('Ala');
    expect(data.total).toBe(100);
  });

  it("another account's child → 404 (resolved within the account)", async () => {
    const { service, prisma } = makeService({ child: null });
    await expect(build(service, { child: 'child-of-someone-else' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.child.findFirst.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ accountId: 'acc-1', isDeleted: false }),
    );
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
  });

  it('from > to → 400; over 24 months → 400', async () => {
    const { service } = makeService();
    await expect(build(service, { from: '2026-05-01', to: '2026-04-01' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(build(service, { from: '2024-01-01', to: '2026-01-01' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(build(service, { from: '2026-02-30', to: '2026-03-01' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(build(service, { from: '2024-02-01', to: '2026-01-31' })).resolves.toBeDefined();
  });

  it('a whole-attributed expense with category splits lands in the split categories (the screen rule)', async () => {
    const { service } = makeService({
      rows: [
        expenseRow({
          amount: 100,
          categorySplits: [
            { categoryId: 'cat-food', amount: 60, category: { name: 'Food' } },
            { categoryId: 'cat-toys', amount: 40, category: { name: 'Toys' } },
          ],
          expenseChildren: [
            { childId: 'child-1', share: 0.5 },
            { childId: 'child-2', share: 0.5 },
          ],
        }),
      ],
    });
    const data = await build(service);
    expect(data.byCategory).toEqual([
      { categoryId: 'cat-food', name: 'Food', amount: 30 },
      { categoryId: 'cat-toys', name: 'Toys', amount: 20 },
    ]);
    expect(data.total).toBe(50);
    expect(data.lines.every((l) => l.kind === 'whole')).toBe(true);
  });

  it('line attribution: only this child’s lines, receipt discount folded, kind "line"', async () => {
    const { service } = makeService({
      rows: [
        expenseRow({
          amount: 90,
          discountAmount: 10,
          expenseChildren: [],
          items: [
            { totalPrice: 50, lineDiscount: 0, childId: 'child-1', categoryId: 'cat-toys', description: 'Lego', category: { name: 'Toys' } },
            { totalPrice: 50, lineDiscount: 0, childId: null, categoryId: null, description: 'Wine', category: null },
          ],
        }),
      ],
    });
    const data = await build(service);
    expect(data.lines).toHaveLength(1);
    expect(data.lines[0]).toEqual(
      expect.objectContaining({ kind: 'line', amount: 45, categoryName: 'Toys', description: 'Lego' }),
    );
    expect(data.total).toBe(45);
  });

  it('plans receipts by size only, for the expenses that count for this child', async () => {
    const { service, prisma } = makeService({
      rows: [
        expenseRow({ id: 'e1' }),
        expenseRow({ id: 'e2' }),
        expenseRow({ id: 'e3', expenseChildren: [{ childId: 'child-2', share: 1 }] }),
      ],
    });
    prisma.$queryRaw.mockResolvedValue([{ id: 'e1', size: 1000 }]);
    const data = await build(service);
    const sql = prisma.$queryRaw.mock.calls[0][0];
    expect(sql.values).toEqual(expect.arrayContaining(['acc-1', ['e1', 'e2']]));
    // The main query never selects the bytes.
    expect(prisma.expense.findMany.mock.calls.every((c: any[]) => !c[0]?.select?.receiptImage)).toBe(true);
    expect(data.receipts).toEqual([{ expenseId: 'e1', date: '2026-03-10', merchant: 'CCC' }]);
    expect(data.receiptsOmitted).toBe(0);
  });

  it('loads receipt bytes in batches, scoped to the account, without copying', async () => {
    const { service, prisma } = makeService();
    const bytes = Buffer.from([1, 2, 3]);
    prisma.expense.findMany.mockResolvedValue([{ id: 'e1', receiptImage: bytes }]);
    const map = await service.loadReceiptImages('acc-1', ['e1', 'e2']);
    expect(prisma.expense.findMany).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', id: { in: ['e1', 'e2'] } },
      select: { id: true, receiptImage: true },
    });
    expect(map.get('e1')).toBe(bytes);
    expect(map.has('e2')).toBe(false);
  });
});

describe('selectReceipts (appendix caps)', () => {
  const limits = { maxReceipts: 3, maxTotalBytes: 1000, maxImageBytes: 400 };
  const c = (id: string, size: number) => ({ id, size });

  it('keeps receipts in order while under every cap', () => {
    expect(selectReceipts([c('a', 100), c('b', 100)], limits)).toEqual({ ids: ['a', 'b'], omitted: 0 });
  });

  it('skips a single image over the per-image limit and counts it as omitted', () => {
    expect(selectReceipts([c('a', 100), c('big', 401), c('b', 100)], limits)).toEqual({ ids: ['a', 'b'], omitted: 1 });
  });

  it('stops at the receipt-count cap', () => {
    const r = selectReceipts([c('a', 1), c('b', 1), c('c', 1), c('d', 1), c('e', 1)], limits);
    expect(r).toEqual({ ids: ['a', 'b', 'c'], omitted: 2 });
  });

  it('stops at the total-bytes cap', () => {
    const r = selectReceipts([c('a', 400), c('b', 400), c('c', 400), c('d', 10)], limits);
    expect(r).toEqual({ ids: ['a', 'b', 'd'], omitted: 1 });
  });

  it('the default caps: 150 receipts, 40 MB in all, 3 MB each', () => {
    const many = Array.from({ length: 200 }, (_, i) => c(`r${i}`, 1000));
    expect(selectReceipts(many).ids).toHaveLength(150);
    expect(selectReceipts([c('x', 3 * 1024 * 1024 + 1)]).omitted).toBe(1);
    const fat = Array.from({ length: 20 }, (_, i) => c(`f${i}`, 3 * 1024 * 1024));
    expect(selectReceipts(fat).ids).toHaveLength(13); // 13 x 3 MB = 39 MB <= 40 MB
  });
});
