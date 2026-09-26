import { createHash } from 'crypto';
import { ReceiptDuplicateService, pickLikelyDuplicate, receiptFingerprint } from './receipt-duplicate.service';

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'srv-1',
  clientId: 'cli-1',
  merchant: 'Biedronka',
  description: 'Groceries',
  amount: '40.85',
  currencyCode: 'PLN',
  date: new Date('2026-09-25T12:00:00.000Z'),
  ...over,
});

describe('receiptFingerprint', () => {
  it('hashes the base64 TEXT with whitespace removed — the device computes the same', () => {
    const expected = createHash('sha256').update('QUJDRA==').digest('hex');
    expect(receiptFingerprint('QUJD\nRA==')).toBe(expected);
    expect(receiptFingerprint('QUJDRA==')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('pickLikelyDuplicate', () => {
  it('matches on the payee label, case- and space-insensitively', () => {
    const m = pickLikelyDuplicate({ merchant: '  biedronka ' }, [row() as any]);
    expect(m).toMatchObject({ kind: 'likely', expenseId: 'srv-1', amount: 40.85 });
  });

  it('does not match an unidentifiable receipt against an unidentifiable row', () => {
    expect(pickLikelyDuplicate({ merchant: '', description: '' }, [row({ merchant: null, description: null }) as any])).toBeNull();
  });

  it('does not match a different payee', () => {
    expect(pickLikelyDuplicate({ merchant: 'Lidl' }, [row() as any])).toBeNull();
  });
});

describe('ReceiptDuplicateService', () => {
  const makePrisma = () => ({
    expense: { findFirst: jest.fn(), findMany: jest.fn() },
  });

  it('finds an exact re-upload by fingerprint, scoped to the account and live rows', async () => {
    const prisma = makePrisma();
    prisma.expense.findFirst.mockResolvedValue(row());
    const service = new ReceiptDuplicateService(prisma as any);
    const fp = 'a'.repeat(64);

    const m = await service.findByFingerprint('acc-1', fp);

    expect(m).toMatchObject({ kind: 'exact', expenseId: 'srv-1', clientId: 'cli-1', date: '2026-09-25T12:00:00.000Z' });
    expect(prisma.expense.findFirst.mock.calls[0][0].where).toEqual({
      accountId: 'acc-1',
      isDeleted: false,
      receiptFingerprint: fp,
    });
  });

  it('never queries with a malformed fingerprint', async () => {
    const prisma = makePrisma();
    const service = new ReceiptDuplicateService(prisma as any);
    expect(await service.findByFingerprint('acc-1', 'not-a-hash')).toBeNull();
    expect(await service.findByFingerprint('acc-1', '')).toBeNull();
    expect(prisma.expense.findFirst).not.toHaveBeenCalled();
  });

  it('degrades to "no duplicate" when the lookup fails', async () => {
    const prisma = makePrisma();
    prisma.expense.findFirst.mockRejectedValue(new Error('db down'));
    prisma.expense.findMany.mockRejectedValue(new Error('db down'));
    const service = new ReceiptDuplicateService(prisma as any);
    expect(await service.findByFingerprint('acc-1', 'b'.repeat(64))).toBeNull();
    expect(
      await service.findLikely('acc-1', { merchant: 'X', amount: 1, currencyCode: 'PLN', date: '2026-09-25' }),
    ).toBeNull();
  });

  it('looks for a likely duplicate by amount, currency and ±1 day', async () => {
    const prisma = makePrisma();
    prisma.expense.findMany.mockResolvedValue([row()]);
    const service = new ReceiptDuplicateService(prisma as any);

    const m = await service.findLikely('acc-1', {
      merchant: 'Biedronka',
      amount: 40.85,
      currencyCode: 'PLN',
      date: '2026-09-25',
    });

    expect(m).toMatchObject({ kind: 'likely', expenseId: 'srv-1' });
    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ accountId: 'acc-1', isDeleted: false, amount: 40.85, currencyCode: 'PLN' });
    expect(where.date.lte.getTime() - where.date.gte.getTime()).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it('skips the likely check without a date or a positive amount', async () => {
    const prisma = makePrisma();
    const service = new ReceiptDuplicateService(prisma as any);
    expect(await service.findLikely('acc-1', { merchant: 'X', amount: 10, currencyCode: 'PLN', date: null })).toBeNull();
    expect(await service.findLikely('acc-1', { merchant: 'X', amount: 0, currencyCode: 'PLN', date: '2026-09-25' })).toBeNull();
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
  });
});
