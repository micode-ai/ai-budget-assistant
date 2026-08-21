import { WalletCurrencyService } from './wallet-currency.service';

function makeService(
  existing: { currencyCode: string }[] = [],
  members: { userId: string; role: string }[] = [{ userId: 'owner-1', role: 'owner' }],
) {
  const createMany = jest.fn().mockResolvedValue({ count: 0 });
  const prisma = {
    walletBalance: {
      findMany: jest.fn().mockResolvedValue(existing),
      createMany,
    },
    accountMember: { findFirst: jest.fn().mockResolvedValue(members[0] ?? null) },
  };
  return { service: new WalletCurrencyService(prisma as never), prisma, createMany };
}

describe('WalletCurrencyService.ensureCurrencies', () => {
  it('creates a zero-initial-amount row for a currency the account has no row for', async () => {
    const { service, createMany } = makeService();

    await service.ensureCurrencies('acc-1', 'user-1', ['USD']);

    expect(createMany).toHaveBeenCalledTimes(1);
    const { data, skipDuplicates } = createMany.mock.calls[0][0];
    expect(skipDuplicates).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      accountId: 'acc-1',
      userId: 'user-1',
      currencyCode: 'USD',
      initialAmount: 0,
    });
    expect(typeof data[0].clientId).toBe('string');
    expect(data[0].clientId.length).toBeGreaterThan(0);
  });

  it('writes nothing when every requested currency already has a row', async () => {
    const { service, createMany } = makeService([{ currencyCode: 'PLN' }]);

    await service.ensureCurrencies('acc-1', 'user-1', ['PLN']);

    expect(createMany).not.toHaveBeenCalled();
  });

  it('leaves a currency the user hid alone instead of reviving its row', async () => {
    // The lookup deliberately does not filter on isDeleted, so a hidden row
    // comes back as "already known" and is neither recreated nor un-deleted.
    const { service, prisma, createMany } = makeService([{ currencyCode: 'BYN' }]);

    await service.ensureCurrencies('acc-1', 'user-1', ['BYN']);

    expect(prisma.walletBalance.findMany.mock.calls[0][0].where).not.toHaveProperty('isDeleted');
    expect(createMany).not.toHaveBeenCalled();
  });

  it('collapses a repeated currency into a single row', async () => {
    const { service, createMany } = makeService();

    await service.ensureCurrencies('acc-1', 'user-1', ['USD', 'USD', 'EUR', 'USD']);

    const { data } = createMany.mock.calls[0][0];
    expect(data.map((d: { currencyCode: string }) => d.currencyCode).sort()).toEqual(['EUR', 'USD']);
  });

  it('ignores blank currency codes and does not touch the database for them', async () => {
    const { service, createMany } = makeService();

    await service.ensureCurrencies('acc-1', 'user-1', ['', '  ']);

    expect(createMany).not.toHaveBeenCalled();
  });

  it('swallows a database failure so a fire-and-forget caller never sees it', async () => {
    const { service, prisma } = makeService();
    prisma.walletBalance.createMany = jest.fn().mockRejectedValue(new Error('db down'));

    await expect(service.ensureCurrencies('acc-1', 'user-1', ['USD'])).resolves.toBeUndefined();
  });
});

describe('WalletCurrencyService.ensureCurrencies without a known user', () => {
  it('attributes the row to the account owner when the caller has no user id to give', async () => {
    // The wallet read path heals missing rows but does not always know who is
    // asking, and wallet_balances.user_id is NOT NULL — so the owner stands in.
    const { service, createMany } = makeService();

    await service.ensureCurrencies('acc-1', undefined, ['USD']);

    expect(createMany.mock.calls[0][0].data[0].userId).toBe('owner-1');
  });

  it('writes nothing when there is no user to attribute the row to', async () => {
    const { service, prisma, createMany } = makeService();
    prisma.accountMember.findFirst = jest.fn().mockResolvedValue(null);

    await service.ensureCurrencies('acc-1', undefined, ['USD']);

    expect(createMany).not.toHaveBeenCalled();
  });

  it('does not look up a member when the caller already supplied a user id', async () => {
    const { service, prisma } = makeService();

    await service.ensureCurrencies('acc-1', 'user-1', ['USD']);

    expect(prisma.accountMember.findFirst).not.toHaveBeenCalled();
  });

  it('asks for the account owner specifically, not merely the first member it finds', async () => {
    // An `orderBy: { role: 'asc' }` here sorts 'editor' ahead of 'owner', which
    // would attribute the row to whichever member sorts first. Filter, do not sort.
    const { service, prisma } = makeService();

    await service.ensureCurrencies('acc-1', undefined, ['USD']);

    expect(prisma.accountMember.findFirst.mock.calls[0][0].where).toMatchObject({
      accountId: 'acc-1',
      role: 'owner',
    });
  });
});
