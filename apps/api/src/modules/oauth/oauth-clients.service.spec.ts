import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OAuthClientsService } from './oauth-clients.service';
import { sha256Hex } from './oauth-crypto.util';

const dto = {
  name: 'App',
  homepageUrl: 'https://x.pl',
  redirectUris: ['https://x.pl/cb'],
};

function build() {
  const store: Record<string, any> = {};
  const prisma: any = {
    oAuthClient: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(
        async ({ data }) =>
          (store.c = {
            id: 'c1',
            status: 'active',
            isVerified: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            blockedReason: null,
            ...data,
          }),
      ),
      findFirst: jest.fn(async ({ where }) =>
        store.c && where.ownerUserId === store.c.ownerUserId && where.id === store.c.id ? store.c : null,
      ),
      update: jest.fn(async ({ data }) => (store.c = { ...store.c, ...data })),
      findMany: jest.fn(),
    },
    oAuthGrant: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    oAuthToken: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  };
  return { prisma, svc: new OAuthClientsService(prisma), store };
}

describe('OAuthClientsService', () => {
  it('rejects the 11th app', async () => {
    const { prisma, svc } = build();
    prisma.oAuthClient.count.mockResolvedValue(10);
    await expect(svc.create('u1', dto)).rejects.toThrow(new BadRequestException('app_limit_reached'));
  });

  it('public client gets no secret', async () => {
    const { svc, store } = build();
    const r: any = await svc.create('u1', { ...dto, isConfidential: false });
    expect(r.clientSecret).toBeUndefined();
    expect(store.c.secretHash).toBeNull();
    expect(svc.verifySecret(store.c, 'anything')).toBe(false);
  });

  it('confidential create returns a secret matching the stored hash and never the hash', async () => {
    const { svc, store } = build();
    const r: any = await svc.create('u1', dto);
    expect(r.clientSecret).toMatch(/^aba_cs_/);
    expect(sha256Hex(r.clientSecret)).toBe(store.c.secretHash);
    expect(r.app.secretHash).toBeUndefined();
    expect(svc.verifySecret(store.c, r.clientSecret)).toBe(true);
    expect(svc.verifySecret(store.c, 'wrong')).toBe(false);
  });

  it('R13: an update keeps a stored URI that predates the whitespace rule, and refuses one it adds', async () => {
    const { prisma, svc, store } = build();
    await svc.create('u1', dto);
    const legacy = 'https://x.pl/c b';
    store.c.redirectUris = ['https://x.pl/cb', legacy];
    // re-submitting the form unchanged, or adding a clean URI, is fine
    await expect(svc.update('u1', 'c1', { redirectUris: ['https://x.pl/cb', legacy] })).resolves.toBeDefined();
    await expect(svc.update('u1', 'c1', { redirectUris: [legacy, 'https://x.pl/new'] })).resolves.toBeDefined();
    expect(store.c.redirectUris).toEqual([legacy, 'https://x.pl/new']);
    // adding a URI with whitespace or a control character is a 400, and nothing is written
    prisma.oAuthClient.update.mockClear();
    for (const added of ['https://x.pl/d e', 'https://x.pl/cb']) {
      await expect(svc.update('u1', 'c1', { redirectUris: [legacy, added] })).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(prisma.oAuthClient.update).not.toHaveBeenCalled();
  });

  it('update on another users app is 404', async () => {
    const { svc } = build();
    await svc.create('u1', dto);
    await expect(svc.update('u2', 'c1', { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rotateSecret invalidates the old secret', async () => {
    const { svc, store } = build();
    const r: any = await svc.create('u1', dto);
    const rot = await svc.rotateSecret('u1', 'c1');
    expect(svc.verifySecret(store.c, r.clientSecret)).toBe(false);
    expect(svc.verifySecret(store.c, rot.clientSecret)).toBe(true);
  });

  it('remove soft-deletes, revokes grants and deletes tokens', async () => {
    const { prisma, svc } = build();
    await svc.create('u1', dto);
    await svc.remove('u1', 'c1');
    expect(prisma.oAuthToken.deleteMany).toHaveBeenCalledWith({ where: { grant: { clientId: 'c1' } } });
    expect(prisma.oAuthGrant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ revokedBy: 'client_deleted' }) }),
    );
    expect(prisma.oAuthClient.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deletedAt: expect.any(Date) } }),
    );
  });

  it('listForOwner never returns an mcp_dcr client', async () => {
    const { prisma, svc } = build();
    prisma.oAuthClient.findMany.mockResolvedValue([]);
    await svc.listForOwner('u1');
    const where = prisma.oAuthClient.findMany.mock.calls[0][0].where;
    expect(where.ownerUserId).toBe('u1');
    expect(where.deletedAt).toBeNull();
    expect(where.source).toBe('manual');
  });

  it('getOwned (update/rotate/remove) only ever resolves a manual client', async () => {
    const { prisma, svc } = build();
    await svc.create('u1', dto);
    await svc.update('u1', 'c1', { name: 'B' });
    expect(prisma.oAuthClient.findFirst.mock.calls[0][0].where).toEqual({
      id: 'c1',
      ownerUserId: 'u1',
      deletedAt: null,
      source: 'manual',
    });
  });

  it('listForOwner computes connectedUsers and lastUsedAt', async () => {
    const { prisma, svc } = build();
    const d1 = new Date('2026-01-01');
    const d2 = new Date('2026-02-01');
    prisma.oAuthClient.findMany.mockResolvedValue([
      { id: 'c1', secretHash: 'h', redirectUris: [], grants: [{ lastUsedAt: d1 }, { lastUsedAt: d2 }, { lastUsedAt: null }] },
    ]);
    const [a]: any = await svc.listForOwner('u1');
    expect(a.connectedUsers).toBe(3);
    expect(a.lastUsedAt).toBe(d2);
    expect(a.secretHash).toBeUndefined();
  });
});
