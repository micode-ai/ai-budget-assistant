import { OAuthTokenCleanupCron } from './oauth-token-cleanup.cron';

function build(grantPages: { id: string }[][] = [[]]) {
  const findMany = jest
    .fn()
    .mockResolvedValueOnce([{ id: 't1' }, { id: 't2' }]) // expired
    .mockResolvedValueOnce([{ id: 't3' }]); // revoked grants
  const deleteMany = jest.fn(async ({ where }) => ({ count: where.id ? where.id.in.length : 0 }));
  const grantFind = jest.fn();
  for (const p of grantPages) grantFind.mockResolvedValueOnce(p);
  const updateMany = jest.fn(async ({ where }) => ({ count: where.id.in.length }));
  const prisma: any = {
    oAuthToken: { findMany, deleteMany },
    oAuthGrant: { findMany: grantFind, updateMany },
  };
  return { cron: new OAuthTokenCleanupCron(prisma), findMany, deleteMany, grantFind, updateMany };
}

describe('OAuthTokenCleanupCron', () => {
  it('deletes only expired (>1 day) rows and rows of revoked grants, in batches', async () => {
    const { cron, findMany, deleteMany } = build();
    const before = Date.now();
    await cron.handleCleanup();

    const cutoff = findMany.mock.calls[0][0].where.expiresAt.lt.getTime();
    expect(cutoff).toBeLessThanOrEqual(before - 86_400_000 + 1000);
    expect(cutoff).toBeGreaterThan(before - 86_400_000 - 5000);
    expect(findMany.mock.calls[1][0].where).toEqual({ grant: { revokedAt: { not: null } } });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['t1', 't2'] } } });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['t3'] } } });
  });

  it('revokes active grants with no join row pointing at an ACTIVE account (a soft-deleted-only grant included; one with an active account is not matched), and deletes their tokens', async () => {
    const { cron, grantFind, updateMany, deleteMany } = build([[{ id: 'g-orphan' }]]);
    await cron.handleCleanup();
    expect(grantFind.mock.calls[0][0].where).toEqual({ revokedAt: null, accounts: { none: { account: { isActive: true } } } });
    expect(deleteMany).toHaveBeenCalledWith({ where: { grantId: { in: ['g-orphan'] } } });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['g-orphan'] }, revokedAt: null },
      data: { revokedAt: expect.any(Date), revokedBy: 'user' },
    });
  });

  it('touches no grant when none is account-less (the query itself excludes grants with a join row)', async () => {
    const { cron, updateMany } = build([[]]);
    await cron.handleCleanup();
    expect(updateMany).not.toHaveBeenCalled();
  });
});
