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

function makeService(
  options: { roles?: Roles; transfer?: unknown | null; existing?: typeof EXISTING } = {},
) {
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
      // Evaluates the lookup against EXISTING instead of blindly resolving it, so
      // "found by clientId" and "not a party to this account" are tested as
      // behaviour rather than as a query shape. An explicit `options.transfer`
      // (including null) short-circuits it.
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        if (options.transfer !== undefined) return Promise.resolve(options.transfer);
        const row = options.existing ?? EXISTING;
        const matches = (cond: Record<string, unknown>) =>
          Object.entries(cond).every(([k, v]) => (row as Record<string, unknown>)[k] === v);
        const and = (where.AND ?? []) as { OR: Record<string, unknown>[] }[];
        const ok =
          where.userId === row.userId &&
          !where.isDeleted &&
          and.every((clause) => clause.OR.some(matches));
        return Promise.resolve(ok ? row : null);
      }),
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

  it('re-homes the receiving side even when that drops the requesting account', async () => {
    // The reported bug: a MiCode -> Family transfer, corrected FROM the Family
    // account to say the money actually went to House. Family stops being a party,
    // which is the whole point of the correction — the row belongs to MiCode/House
    // now. Rejecting this made the fix impossible from the screen the user was on,
    // and the client swallowed the rejection, so the edit silently reverted.
    const { service, tx } = makeService({
      transfer: { ...EXISTING, countAsIncome: true, linkedIncomeId: 'inc1' },
    });

    await service.update('savings', 'u1', 't1', {
      toAccountId: 'vacation',
      toCurrency: 'PLN',
    });

    expect(tx.accountTransfer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ toAccountId: 'vacation' }),
      }),
    );
    // The money has to follow the transfer, or it stays on an account the
    // transfer no longer touches.
    expect(tx.income.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inc1' },
        data: expect.objectContaining({ accountId: 'vacation' }),
      }),
    );
  });

  it('still requires membership of both accounts after dropping the requesting one', async () => {
    // Removing the party rail must not weaken the real rule: assertCanTransferBetween.
    const { service } = makeService({ roles: { personal: 'owner', savings: 'owner' } });

    await expect(
      service.update('savings', 'u1', 't1', { toAccountId: 'stranger' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('resolves the transfer by clientId when the client never learned the server id', async () => {
    // The mobile client addresses a row by its local id until a wallet pull
    // backfills serverId; looking up by `id` alone 404s that edit away.
    const { service, tx } = makeService();

    await service.update('personal', 'u1', 'c1', { fromAmount: 2500 });

    expect(tx.accountTransfer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't1' },
        data: expect.objectContaining({ fromAmount: 2500 }),
      }),
    );
  });

  it('404s when the requesting account is party to neither side', async () => {
    // Read scoping is the security boundary and must stay: you can only edit a
    // transfer that the account you are acting as actually touches.
    const { service } = makeService();

    await expect(service.update('vacation', 'u1', 't1', {})).rejects.toThrow(NotFoundException);
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
