import { OAuthTokenCleanupCron } from './oauth-token-cleanup.cron';

function build(grantPages: { id: string }[][] = [[]], clientPages: { id: string }[][] = [[]]) {
  const findMany = jest
    .fn()
    .mockResolvedValueOnce([{ id: 't1' }, { id: 't2' }]) // expired
    .mockResolvedValueOnce([{ id: 't3' }]); // revoked grants
  const deleteMany = jest.fn(async ({ where }) => ({ count: where.id ? where.id.in.length : 0 }));
  const grantFind = jest.fn();
  for (const p of grantPages) grantFind.mockResolvedValueOnce(p);
  const updateMany = jest.fn(async ({ where }) => ({ count: where.id.in.length }));
  const clientFind = jest.fn();
  for (const p of clientPages) clientFind.mockResolvedValueOnce(p);
  clientFind.mockResolvedValue([]);
  const clientUpdate = jest.fn(async ({ where }) => ({ count: where.id.in.length }));
  const prisma: any = {
    oAuthToken: { findMany, deleteMany },
    oAuthGrant: { findMany: grantFind, updateMany },
    oAuthClient: { findMany: clientFind, updateMany: clientUpdate },
  };
  return { cron: new OAuthTokenCleanupCron(prisma), findMany, deleteMany, grantFind, updateMany, clientFind, clientUpdate };
}

const staleWhere = (w: any) => ({ source: w.source, deletedAt: w.deletedAt, grants: w.grants });

type G = { revokedAt: Date | null };
type C = { id: string; source: 'manual' | 'mcp_dcr'; createdAt: Date; deletedAt: Date | null; grants: G[] };

/** Evaluates the exact where the cron sends against in-memory clients (the subset of Prisma it uses). */
function matches(c: C, where: any): boolean {
  if (where.id?.in && !where.id.in.includes(c.id)) return false;
  if (where.source && c.source !== where.source) return false;
  if ('deletedAt' in where && c.deletedAt !== where.deletedAt) return false;
  if (where.createdAt?.lt && !(c.createdAt < where.createdAt.lt)) return false;
  const or = where.grants.none.OR as any[];
  const hit = (g: G) =>
    or.some((o) => (o.revokedAt === null ? g.revokedAt === null : g.revokedAt !== null && g.revokedAt >= o.revokedAt.gte));
  return !c.grants.some(hit);
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

  it('soft-deletes stale (>30 days) mcp_dcr clients with no active or recently revoked grant, in batches', async () => {
    const page1 = Array.from({ length: 500 }, (_, i) => ({ id: `c${i}` }));
    const { cron, clientFind, clientUpdate } = build([[]], [page1, [{ id: 'c500' }]]);
    const before = Date.now();
    await cron.handleCleanup();

    const where = clientFind.mock.calls[0][0].where;
    expect(where).toEqual({
      source: 'mcp_dcr',
      deletedAt: null,
      grants: { none: { OR: [{ revokedAt: null }, { revokedAt: { gte: expect.any(Date) } }] } },
      createdAt: { lt: expect.any(Date) },
    });
    const cutoff = where.createdAt.lt.getTime();
    // one cutoff for the client age and for the latest revocation
    expect(where.grants.none.OR[1].revokedAt.gte.getTime()).toBe(cutoff);
    expect(cutoff).toBeLessThanOrEqual(before - 30 * 86_400_000 + 1000);
    expect(cutoff).toBeGreaterThan(before - 30 * 86_400_000 - 5000);
    expect(clientFind.mock.calls[0][0]).toMatchObject({ select: { id: true }, orderBy: { id: 'asc' }, take: 500 });
    expect(clientUpdate).toHaveBeenCalledTimes(2);
    expect(clientUpdate.mock.calls[0][0]).toEqual({
      where: { id: { in: page1.map((c) => c.id) }, ...staleWhere(where) },
      data: { deletedAt: expect.any(Date) },
    });
    expect(clientUpdate.mock.calls[1][0].where.id).toEqual({ in: ['c500'] });
  });

  it('touches no client when none is stale', async () => {
    const { cron, clientUpdate } = build([[]], [[]]);
    await cron.handleCleanup();
    expect(clientUpdate).not.toHaveBeenCalled();
  });

  it('R8: which clients the query selects (evaluated against the where it sends)', async () => {
    const day = 86_400_000;
    const ago = (d: number) => new Date(Date.now() - d * day);
    const clients: C[] = [
      { id: 'never', source: 'mcp_dcr', createdAt: ago(40), deletedAt: null, grants: [] },
      { id: 'young-never', source: 'mcp_dcr', createdAt: ago(10), deletedAt: null, grants: [] },
      { id: 'all-revoked-long-ago', source: 'mcp_dcr', createdAt: ago(90), deletedAt: null, grants: [{ revokedAt: ago(60) }, { revokedAt: ago(31) }] },
      { id: 'revoked-recently', source: 'mcp_dcr', createdAt: ago(90), deletedAt: null, grants: [{ revokedAt: ago(60) }, { revokedAt: ago(5) }] },
      { id: 'active', source: 'mcp_dcr', createdAt: ago(90), deletedAt: null, grants: [{ revokedAt: ago(60) }, { revokedAt: null }] },
      { id: 'manual-all-revoked', source: 'manual', createdAt: ago(90), deletedAt: null, grants: [{ revokedAt: ago(60) }] },
      { id: 'manual-never', source: 'manual', createdAt: ago(90), deletedAt: null, grants: [] },
      { id: 'already-deleted', source: 'mcp_dcr', createdAt: ago(90), deletedAt: ago(1), grants: [] },
    ];
    const { cron, clientFind } = build([[]], [[]]);
    await cron.handleCleanup();
    const where = clientFind.mock.calls[0][0].where;
    expect(clients.filter((c) => matches(c, where)).map((c) => c.id)).toEqual(['never', 'all-revoked-long-ago']);
  });

  it('R8: the update repeats the grant conditions, so a grant created or revoked meanwhile keeps the client', async () => {
    const { cron, clientFind, clientUpdate } = build([[]], [[{ id: 'c1' }]]);
    await cron.handleCleanup();
    const where = clientFind.mock.calls[0][0].where;
    const upd = clientUpdate.mock.calls[0][0].where;
    expect(upd).toEqual({ id: { in: ['c1'] }, ...staleWhere(where) });
    const now = new Date();
    const c: C = { id: 'c1', source: 'mcp_dcr', createdAt: new Date(0), deletedAt: null, grants: [{ revokedAt: null }] };
    expect(matches(c, upd)).toBe(false);
    expect(matches({ ...c, grants: [{ revokedAt: now }] }, upd)).toBe(false);
    expect(matches({ ...c, grants: [] }, upd)).toBe(true);
  });
});
