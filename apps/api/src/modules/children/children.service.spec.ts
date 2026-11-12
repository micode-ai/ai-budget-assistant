import { NotFoundException } from '@nestjs/common';
import { ChildrenService } from './children.service';
import { ChildProductRulesService } from './child-product-rules.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

function makeService() {
  const prisma: any = {
    child: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    expense: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    expenseItem: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    expenseChild: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ ...create })),
    },
    productChildRule: {
      upsert: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
  const rules = new ChildProductRulesService(prisma);
  const service = new ChildrenService(prisma, rules);
  return { service, prisma, rules };
}

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

describe('ChildrenService.create', () => {
  it('create is idempotent on name and adopts clientId once', async () => {
    const { service, prisma } = makeService();

    // First call: the row is created with the device's clientId.
    prisma.child.upsert.mockResolvedValueOnce(childRow({ clientId: 'local-a' }));
    const first = await service.create('acc-1', 'user-1', { name: 'Ala', clientId: 'local-a' });
    expect(first.id).toBe('child-1');
    const args = prisma.child.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ accountId_name: { accountId: 'acc-1', name: 'Ala' } });
    expect(args.create).toMatchObject({ accountId: 'acc-1', name: 'Ala', clientId: 'local-a' });
    // The update branch never overwrites a clientId.
    expect(args.update).not.toHaveProperty('clientId');
    expect(prisma.child.update).not.toHaveBeenCalled();

    // A second device creates the same name: the existing row comes back and its
    // clientId is NOT replaced by the second device's id.
    prisma.child.upsert.mockResolvedValueOnce(childRow({ clientId: 'local-a' }));
    const second = await service.create('acc-1', 'user-1', { name: 'Ala', clientId: 'local-b' });
    expect(second.id).toBe('child-1');
    expect(second.clientId).toBe('local-a');
    expect(prisma.child.update).not.toHaveBeenCalled();

    // A row created without a clientId (e.g. from the web) adopts the first one sent.
    prisma.child.upsert.mockResolvedValueOnce(childRow({ id: 'child-2', name: 'Olek', clientId: null }));
    prisma.child.update.mockResolvedValueOnce(childRow({ id: 'child-2', name: 'Olek', clientId: 'local-c' }));
    const third = await service.create('acc-1', 'user-1', { name: 'Olek', clientId: 'local-c' });
    expect(prisma.child.update).toHaveBeenCalledWith({ where: { id: 'child-2' }, data: { clientId: 'local-c' } });
    expect(third.clientId).toBe('local-c');
  });

  it('a retried create never returns a soft-deleted child by clientId', async () => {
    const { service, prisma } = makeService();
    prisma.child.upsert.mockResolvedValueOnce(childRow({ clientId: 'local-a' }));
    await service.create('acc-1', 'user-1', { name: 'Ala', clientId: 'local-a' });
    expect(prisma.child.findFirst.mock.calls[0][0].where).toEqual({ accountId: 'acc-1', clientId: 'local-a', isDeleted: false });
  });

  it('a retried create with a known clientId returns that child even after a rename', async () => {
    const { service, prisma } = makeService();
    prisma.child.findFirst.mockResolvedValueOnce(childRow({ name: 'Alicja', clientId: 'local-a' }));
    const res = await service.create('acc-1', 'user-1', { name: 'Ala', clientId: 'local-a' });
    expect(res.id).toBe('child-1');
    expect(prisma.child.upsert).not.toHaveBeenCalled();
  });
});

describe('ChildrenService.findAll', () => {
  it('GET excludes archived unless includeArchived', async () => {
    const { service, prisma } = makeService();
    prisma.child.findMany.mockResolvedValue([childRow()]);

    await service.findAll('acc-1', false);
    expect(prisma.child.findMany.mock.calls[0][0].where).toEqual({ accountId: 'acc-1', isDeleted: false, archivedAt: null });

    await service.findAll('acc-1', true);
    expect(prisma.child.findMany.mock.calls[1][0].where).toEqual({ accountId: 'acc-1', isDeleted: false });
  });

  it('returns archivedAt as an ISO string', async () => {
    const { service, prisma } = makeService();
    prisma.child.findMany.mockResolvedValue([childRow({ archivedAt: new Date('2026-05-01T00:00:00.000Z') })]);
    const [c] = await service.findAll('acc-1', true);
    expect(c.archivedAt).toBe('2026-05-01T00:00:00.000Z');
  });
});

