import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BackupsService } from './backups.service';

// Critical backup paths:
//   1. Receipt images must be stripped from the export (they're binary blobs that
//      balloon JSON size ~4-6× and the restore never reads them back).
//   2. Restore must remap backup category IDs to the IDs that were created in the
//      target account — source IDs are global PKs and collide otherwise.
//   3. Any per-row restore failure must roll back the entire transaction.

function makeBackupData(overrides: Record<string, any> = {}) {
  return JSON.stringify({
    version: 1,
    data: {
      categories: [],
      tags: [],
      projects: [],
      budgets: [],
      walletBalances: [],
      expenses: [],
      incomes: [],
      currencyExchanges: [],
      ...overrides,
    },
  });
}

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    account: {
      findUnique: jest.fn().mockResolvedValue({
        encryptionEnabled: false,
        encryptionTier: null,
      }),
    },
    expense: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    income: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    budget: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    category: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    tag: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    project: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    walletBalance: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    currencyExchange: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    backupHistory: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(async (cb: any) => cb(makeTxClient())),
    ...overrides,
  };
}

function makeTxClient(overrides: Record<string, any> = {}) {
  return {
    category: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `new-${data.name}` })),
      update: jest.fn().mockResolvedValue({}),
    },
    tag: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `new-tag-${data.name}` })),
      update: jest.fn().mockResolvedValue({}),
    },
    project: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `new-proj-${data.clientId}` })),
      update: jest.fn().mockResolvedValue({}),
    },
    budget: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    walletBalance: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    expense: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `new-exp-${data.clientId}` })),
      update: jest.fn().mockResolvedValue({}),
    },
    income: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `new-inc-${data.clientId}` })),
      update: jest.fn().mockResolvedValue({}),
    },
    expenseItem: { createMany: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}) },
    expenseCategorySplit: { createMany: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}) },
    expenseTag: { upsert: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}) },
    projectExpense: { upsert: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}) },
    incomeTag: { upsert: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}) },
    projectIncome: { upsert: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}) },
    currencyExchange: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

describe('BackupsService — exportBackup', () => {
  it('throws NotFoundException when account does not exist', async () => {
    const prisma = makePrisma({
      account: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    const service = new BackupsService(prisma as any);

    await expect(service.exportBackup('no-acc', 'u1')).rejects.toThrow(NotFoundException);
  });

  it('never reads inbound e-receipt staging rows into a backup (ABA-644)', async () => {
    const prisma: any = makePrisma({
      inboundReceipt: { findMany: jest.fn() },
      inboundMailAddress: { findMany: jest.fn() },
    });
    const service = new BackupsService(prisma as any);

    const { jsonStr } = await service.exportBackup('acc-1', 'u1');

    expect(prisma.inboundReceipt.findMany).not.toHaveBeenCalled();
    expect(prisma.inboundMailAddress.findMany).not.toHaveBeenCalled();
    expect(Object.keys(JSON.parse(jsonStr).data)).not.toEqual(expect.arrayContaining(['inboundReceipts']));
  });

  it('strips receiptImage from every expense so it is absent from the JSON output', async () => {
    const receiptBuffer = Buffer.from([1, 2, 3]);
    const prisma = makePrisma({
      expense: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'exp-1',
            receiptImage: receiptBuffer,
            items: [],
            expenseTags: [],
            categorySplits: [],
            projectExpenses: [],
          },
        ]),
      },
    });
    const service = new BackupsService(prisma as any);

    const { jsonStr } = await service.exportBackup('acc-1', 'u1');
    const parsed = JSON.parse(jsonStr);

    // The receiptImage key must not appear (stripped to undefined → omitted by JSON.stringify)
    expect(parsed.data.expenses[0]).not.toHaveProperty('receiptImage');
  });

  it('throws BadRequestException when serialized JSON exceeds 50 MB', async () => {
    // Generate an expense whose description alone pushes the payload over the limit
    const bigStr = 'x'.repeat(52 * 1024 * 1024);
    const prisma = makePrisma({
      expense: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'exp-1', description: bigStr, receiptImage: null, items: [], expenseTags: [], categorySplits: [], projectExpenses: [] },
        ]),
      },
    });
    const service = new BackupsService(prisma as any);

    await expect(service.exportBackup('acc-1', 'u1')).rejects.toThrow(BadRequestException);
  });
});

