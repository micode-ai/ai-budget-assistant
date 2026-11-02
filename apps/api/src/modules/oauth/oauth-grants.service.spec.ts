import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OAuthGrantsService } from './oauth-grants.service';

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' });

/** In-memory join table so the set arithmetic is exercised, not just the call shapes. */
function build(initialJoin: string[] = []) {
  let join = [...initialJoin];
  const tx: any = {
    oAuthGrantAccount: {
      findMany: jest.fn(async () => join.map((accountId) => ({ accountId }))),
      deleteMany: jest.fn(async ({ where }) => {
        join = join.filter((a) => (where.accountId.notIn ? where.accountId.notIn.includes(a) : !where.accountId.in.includes(a)));
        return { count: 0 };
      }),
      createMany: jest.fn(async ({ data }) => {
        for (const d of data) if (!join.includes(d.accountId)) join.push(d.accountId);
        return { count: data.length };
      }),
      count: jest.fn(async () => join.length),
    },
    oAuthGrant: {
      update: jest.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
  };
  const prisma: any = {
    oAuthGrant: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }) => ({ id: 'g-new', clientId: data.clientId, userId: data.userId, scopes: data.scopes })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    oAuthToken: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    $transaction: jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(tx) : Promise.all(arg))),
  };
  return { prisma, tx, joined: () => [...join].sort(), svc: new OAuthGrantsService(prisma) };
}

describe('OAuthGrantsService.replaceActive', () => {
  it('creates a grant with nested accounts when none is active', async () => {
    const { prisma, svc } = build();
    const r = await svc.replaceActive('c1', 'u1', ['A', 'B'], ['expenses:read']);
    expect(r.isNew).toBe(true);
    expect(r.addedAccountIds).toEqual(['A', 'B']);
    expect(prisma.oAuthGrant.create).toHaveBeenCalledWith({
      data: {
        clientId: 'c1',
        userId: 'u1',
        scopes: ['expenses:read'],
        accounts: { create: [{ accountId: 'A' }, { accountId: 'B' }] },
      },
    });
    expect(prisma.oAuthGrant.findFirst).toHaveBeenCalledWith({
      where: { clientId: 'c1', userId: 'u1', revokedAt: null },
      select: { id: true },
    });
  });

  it('replaces the account set and the scopes of the active grant', async () => {
    const { prisma, svc, joined } = build(['A', 'B']);
    prisma.oAuthGrant.findFirst.mockResolvedValue({ id: 'g1' });
    const r = await svc.replaceActive('c1', 'u1', ['B', 'C'], ['expenses:write']);
    expect(r.isNew).toBe(false);
    expect(r.grant.id).toBe('g1');
    expect(r.addedAccountIds).toEqual(['C']);
    expect(joined()).toEqual(['B', 'C']);
    expect(prisma.oAuthGrant.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('writes the new scopes inside the same transaction', async () => {
    const { prisma, tx, svc } = build(['A']);
    prisma.oAuthGrant.findFirst.mockResolvedValue({ id: 'g1' });
    await svc.replaceActive('c1', 'u1', ['A'], ['expenses:write']);
    expect(tx.oAuthGrant.update).toHaveBeenCalledWith({ where: { id: 'g1' }, data: { scopes: ['expenses:write'] } });
    expect(tx.oAuthGrantAccount.createMany).toHaveBeenCalledWith({
      data: [{ grantId: 'g1', accountId: 'A' }],
      skipDuplicates: true,
    });
  });

  it('on a concurrent create (P2002) re-fetches and replaces the winner', async () => {
    const { prisma, svc, joined } = build(['A']);
    prisma.oAuthGrant.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'g-race' });
    prisma.oAuthGrant.create.mockRejectedValueOnce(p2002());
    const r = await svc.replaceActive('c1', 'u1', ['A', 'B'], ['categories:read']);
    expect(r.isNew).toBe(false);
    expect(r.grant.id).toBe('g-race');
    expect(r.addedAccountIds).toEqual(['B']);
    expect(joined()).toEqual(['A', 'B']);
  });

  it('refuses an empty account list so a grant is never left active with no account', async () => {
    const { prisma, svc } = build();
    await expect(svc.replaceActive('c1', 'u1', [], ['expenses:read'])).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.oAuthGrant.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rethrows non-P2002 errors', async () => {
    const { prisma, svc } = build();
    prisma.oAuthGrant.create.mockRejectedValueOnce(new Error('db down'));
    await expect(svc.replaceActive('c1', 'u1', ['A'], ['expenses:read'])).rejects.toThrow('db down');
  });
});

describe('OAuthGrantsService.removeAccounts', () => {
  it('keeps the grant and its tokens while accounts remain', async () => {
    const { prisma, svc, joined } = build(['A', 'B']);
    expect(await svc.removeAccounts('g1', ['A'])).toEqual({ revoked: false });
    expect(joined()).toEqual(['B']);
    expect(prisma.oAuthToken.deleteMany).not.toHaveBeenCalled();
    expect(prisma.oAuthGrant.updateMany).not.toHaveBeenCalled();
  });

  it('revokes the grant when the last account goes', async () => {
    const { prisma, svc } = build(['A']);
    expect(await svc.removeAccounts('g1', ['A'])).toEqual({ revoked: true });
    expect(prisma.oAuthToken.deleteMany).toHaveBeenCalledWith({ where: { grantId: 'g1' } });
    expect(prisma.oAuthGrant.updateMany).toHaveBeenCalledWith({
      where: { id: 'g1', revokedAt: null },
      data: { revokedAt: expect.any(Date), revokedBy: 'user' },
    });
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
