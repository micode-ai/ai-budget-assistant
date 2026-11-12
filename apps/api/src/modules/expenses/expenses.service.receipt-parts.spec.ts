import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { RECEIPT_PART_MAX_BASE64_CHARS } from './receipt-parts.util';

// Long receipt (several photos): part 1 lives on `Expense.receiptImage`, parts
// 2..N in `expense_receipt_parts`. These pin the storage contract.

const b64 = (s: string) => Buffer.from(s).toString('base64');

function makeService(opts: { existing?: boolean; found?: any } = {}) {
  const parts = {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const tx: any = {
    expense: {
      findUnique: jest
        .fn()
        .mockImplementationOnce(async () => (opts.existing ? { id: 'e-1' } : null))
        .mockImplementation(async () => ({
          id: 'e-1', accountId: 'a1', amount: 8, currencyCode: 'PLN', category: null, merchant: null,
          source: 'ocr', items: [], expenseTags: [], categorySplits: [], projectExpenses: [], user: { name: 'A' },
        })),
      upsert: jest.fn().mockResolvedValue({ id: 'e-1' }),
      update: jest.fn().mockResolvedValue({ id: 'e-1' }),
      findFirst: jest.fn().mockResolvedValue(opts.found === undefined ? { id: 'e-1' } : opts.found),
    },
    expenseReceiptPart: parts,
    expenseItem: { createMany: jest.fn() },
    tag: { findMany: jest.fn().mockResolvedValue([]) },
    expenseTag: { createMany: jest.fn() },
    project: { findFirst: jest.fn().mockResolvedValue(null) },
    projectExpense: { upsert: jest.fn() },
    expenseCategorySplit: { createMany: jest.fn() },
  };
  const prisma: any = {
    ...tx,
    category: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  const service = new ExpensesService(
    prisma,
    { checkAchievements: jest.fn().mockResolvedValue(undefined) } as any,
    { delByPrefix: jest.fn().mockResolvedValue(undefined), del: jest.fn().mockResolvedValue(undefined) } as any,
    { checkExpense: jest.fn().mockResolvedValue(undefined) } as any,
    { upsertRule: jest.fn().mockResolvedValue(undefined) } as any,
    { expireForExpense: jest.fn().mockResolvedValue(undefined) } as any,
    { onExpenseCreated: jest.fn().mockResolvedValue(undefined) } as any,
  );
  return { service, prisma, tx, parts };
}

const baseDto = {
  localId: '11111111-1111-4111-8111-111111111111',
  amount: 8,
  currencyCode: 'PLN',
  date: '2026-11-01',
  source: 'ocr',
};

describe('ExpensesService — receipt parts', () => {
  it('create with parts stores part 1 on the expense and 2..N in the table', async () => {
    const { service, tx, parts } = makeService();
    await service.create('a1', 'u1', {
      ...baseDto,
      receiptImageBase64: b64('part-1'),
      receiptMimeType: 'image/jpeg',
      receiptImageParts: [
        { imageBase64: b64('part-2'), mimeType: 'image/jpg' },
        { imageBase64: b64('part-3'), mimeType: 'image/png' },
      ],
    } as any);
    const args = tx.expense.upsert.mock.calls[0][0];
    expect(Buffer.from(args.create.receiptImage).toString()).toBe('part-1');
    expect(Buffer.from(args.update.receiptImage).toString()).toBe('part-1');
    expect(parts.deleteMany).toHaveBeenCalledWith({ where: { expenseId: 'e-1' } });
    const rows = parts.createMany.mock.calls[0][0].data;
    expect(rows.map((r: any) => [r.expenseId, r.index, Buffer.from(r.image).toString(), r.mimeType])).toEqual([
      ['e-1', 2, 'part-2', 'image/jpeg'],
      ['e-1', 3, 'part-3', 'image/png'],
    ]);
  });

  it('create with parts but no receipt image → 400, nothing written', async () => {
    const { service, tx } = makeService();
    await expect(
      service.create('a1', 'u1', { ...baseDto, receiptImageParts: [{ imageBase64: b64('x'), mimeType: 'image/jpeg' }] } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.expense.upsert).not.toHaveBeenCalled();
  });

  it('create refuses more than 3 extra parts, a PDF part, an oversized part', async () => {
    const p = { imageBase64: b64('x'), mimeType: 'image/jpeg' };
    for (const receiptImageParts of [
      [p, p, p, p],
      [{ ...p, mimeType: 'application/pdf' }],
      [{ ...p, imageBase64: 'A'.repeat(RECEIPT_PART_MAX_BASE64_CHARS + 4) }],
    ]) {
      const { service } = makeService();
      await expect(
        service.create('a1', 'u1', { ...baseDto, receiptImageBase64: b64('1'), receiptImageParts } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('a single-image create of a NEW expense touches no parts (today\'s path)', async () => {
    const { service, parts } = makeService();
    await service.create('a1', 'u1', { ...baseDto, receiptImageBase64: b64('only') } as any);
    expect(parts.deleteMany).not.toHaveBeenCalled();
    expect(parts.createMany).not.toHaveBeenCalled();
  });

  it('a single-image re-push of an EXISTING expense replaces part 1, so its old parts go', async () => {
    const { service, parts } = makeService({ existing: true });
    await service.create('a1', 'u1', { ...baseDto, receiptImageBase64: b64('only') } as any);
    expect(parts.deleteMany).toHaveBeenCalledWith({ where: { expenseId: 'e-1' } });
    expect(parts.createMany).not.toHaveBeenCalled();
  });

  it('a create without any receipt image leaves existing parts alone', async () => {
    const { service, parts } = makeService({ existing: true });
    await service.create('a1', 'u1', { ...baseDto } as any);
    expect(parts.deleteMany).not.toHaveBeenCalled();
  });

  it('GET receipt-parts returns all in order, part 1 first; resolves by id or clientId within the account', async () => {
    const { service, prisma } = makeService({
      found: {
        id: 'e-1',
        receiptImage: Buffer.from('p1'),
        receiptMimeType: null,
        receiptParts: [
          { index: 2, image: Buffer.from('p2'), mimeType: 'image/jpeg' },
          { index: 3, image: Buffer.from('p3'), mimeType: 'image/png' },
        ],
      },
    });
    const out = await service.getReceiptParts('a1', 'local-1');
    expect(out).toEqual([
      { index: 1, imageBase64: b64('p1'), mimeType: 'image/jpeg' },
      { index: 2, imageBase64: b64('p2'), mimeType: 'image/jpeg' },
      { index: 3, imageBase64: b64('p3'), mimeType: 'image/png' },
    ]);
    const args = prisma.expense.findFirst.mock.calls[0][0];
    expect(args.where).toEqual({ accountId: 'a1', isDeleted: false, OR: [{ id: 'local-1' }, { clientId: 'local-1' }] });
    expect(args.select.receiptParts.orderBy).toEqual({ index: 'asc' });
  });

  it('GET receipt-parts: no receipt → []; foreign account → 404', async () => {
    const empty = makeService({ found: { id: 'e-1', receiptImage: null, receiptMimeType: null, receiptParts: [] } });
    await expect(empty.service.getReceiptParts('a1', 'e-1')).resolves.toEqual([]);
    const foreign = makeService({ found: null });
    await expect(foreign.service.getReceiptParts('other-account', 'e-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('GET receipt-parts from=2: parts only, never selects receiptImage, scoped to the account; [] for a single photo', async () => {
    const { service, prisma } = makeService({
      found: { id: 'e-1', receiptParts: [{ index: 2, image: Buffer.from('p2'), mimeType: 'image/png' }] },
    });
    await expect(service.getReceiptParts('a1', 'local-1', 2)).resolves.toEqual([
      { index: 2, imageBase64: b64('p2'), mimeType: 'image/png' },
    ]);
    const args = prisma.expense.findFirst.mock.calls[0][0];
    expect(args.select.receiptImage).toBeUndefined();
    expect(args.select.receiptParts.where).toEqual({ index: { gte: 2 } });
    expect(args.where).toEqual({ accountId: 'a1', isDeleted: false, OR: [{ id: 'local-1' }, { clientId: 'local-1' }] });
    const single = makeService({ found: { id: 'e-1', receiptParts: [] } });
    await expect(single.service.getReceiptParts('a1', 'e-1', 2)).resolves.toEqual([]);
    const foreign = makeService({ found: null });
    await expect(foreign.service.getReceiptParts('x', 'e-1', 2)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('PUT replaces parts atomically: part 1 on the row, the rest re-created, all in one $transaction', async () => {
    const { service, prisma, tx, parts } = makeService({ found: { id: 'server-pk' } });
    await service.saveReceiptParts('a1', 'local-1', [
      { imageBase64: b64('n1'), mimeType: 'image/jpeg' },
      { imageBase64: b64('n2'), mimeType: 'image/webp' },
    ]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const upd = tx.expense.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'server-pk' });
    expect(Buffer.from(upd.data.receiptImage).toString()).toBe('n1');
    expect(upd.data.receiptMimeType).toBe('image/jpeg');
    expect(parts.deleteMany).toHaveBeenCalledWith({ where: { expenseId: 'server-pk' } });
    expect(parts.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ expenseId: 'server-pk', index: 2, mimeType: 'image/webp' }),
    ]);
  });

  it('PUT with a single part clears parts 2..N; zero or five parts → 400; foreign → 404', async () => {
    const one = makeService({ found: { id: 'e-1' } });
    await one.service.saveReceiptParts('a1', 'e-1', [{ imageBase64: b64('n1'), mimeType: 'image/jpeg' }]);
    expect(one.parts.deleteMany).toHaveBeenCalled();
    expect(one.parts.createMany).not.toHaveBeenCalled();

    const p = { imageBase64: b64('x'), mimeType: 'image/jpeg' };
    await expect(makeService().service.saveReceiptParts('a1', 'e-1', [])).rejects.toBeInstanceOf(BadRequestException);
    await expect(makeService().service.saveReceiptParts('a1', 'e-1', [p, p, p, p, p])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(makeService({ found: null }).service.saveReceiptParts('a1', 'e-1', [p])).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('delete receipt image removes parts, in the same transaction', async () => {
    const { service, prisma, tx, parts } = makeService({ found: { id: 'server-pk' } });
    await service.deleteReceiptImage('a1', 'local-1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.expense.update.mock.calls[0][0].data).toEqual(expect.objectContaining({ receiptImage: null }));
    expect(parts.deleteMany).toHaveBeenCalledWith({ where: { expenseId: 'server-pk' } });
  });

  it('replacing the receipt image (PUT receipt-image) removes parts too', async () => {
    const { service, tx, parts } = makeService({ found: { id: 'server-pk' } });
    await service.saveReceiptImage('a1', 'local-1', b64('new'), 'image/png');
    expect(tx.expense.update.mock.calls[0][0].where).toEqual({ id: 'server-pk' });
    expect(parts.deleteMany).toHaveBeenCalledWith({ where: { expenseId: 'server-pk' } });
  });
});