describe('BackupsService — restoreBackup (validation)', () => {
  it('throws BadRequestException for non-JSON input', async () => {
    const service = new BackupsService(makePrisma() as any);
    await expect(service.restoreBackup('acc', 'u', { data: 'not json', overwrite: false })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException when backup version is unsupported', async () => {
    const service = new BackupsService(makePrisma() as any);
    await expect(
      service.restoreBackup('acc', 'u', {
        data: JSON.stringify({ version: 99, data: {} }),
        overwrite: false,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when data field is missing', async () => {
    const service = new BackupsService(makePrisma() as any);
    await expect(
      service.restoreBackup('acc', 'u', {
        data: JSON.stringify({ version: 1 }),
        overwrite: false,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('BackupsService — restoreBackup (category ID remapping)', () => {
  it('remaps expense.categoryId from the backup id to the freshly-created account id', async () => {
    const tx = makeTxClient({
      category: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: `account-cat-${data.name}` })),
        update: jest.fn().mockResolvedValue({}),
      },
    });
    const prisma = makePrisma({
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    });
    const service = new BackupsService(prisma as any);

    const backupData = makeBackupData({
      categories: [{ id: 'backup-cat-1', name: 'Food', type: 'expense', icon: null, color: null }],
      expenses: [
        {
          clientId: 'exp-c1',
          categoryId: 'backup-cat-1',
          amount: 100,
          currencyCode: 'USD',
          date: '2026-01-01',
        },
      ],
    });

    await service.restoreBackup('acc-1', 'u1', { data: backupData, overwrite: false });

    // The expense.create call must use the remapped category ID, not the backup ID
    const expenseCreateCall = tx.expense.create.mock.calls[0][0];
    expect(expenseCreateCall.data.categoryId).toBe('account-cat-Food');
    expect(expenseCreateCall.data.categoryId).not.toBe('backup-cat-1');
  });

  it('sets categoryId to null when the category was not present in the backup', async () => {
    const tx = makeTxClient();
    const prisma = makePrisma({
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    });
    const service = new BackupsService(prisma as any);

    const backupData = makeBackupData({
      expenses: [
        {
          clientId: 'exp-c2',
          categoryId: 'missing-cat-id',
          amount: 50,
          currencyCode: 'EUR',
          date: '2026-01-01',
        },
      ],
    });

    await service.restoreBackup('acc-1', 'u1', { data: backupData, overwrite: false });

    const expenseCreateCall = tx.expense.create.mock.calls[0][0];
    expect(expenseCreateCall.data.categoryId).toBeNull();
  });
});

describe('BackupsService — restoreBackup (atomic rollback)', () => {
  it('returns empty counts and the error list when a row fails, without throwing', async () => {
    const tx = makeTxClient({
      category: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(new Error('DB constraint')),
        update: jest.fn().mockResolvedValue({}),
      },
    });

    // The mock must propagate whatever the callback throws so the service's
    // outer try/catch can inspect it and handle RestoreAbort correctly.
    const prisma = makePrisma({
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    });

    const service = new BackupsService(prisma as any);
    const backupData = makeBackupData({
      categories: [{ id: 'c1', name: 'Fail', type: 'expense', icon: null, color: null }],
    });

    const result = await service.restoreBackup('acc-1', 'u1', { data: backupData, overwrite: false });

    // A failure → whole restore rolled back → empty counts, non-empty errors
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.restoredCounts).toEqual({});
  });
});

describe('BackupsService — restoreBackup (children and fields)', () => {
  function restoreWith(tx: any, data: Record<string, any>, overwrite = false) {
    const prisma = makePrisma({ $transaction: jest.fn(async (cb: any) => cb(tx)) });
    return new BackupsService(prisma as any).restoreBackup('acc-1', 'u1', { data: makeBackupData(data), overwrite });
  }

  const backup = {
    categories: [{ id: 'b-cat', name: 'Food', type: 'expense' }],
    tags: [{ id: 'b-tag', name: 'weekly' }],
    projects: [{ id: 'b-proj', clientId: 'proj-c', name: 'Trip' }],
    expenses: [{
      clientId: 'exp-c', categoryId: 'b-cat', amount: 30, currencyCode: 'PLN', date: '2026-01-01',
      merchant: 'Shop', depositAmount: 1.5, isDebt: true, debtContactName: 'Ann', recurringId: 'r-1', recurringPeriod: 'monthly',
      items: [{ description: 'Milk', categoryId: 'b-cat', totalPrice: 5, quantity: 1, unitPrice: 5 }],
      categorySplits: [
        { categoryId: 'b-cat', amount: 20, percentage: 66.67 },
        { categoryId: 'gone-cat', amount: 10, percentage: 33.33 },
      ],
      expenseTags: [{ tagId: 'b-tag' }, { tagId: 'unknown-tag' }],
      projectExpenses: [{ projectId: 'b-proj' }],
    }],
    incomes: [{
      clientId: 'inc-c', amount: 100, currencyCode: 'PLN', date: '2026-01-02', source: 'import',
      incomeTags: [{ tagId: 'b-tag' }], projectIncomes: [{ projectId: 'b-proj' }],
    }],
  };

  it('restores the expense fields that used to be dropped', async () => {
    const tx = makeTxClient();
    await restoreWith(tx, backup);
    expect(tx.expense.create.mock.calls[0][0].data).toMatchObject({
      merchant: 'Shop', depositAmount: 1.5, isDebt: true, debtContactName: 'Ann', recurringId: 'r-1', recurringPeriod: 'monthly',
    });
  });

  it('restores line items, splits, tags and project links against the new ids', async () => {
    const tx = makeTxClient();
    const res = await restoreWith(tx, backup);
    expect(res.errors).toEqual([]);

    const items = tx.expenseItem.createMany.mock.calls[0][0].data;
    expect(items).toEqual([expect.objectContaining({ expenseId: 'new-exp-exp-c', description: 'Milk', categoryId: 'new-Food' })]);

    // The split whose category was not in the backup is dropped, not left dangling.
    const splits = tx.expenseCategorySplit.createMany.mock.calls[0][0].data;
    expect(splits).toEqual([expect.objectContaining({ expenseId: 'new-exp-exp-c', categoryId: 'new-Food', amount: 20 })]);

    expect(tx.expenseTag.upsert).toHaveBeenCalledTimes(1);
    expect(tx.expenseTag.upsert.mock.calls[0][0].create).toEqual({ expenseId: 'new-exp-exp-c', tagId: 'new-tag-weekly' });
    expect(tx.projectExpense.upsert.mock.calls[0][0].create).toEqual({ projectId: 'new-proj-proj-c', expenseId: 'new-exp-exp-c' });

    expect(tx.income.create.mock.calls[0][0].data.source).toBe('import');
    expect(tx.incomeTag.upsert.mock.calls[0][0].create).toEqual({ incomeId: 'new-inc-inc-c', tagId: 'new-tag-weekly' });
    expect(tx.projectIncome.upsert.mock.calls[0][0].create).toEqual({ projectId: 'new-proj-proj-c', incomeId: 'new-inc-inc-c' });
  });

  it("never restores source 'group' or an isSplitReceivable flag (ABA-660 review M2)", async () => {
    const tx = makeTxClient();
    await restoreWith(tx, {
      expenses: [{ clientId: 'e-g', amount: 5, currencyCode: 'PLN', date: '2026-01-01', source: 'group', isSplitReceivable: true }],
      incomes: [{ clientId: 'i-g', amount: 5, currencyCode: 'PLN', date: '2026-01-01', source: 'group', isSplitReceivable: true }],
    });
    expect(tx.expense.create.mock.calls[0][0].data).toMatchObject({ source: 'manual', isSplitReceivable: false });
    expect(tx.income.create.mock.calls[0][0].data).toMatchObject({ source: 'manual', isSplitReceivable: false });
  });

  it('retires the existing children before re-creating them on overwrite', async () => {
    const tx = makeTxClient();
    tx.expense.findFirst = jest.fn().mockImplementation(({ where }) =>
      Promise.resolve(where.clientId === 'exp-c' && !where.externalRef ? { id: 'existing-exp' } : null));
    await restoreWith(tx, backup, true);

    expect(tx.expense.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'existing-exp' } }));
    expect(tx.expenseItem.updateMany).toHaveBeenCalledWith({ where: { expenseId: 'existing-exp', isDeleted: false }, data: { isDeleted: true } });
    expect(tx.expenseItem.createMany.mock.calls[0][0].data[0].expenseId).toBe('existing-exp');
  });

  it('keeps externalRef unless another row in the account already holds it', async () => {
    const tx = makeTxClient();
    tx.expense.findFirst = jest.fn().mockImplementation(({ where }) =>
      Promise.resolve(where.externalRef === 'taken' ? { id: 'other' } : null));
    await restoreWith(tx, {
      expenses: [
        { clientId: 'a', amount: 1, date: '2026-01-01', externalRef: 'taken' },
        { clientId: 'b', amount: 1, date: '2026-01-01', externalRef: 'free' },
      ],
    });
    expect(tx.expense.create.mock.calls[0][0].data.externalRef).toBeNull();
    expect(tx.expense.create.mock.calls[1][0].data.externalRef).toBe('free');
  });
});

describe('BackupsController — restore guard', () => {
  it('blocks viewers from restoring into an account', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BackupsController } = require('./backups.controller');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ViewerBlockGuard } = require('../accounts/guards/account-role.guard');
    const guards = Reflect.getMetadata('__guards__', BackupsController.prototype.restoreBackup) ?? [];
    expect(guards.some((g: unknown) => g instanceof ViewerBlockGuard)).toBe(true);
  });
});
