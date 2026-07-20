import { ExpenseCrossAccountService } from './expense-cross-account.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

// ---------------------------------------------------------------------------
// mergeExpenses (Tier 2 merge action)
// ---------------------------------------------------------------------------

function makeMergeService(overrides: {
  keepRow?: Record<string, any>;
  mergeRow?: Record<string, any>;
} = {}) {
  const keepRow = overrides.keepRow ?? {
    id: 'keep-1',
    accountId: 'acc-1',
    merchant: null,
    notes: null,
    categoryId: null,
    receiptImage: null,
    receiptMimeType: null,
    expenseTags: [],
    projectExpenses: [],
  };
  const mergeRow = overrides.mergeRow ?? {
    id: 'merge-1',
    accountId: 'acc-1',
    merchant: 'Żabka',
    notes: 'lunch',
    categoryId: 'cat-food',
    receiptImage: null,
    receiptMimeType: null,
    expenseTags: [{ tagId: 'tag-1' }],
    projectExpenses: [{ projectId: 'proj-1' }],
  };

  const expenseUpdateMock = jest.fn().mockResolvedValue({});
  const expenseTagUpsertMock = jest.fn().mockResolvedValue({});
  const projectExpenseUpsertMock = jest.fn().mockResolvedValue({});

  const tx: any = {
    expense: {
      findFirst: jest.fn()
        .mockResolvedValueOnce(keepRow)
        .mockResolvedValueOnce(mergeRow),
      update: expenseUpdateMock,
    },
    expenseTag: { upsert: expenseTagUpsertMock },
    projectExpense: { upsert: projectExpenseUpsertMock },
  };

  const prisma: any = {
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };

  const cacheService: any = {
    delByPrefix: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
  const anomalyService: any = { dismissForExpense: jest.fn().mockResolvedValue(undefined) };
  const service = new ExpenseCrossAccountService(prisma, anomalyService, cacheService);
  return { service, prisma, tx, anomalyService, expenseUpdateMock, expenseTagUpsertMock, projectExpenseUpsertMock };
}

describe('mergeExpenses (Tier 2)', () => {
  it('soft-deletes the secondary and bumps syncVersion, returns keptId/mergedId', async () => {
    const { service, anomalyService, expenseUpdateMock } = makeMergeService();
    const result = await service.mergeExpenses('acc-1', 'user-1', { keepId: 'keep-1', mergeId: 'merge-1' });
    expect(result).toEqual({ keptId: 'keep-1', mergedId: 'merge-1' });
    // merge-1 should be soft-deleted
    const deleteCall = expenseUpdateMock.mock.calls.find((c: any) => c[0].where.id === 'merge-1');
    expect(deleteCall[0].data.isDeleted).toBe(true);
    expect(deleteCall[0].data.syncVersion).toEqual({ increment: 1 });
    // keep-1 should have syncVersion bumped
    const keepCall = expenseUpdateMock.mock.calls.find((c: any) => c[0].where.id === 'keep-1');
    expect(keepCall[0].data.syncVersion).toEqual({ increment: 1 });
    // the soft-deleted (merged) row's stale anomaly alert must be dismissed
    expect(anomalyService.dismissForExpense).toHaveBeenCalledWith('acc-1', 'merge-1');
  });

  it('gap-fills merchant, notes, categoryId from the merged row into the survivor when survivor lacks them', async () => {
    const { service, expenseUpdateMock } = makeMergeService();
    await service.mergeExpenses('acc-1', 'user-1', { keepId: 'keep-1', mergeId: 'merge-1' });
    const keepCall = expenseUpdateMock.mock.calls.find((c: any) => c[0].where.id === 'keep-1');
    expect(keepCall[0].data.merchant).toBe('Żabka');
    expect(keepCall[0].data.notes).toBe('lunch');
    expect(keepCall[0].data.categoryId).toBe('cat-food');
  });

  it('does NOT overwrite survivor fields that already have values (gap-fill only)', async () => {
    const { service, expenseUpdateMock } = makeMergeService({
      keepRow: {
        id: 'keep-1', accountId: 'acc-1',
        merchant: 'Existing', notes: 'existing note', categoryId: 'cat-existing',
        receiptImage: null, receiptMimeType: null, expenseTags: [], projectExpenses: [],
      },
    });
    await service.mergeExpenses('acc-1', 'user-1', { keepId: 'keep-1', mergeId: 'merge-1' });
    const keepCall = expenseUpdateMock.mock.calls.find((c: any) => c[0].where.id === 'keep-1');
    // These fields were NOT in carriedFields because the survivor already had them.
    expect(keepCall[0].data.merchant).toBeUndefined();
    expect(keepCall[0].data.notes).toBeUndefined();
    expect(keepCall[0].data.categoryId).toBeUndefined();
  });

  it('unions tags from the merged row onto the survivor', async () => {
    const { service, expenseTagUpsertMock } = makeMergeService();
    await service.mergeExpenses('acc-1', 'user-1', { keepId: 'keep-1', mergeId: 'merge-1' });
    expect(expenseTagUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ create: { expenseId: 'keep-1', tagId: 'tag-1' } }),
    );
  });

  it('carries over project association from merged row to survivor', async () => {
    const { service, projectExpenseUpsertMock } = makeMergeService();
    await service.mergeExpenses('acc-1', 'user-1', { keepId: 'keep-1', mergeId: 'merge-1' });
    expect(projectExpenseUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ create: { projectId: 'proj-1', expenseId: 'keep-1' } }),
    );
  });

  it('resolves keepId and mergeId by clientId (the OR:[{id},{clientId}] pattern)', async () => {
    const { service, tx } = makeMergeService();
    await service.mergeExpenses('acc-1', 'user-1', { keepId: 'client-keep', mergeId: 'client-merge' });
    const [keepCall, mergeCall] = (tx.expense.findFirst as jest.Mock).mock.calls;
    expect(keepCall[0].where.OR).toEqual([{ id: 'client-keep' }, { clientId: 'client-keep' }]);
    expect(mergeCall[0].where.OR).toEqual([{ id: 'client-merge' }, { clientId: 'client-merge' }]);
  });

  it('throws BadRequestException when keepId === mergeId', async () => {
    const { service } = makeMergeService();
    await expect(service.mergeExpenses('acc-1', 'user-1', { keepId: 'same', mergeId: 'same' }))
      .rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when the keep expense is not found (cross-account safety)', async () => {
    const tx: any = {
      expense: {
        findFirst: jest.fn().mockResolvedValue(null), // nothing found
        update: jest.fn(),
      },
      expenseTag: { upsert: jest.fn() },
      projectExpense: { upsert: jest.fn() },
    };
    const prisma: any = { $transaction: jest.fn(async (cb: any) => cb(tx)) };
    const cacheService: any = { delByPrefix: jest.fn(), del: jest.fn() };
    const service = new ExpenseCrossAccountService(prisma, {} as any, cacheService);
    await expect(service.mergeExpenses('acc-1', 'user-1', { keepId: 'other-acc-expense', mergeId: 'merge-1' }))
      .rejects.toThrow(NotFoundException);
    // The update must never have been called — nothing should be mutated.
    expect(tx.expense.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// moveToAccount
// ---------------------------------------------------------------------------

// Move an expense to another account. The caller is already a non-viewer member of the
// SOURCE account (AccountContextGuard + ViewerBlockGuard); the service validates the
// TARGET membership/role, remaps the category by name, and drops account-scoped links.
describe('ExpenseCrossAccountService.moveToAccount', () => {
  function makeService(opts: {
    expense?: any;
    targetMember?: { role: string } | null;
    sourceCategoryName?: string | null;
    targetCategoryMatch?: { id: string } | null;
    clientIdClash?: { id: string } | null;
  }) {
    const tx = {
      expenseTag: { updateMany: jest.fn().mockResolvedValue({}) },
      projectExpense: { updateMany: jest.fn().mockResolvedValue({}) },
      expenseCategorySplit: { updateMany: jest.fn().mockResolvedValue({}) },
      tripExpenseShare: { deleteMany: jest.fn().mockResolvedValue({}) },
      expense: { update: jest.fn().mockResolvedValue({}) },
    };
    const expense =
      opts.expense === undefined
        ? { id: 'srv-1', clientId: 'cli-1', categoryId: 'cat-src', encryptedPayload: null }
        : opts.expense;
    const prisma: any = {
      expense: {
        findFirst: jest
          .fn()
          // first call resolves the source expense; second (clientId clash check) if any
          .mockResolvedValueOnce(expense)
          .mockResolvedValueOnce(opts.clientIdClash ?? null),
        update: jest.fn().mockResolvedValue({}),
      },
      accountMember: {
        findUnique: jest.fn().mockResolvedValue(
          opts.targetMember === undefined ? { role: 'editor' } : opts.targetMember,
        ),
      },
      category: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            opts.sourceCategoryName === undefined ? { name: 'Food' } : { name: opts.sourceCategoryName },
          ),
        findFirst: jest
          .fn()
          .mockResolvedValue(opts.targetCategoryMatch === undefined ? { id: 'cat-dst' } : opts.targetCategoryMatch),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const cacheService: any = {
      delByPrefix: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const anomalyService: any = { dismissForExpense: jest.fn().mockResolvedValue(undefined) };
    const service = new ExpenseCrossAccountService(prisma, anomalyService, cacheService);
    return { service, prisma, tx };
  }

  it('reassigns accountId, remaps category by name, and drops account-scoped links', async () => {
    const { service, tx } = makeService({});

    const res = await service.moveToAccount('acc-src', 'user-1', 'cli-1', {
      targetAccountId: 'acc-dst',
    });

    expect(res).toEqual({ id: 'srv-1', accountId: 'acc-dst', categoryId: 'cat-dst' });

    const upd = tx.expense.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'srv-1' });
    expect(upd.data.accountId).toBe('acc-dst');
    expect(upd.data.categoryId).toBe('cat-dst');
    expect(upd.data.syncVersion).toEqual({ increment: 1 });

    // Account-scoped associations are severed.
    expect(tx.expenseTag.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.projectExpense.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.expenseCategorySplit.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.tripExpenseShare.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('clears the category when the target account has no same-named category', async () => {
    const { service, tx } = makeService({ targetCategoryMatch: null });

    const res = await service.moveToAccount('acc-src', 'user-1', 'cli-1', {
      targetAccountId: 'acc-dst',
    });

    expect(res.categoryId).toBeNull();
    expect(tx.expense.update.mock.calls[0][0].data.categoryId).toBeNull();
  });

  it('assigns a fresh non-null clientId when the target account already holds that clientId', async () => {
    // clientId is a required (non-nullable) column, so it must NOT be set to null on a
    // collision — that throws PrismaClientValidationError. A fresh unique id avoids both
    // the @@unique([accountId, clientId]) collision and the schema violation.
    const { service, tx } = makeService({ clientIdClash: { id: 'other' } });

    await service.moveToAccount('acc-src', 'user-1', 'cli-1', { targetAccountId: 'acc-dst' });

    const newClientId = tx.expense.update.mock.calls[0][0].data.clientId;
    expect(newClientId).toEqual(expect.any(String));
    expect(newClientId).not.toBeNull();
    expect(newClientId).not.toBe('cli-1');
    // UUID v4 shape
    expect(newClientId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('rejects moving to the same account', async () => {
    const { service, tx } = makeService({});
    await expect(
      service.moveToAccount('acc-src', 'user-1', 'cli-1', { targetAccountId: 'acc-src' }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.expense.update).not.toHaveBeenCalled();
  });

  it('rejects an encrypted expense (payload cannot decrypt under the target key)', async () => {
    const { service, tx } = makeService({
      expense: { id: 'srv-1', clientId: 'cli-1', categoryId: null, encryptedPayload: 'enc' },
    });
    await expect(
      service.moveToAccount('acc-src', 'user-1', 'cli-1', { targetAccountId: 'acc-dst' }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.expense.update).not.toHaveBeenCalled();
  });

  it('rejects when the caller is not a member of the target account', async () => {
    const { service, tx } = makeService({ targetMember: null });
    await expect(
      service.moveToAccount('acc-src', 'user-1', 'cli-1', { targetAccountId: 'acc-dst' }),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.expense.update).not.toHaveBeenCalled();
  });

  it('rejects when the caller is only a viewer of the target account', async () => {
    const { service, tx } = makeService({ targetMember: { role: 'viewer' } });
    await expect(
      service.moveToAccount('acc-src', 'user-1', 'cli-1', { targetAccountId: 'acc-dst' }),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.expense.update).not.toHaveBeenCalled();
  });

  it('throws NotFound when the expense is missing from the source account', async () => {
    const { service, tx } = makeService({ expense: null });
    await expect(
      service.moveToAccount('acc-src', 'user-1', 'nope', { targetAccountId: 'acc-dst' }),
    ).rejects.toThrow(NotFoundException);
    expect(tx.expense.update).not.toHaveBeenCalled();
  });
});
