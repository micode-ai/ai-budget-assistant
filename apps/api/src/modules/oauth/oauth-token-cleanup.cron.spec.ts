import { OAuthTokenCleanupCron } from './oauth-token-cleanup.cron';

describe('OAuthTokenCleanupCron', () => {
  it('deletes only expired (>1 day) rows and rows of revoked grants, in batches', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ id: 't1' }, { id: 't2' }]) // expired
      .mockResolvedValueOnce([{ id: 't3' }]); // revoked grants
    const deleteMany = jest.fn(async ({ where }) => ({ count: where.id.in.length }));
    const cron = new OAuthTokenCleanupCron({ oAuthToken: { findMany, deleteMany } } as any);
    const before = Date.now();
    await cron.handleCleanup();

    const cutoff = findMany.mock.calls[0][0].where.expiresAt.lt.getTime();
    expect(cutoff).toBeLessThanOrEqual(before - 86_400_000 + 1000);
    expect(cutoff).toBeGreaterThan(before - 86_400_000 - 5000);
    expect(findMany.mock.calls[1][0].where).toEqual({ grant: { revokedAt: { not: null } } });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['t1', 't2'] } } });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['t3'] } } });
  });
});