describe('ChildrenService.update', () => {
  it('resolves :id by id OR clientId and writes the resolved PK; archived toggles archivedAt', async () => {
    const { service, prisma } = makeService();
    prisma.child.findFirst.mockResolvedValue(childRow({ clientId: 'local-a' }));
    prisma.child.update.mockResolvedValue(childRow({ archivedAt: new Date() }));

    await service.update('acc-1', 'user-1', 'local-a', { archived: true });
    expect(prisma.child.findFirst.mock.calls[0][0].where).toEqual({
      accountId: 'acc-1', isDeleted: false, OR: [{ id: 'local-a' }, { clientId: 'local-a' }],
    });
    const upd = prisma.child.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'child-1' });
    expect(upd.data.archivedAt).toBeInstanceOf(Date);

    await service.update('acc-1', 'user-1', 'child-1', { archived: false });
    expect(prisma.child.update.mock.calls[1][0].data.archivedAt).toBeNull();

    await service.update('acc-1', 'user-1', 'child-1', { color: '#112233' });
    expect(prisma.child.update.mock.calls[2][0].data).not.toHaveProperty('archivedAt');
  });

  it('404s for a child of another account', async () => {
    const { service } = makeService();
    await expect(service.update('acc-1', 'user-1', 'x', { name: 'B' })).rejects.toThrow(NotFoundException);
  });
});

describe('ChildrenService.setExpenseChildren', () => {
  it('PUT expense children replaces links, default equal shares, and clears item childIds', async () => {
    const { service, prisma } = makeService();
    prisma.expense.findFirst.mockResolvedValue({ id: 'exp-pk' });
    prisma.child.findFirst.mockImplementation(({ where }: any) => {
      const key = where.OR[0].id;
      const map: Record<string, string> = { 'local-a': 'child-a', 'child-b': 'child-b', 'local-c': 'child-c' };
      return Promise.resolve(map[key] ? childRow({ id: map[key] }) : null);
    });

    const links = await service.setExpenseChildren('acc-1', 'user-1', 'exp-client', {
      childIds: ['local-a', 'child-b', 'local-c'],
    });

    // Expense resolved by id OR clientId, scoped to the account.
    expect(prisma.expense.findFirst.mock.calls[0][0].where).toEqual({
      accountId: 'acc-1', isDeleted: false, OR: [{ id: 'exp-client' }, { clientId: 'exp-client' }],
    });

    // Links not in the new set are soft-deleted (resolved PKs, resolved expense PK).
    expect(prisma.expenseChild.updateMany).toHaveBeenCalledWith({
      where: { expenseId: 'exp-pk', isDeleted: false, childId: { notIn: ['child-a', 'child-b', 'child-c'] } },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });

    // Present ones are upserted on the resolved pair with equal shares summing to 1.
    const upserts = prisma.expenseChild.upsert.mock.calls.map((c: any) => c[0]);
    expect(upserts.map((u: any) => u.where)).toEqual([
      { expenseId_childId: { expenseId: 'exp-pk', childId: 'child-a' } },
      { expenseId_childId: { expenseId: 'exp-pk', childId: 'child-b' } },
      { expenseId_childId: { expenseId: 'exp-pk', childId: 'child-c' } },
    ]);
    const shares = upserts.map((u: any) => u.create.share);
    expect(shares.reduce((s: number, x: number) => s + x, 0)).toBeCloseTo(1, 10);
    shares.forEach((s: number) => expect(s).toBeCloseTo(1 / 3, 3));

    // Whole wins: every line's childId on that expense is cleared.
    expect(prisma.expenseItem.updateMany).toHaveBeenCalledWith({
      where: { expenseId: 'exp-pk', childId: { not: null } },
      data: { childId: null, syncVersion: { increment: 1 } },
    });

    expect(links).toEqual([
      { expenseId: 'exp-pk', childId: 'child-a', share: shares[0] },
      { expenseId: 'exp-pk', childId: 'child-b', share: shares[1] },
      { expenseId: 'exp-pk', childId: 'child-c', share: shares[2] },
    ]);
    // The parent expense is touched so change feeds re-deliver it.
    expect(prisma.expense.updateMany).toHaveBeenCalledWith({
      where: { id: 'exp-pk', accountId: 'acc-1' }, data: { updatedAt: expect.any(Date) },
    });
  });

  it('uses explicit shares when given and rejects ones that do not sum to 1', async () => {
    const { service, prisma } = makeService();
    prisma.expense.findFirst.mockResolvedValue({ id: 'exp-pk' });
    prisma.child.findFirst.mockImplementation(({ where }: any) => Promise.resolve(childRow({ id: where.OR[0].id })));

    await service.setExpenseChildren('acc-1', 'user-1', 'exp-pk', { childIds: ['a', 'b'], shares: [0.7, 0.3] });
    expect(prisma.expenseChild.upsert.mock.calls.map((c: any) => c[0].create.share)).toEqual([0.7, 0.3]);

    await expect(
      service.setExpenseChildren('acc-1', 'user-1', 'exp-pk', { childIds: ['a', 'b'], shares: [0.7, 0.7] }),
    ).rejects.toThrow('shares');
  });

  it("404s for another account's expense or an unknown child", async () => {
    const { service, prisma } = makeService();
    await expect(service.setExpenseChildren('acc-1', 'user-1', 'exp-x', { childIds: ['a'] })).rejects.toThrow(NotFoundException);
    prisma.expense.findFirst.mockResolvedValue({ id: 'exp-pk' });
    await expect(service.setExpenseChildren('acc-1', 'user-1', 'exp-pk', { childIds: ['ghost'] })).rejects.toThrow(NotFoundException);
    expect(prisma.expenseChild.upsert).not.toHaveBeenCalled();
  });
});

