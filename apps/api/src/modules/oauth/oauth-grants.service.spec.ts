import { Prisma } from '@prisma/client';
import { OAuthGrantsService } from './oauth-grants.service';

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' });

function build() {
  const prisma: any = {
    oAuthGrant: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }) => ({ id: 'g-new', ...data })),
      update: jest.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    oAuthToken: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  };
  return { prisma, svc: new OAuthGrantsService(prisma) };
}

describe('OAuthGrantsService.upsertActive', () => {
  it('creates a grant when none is active', async () => {
    const { prisma, svc } = build();
    const r = await svc.upsertActive('c1', 'u1', 'a1', ['expenses:read']);
    expect(r.isNew).toBe(true);
    expect(prisma.oAuthGrant.create).toHaveBeenCalledWith({
      data: { clientId: 'c1', userId: 'u1', accountId: 'a1', scopes: ['expenses:read'] },
    });
    expect(prisma.oAuthGrant.findFirst).toHaveBeenCalledWith({
      where: { clientId: 'c1', userId: 'u1', accountId: 'a1', revokedAt: null },
    });
  });

  it('reuses the active grant and REPLACES its scopes', async () => {
    const { prisma, svc } = build();
    prisma.oAuthGrant.findFirst.mockResolvedValue({ id: 'g1', scopes: ['expenses:read', 'receipts:read'] });
    const r = await svc.upsertActive('c1', 'u1', 'a1', ['expenses:write']);
    expect(r.isNew).toBe(false);
    expect(r.grant.id).toBe('g1');
    expect(prisma.oAuthGrant.create).not.toHaveBeenCalled();
    expect(prisma.oAuthGrant.update).toHaveBeenCalledWith({ where: { id: 'g1' }, data: { scopes: ['expenses:write'] } });
  });

  it('on a concurrent create (P2002) re-fetches and updates the winner', async () => {
    const { prisma, svc } = build();
    prisma.oAuthGrant.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'g-race', scopes: [] });
    prisma.oAuthGrant.create.mockRejectedValueOnce(p2002());
    const r = await svc.upsertActive('c1', 'u1', 'a1', ['categories:read']);
    expect(r.isNew).toBe(false);
    expect(r.grant.id).toBe('g-race');
    expect(prisma.oAuthGrant.update).toHaveBeenCalledWith({ where: { id: 'g-race' }, data: { scopes: ['categories:read'] } });
  });

  it('rethrows non-P2002 errors', async () => {
    const { prisma, svc } = build();
    prisma.oAuthGrant.create.mockRejectedValueOnce(new Error('db down'));
    await expect(svc.upsertActive('c1', 'u1', 'a1', ['expenses:read'])).rejects.toThrow('db down');
  });
});

describe('OAuthGrantsService.revoke', () => {
  it('stamps revokedAt/revokedBy on the active grant and deletes its tokens in one transaction', async () => {
    const { prisma, svc } = build();
    await svc.revoke('g1', 'user');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.oAuthToken.deleteMany).toHaveBeenCalledWith({ where: { grantId: 'g1' } });
    expect(prisma.oAuthGrant.updateMany).toHaveBeenCalledWith({
      where: { id: 'g1', revokedAt: null },
      data: { revokedAt: expect.any(Date), revokedBy: 'user' },
    });
  });
});
