import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccountTransferService } from './account-transfer.service';

const EXISTING = {
  id: 't1',
  clientId: 'c1',
  userId: 'u1',
  fromAccountId: 'personal',
  fromCurrency: 'PLN',
  fromAmount: 2000,
  toAccountId: 'savings',
  toCurrency: 'PLN',
  toAmount: 2000,
  exchangeRate: 1,
  date: new Date('2026-05-01'),
  notes: undefined,
  countAsIncome: false,
  linkedIncomeId: null,
};

type Roles = Record<string, 'owner' | 'editor' | 'viewer' | undefined>;

function makeService(options: { roles?: Roles; transfer?: unknown | null } = {}) {
  const roles: Roles = options.roles ?? {
    personal: 'owner',
    savings: 'owner',
    vacation: 'owner',
  };

  const tx = {
    income: { create: jest.fn().mockResolvedValue({ id: 'inc1' }), update: jest.fn() },
    accountTransfer: { create: jest.fn(), update: jest.fn().mockResolvedValue({}) },
  };

  const prisma = {
    accountMember: {
      findUnique: jest.fn(({ where }: { where: { accountId_userId: { accountId: string } } }) => {
        const role = roles[where.accountId_userId.accountId];
        return Promise.resolve(role ? { role } : null);
      }),
    },
    accountTransfer: {
      findFirst: jest
        .fn()
        .mockResolvedValue(options.transfer === undefined ? EXISTING : options.transfer),
    },
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };

  return { service: new AccountTransferService(prisma as never), prisma, tx };
}

describe('AccountTransferService.update — changing accounts', () => {
  it('404s when the transfer is not visible to the requesting account', async () => {
    const { service } = makeService({ transfer: null });

    await expect(service.update('personal', 'u1', 't1', {})).rejects.toThrow(NotFoundException);
  });

  it('re-homes the source account and persists it', async () => {
    const { service, tx } = makeService();

    await service.update('personal', 'u1', 't1', {
      fromAccountId: 'vacation',
      fromCurrency: 'PLN',
      toAccountId: 'personal',
      toCurrency: 'PLN',
    });

    expect(tx.accountTransfer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fromAccountId: 'vacation', toAccountId: 'personal' }),
      }),
    );
  });

  it('rejects moving both sides away from the requesting account', async () => {
    // findAll filters on fromAccountId/toAccountId, so this would make the transfer
    // invisible to the very account that edited it.
    const { service } = makeService();

    await expect(
      service.update('personal', 'u1', 't1', {
        fromAccountId: 'savings',
        toAccountId: 'vacation',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects collapsing both sides onto the same account', async () => {
    const { service } = makeService();

    await expect(
      service.update('personal', 'u1', 't1', { toAccountId: 'personal' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a source account the user does not belong to', async () => {
    const { service } = makeService({ roles: { personal: 'owner', savings: 'owner' } });

    await expect(
      service.update('personal', 'u1', 't1', { fromAccountId: 'stranger', toAccountId: 'personal' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects paying from an account where the user is only a viewer', async () => {
    const { service } = makeService({
      roles: { personal: 'owner', savings: 'owner', vacation: 'viewer' },
    });

    await expect(
      service.update('personal', 'u1', 't1', { fromAccountId: 'vacation', toAccountId: 'personal' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('skips membership checks entirely when the accounts are unchanged', async () => {
    const { service, prisma } = makeService();

    await service.update('personal', 'u1', 't1', { fromAmount: 2500 });

    expect(prisma.accountMember.findUnique).not.toHaveBeenCalled();
  });

  it('moves the linked income to the new receiving account', async () => {
    const { service, tx } = makeService({
      transfer: { ...EXISTING, countAsIncome: true, linkedIncomeId: 'inc1' },
    });

    await service.update('personal', 'u1', 't1', {
      toAccountId: 'vacation',
      toCurrency: 'EUR',
      toAmount: 460,
    });

    expect(tx.income.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inc1' },
        data: expect.objectContaining({ accountId: 'vacation', currencyCode: 'EUR', amount: 460 }),
      }),
    );
  });

  it('creates a newly enabled linked income on the new receiving account', async () => {
    const { service, tx } = makeService();

    await service.update('personal', 'u1', 't1', {
      countAsIncome: true,
      toAccountId: 'vacation',
      toCurrency: 'EUR',
      toAmount: 460,
    });

    expect(tx.income.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accountId: 'vacation', currencyCode: 'EUR' }),
      }),
    );
  });
});

describe('AccountTransferService.create', () => {
  const dto = {
    localId: '11111111-1111-1111-1111-111111111111',
    fromAccountId: 'personal',
    fromCurrency: 'PLN',
    fromAmount: 100,
    toAccountId: 'savings',
    toCurrency: 'PLN',
    toAmount: 100,
    exchangeRate: 1,
    date: '2026-05-01',
  };

  it('rejects a transfer the requesting account is not party to', async () => {
    const { service } = makeService();

    await expect(service.create('vacation', 'u1', dto as never)).rejects.toThrow(ForbiddenException);
  });

  it('rejects a viewer on the paying side', async () => {
    const { service } = makeService({ roles: { personal: 'viewer', savings: 'owner' } });

    await expect(service.create('personal', 'u1', dto as never)).rejects.toThrow(ForbiddenException);
  });

  it('rejects when the user is not a member of the receiving account', async () => {
    const { service } = makeService({ roles: { personal: 'owner' } });

    await expect(service.create('personal', 'u1', dto as never)).rejects.toThrow(ForbiddenException);
  });
});