describe('ChildrenService.setItemChild', () => {
  it("PATCH item child soft-deletes the expense's links and learns a product rule", async () => {
    const { service, prisma } = makeService();
    prisma.expense.findFirst.mockResolvedValue({ id: 'exp-pk' });
    prisma.expenseItem.findFirst.mockResolvedValue({
      id: 'item-1', expenseId: 'exp-pk', description: 'PIELUCHY PAMPERS 4', canonicalName: 'Pieluchy Pampers 4', encryptedPayload: null,
    });
    prisma.child.findFirst.mockResolvedValue(childRow({ id: 'child-a', clientId: 'local-a' }));

    await service.setItemChild('acc-1', 'user-1', 'exp-client', 'item-1', 'local-a');
    await new Promise((r) => setImmediate(r));

    expect(prisma.expenseItem.findFirst.mock.calls[0][0].where).toEqual({ id: 'item-1', expenseId: 'exp-pk', isDeleted: false });
    // The resolved child PK is written, never the raw param.
    expect(prisma.expenseItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { childId: 'child-a', syncVersion: { increment: 1 } },
    });
    // Lines win: every whole-expense link is soft-deleted.
    expect(prisma.expenseChild.updateMany).toHaveBeenCalledWith({
      where: { expenseId: 'exp-pk', isDeleted: false },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });
    // Rule keyed by normalizeProductName(canonicalName ?? description).
    expect(prisma.productChildRule.upsert).toHaveBeenCalledWith({
      where: { accountId_productKey: { accountId: 'acc-1', productKey: 'pieluchypampers4' } },
      create: { accountId: 'acc-1', productKey: 'pieluchypampers4', childId: 'child-a' },
      update: { childId: 'child-a' },
    });
  });

  it('clearing a line child leaves links alone and learns nothing', async () => {
    const { service, prisma } = makeService();
    prisma.expense.findFirst.mockResolvedValue({ id: 'exp-pk' });
    prisma.expenseItem.findFirst.mockResolvedValue({ id: 'item-1', expenseId: 'exp-pk', description: 'X', canonicalName: null });
    await service.setItemChild('acc-1', 'user-1', 'exp-pk', 'item-1', null);
    expect(prisma.expenseItem.update).toHaveBeenCalledWith({ where: { id: 'item-1' }, data: { childId: null, syncVersion: { increment: 1 } } });
    expect(prisma.expenseChild.updateMany).not.toHaveBeenCalled();
    expect(prisma.productChildRule.upsert).not.toHaveBeenCalled();
  });

  it('a failing rule write never fails the attribution (fire-and-forget)', async () => {
    const { service, prisma } = makeService();
    prisma.expense.findFirst.mockResolvedValue({ id: 'exp-pk' });
    prisma.expenseItem.findFirst.mockResolvedValue({ id: 'item-1', expenseId: 'exp-pk', description: 'Mleko', canonicalName: null });
    prisma.child.findFirst.mockResolvedValue(childRow());
    prisma.productChildRule.upsert.mockRejectedValue(new Error('db down'));
    await expect(service.setItemChild('acc-1', 'user-1', 'exp-pk', 'item-1', 'child-1')).resolves.toBeUndefined();
    await new Promise((r) => setImmediate(r));
  });

  it("PATCH item child with another account's expense → 404", async () => {
    const { service, prisma } = makeService();
    prisma.expense.findFirst.mockResolvedValue(null);
    await expect(service.setItemChild('acc-1', 'user-1', 'other-exp', 'item-1', 'child-1')).rejects.toThrow(NotFoundException);
    expect(prisma.expenseItem.update).not.toHaveBeenCalled();
    expect(prisma.expenseChild.updateMany).not.toHaveBeenCalled();
  });
});

describe('ChildrenService.suggestions', () => {
  it('suggestions return only non-archived children, keyed by normalized name', async () => {
    const { service, prisma } = makeService();
    prisma.productChildRule.findMany.mockResolvedValue([{ productKey: 'pieluchypampers4', childId: 'child-a' }]);

    const res = await service.suggestions('acc-1', ['Pieluchy  Pampers 4', 'Mleko 2%', '']);

    const args = prisma.productChildRule.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      accountId: 'acc-1',
      productKey: { in: ['pieluchypampers4', 'mleko2'] },
      child: { isDeleted: false, archivedAt: null },
    });
    expect(res).toEqual({ pieluchypampers4: 'child-a' });
  });
});
