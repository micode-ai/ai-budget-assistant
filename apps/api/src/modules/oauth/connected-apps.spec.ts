import { NotFoundException } from '@nestjs/common';
import { OAuthGrantsService } from './oauth-grants.service';
import { ConnectedAppsController } from './connected-apps.controller';

type Grant = { id: string; accountId: string; revokedAt: Date | null };

/** Minimal in-memory prisma honouring the membership predicate the service builds. */
function build(members: { accountId: string; userId: string; role: string }[], grants: Grant[]) {
  const matches = (g: Grant, where: any) => {
    if (where.id && where.id !== g.id) return false;
    if (where.revokedAt === null && g.revokedAt) return false;
    const some = where.account.members.some;
    return members.some(
      (m) => m.accountId === g.accountId && m.userId === some.userId && some.role.in.includes(m.role),
    );
  };
  const prisma: any = {
    oAuthGrant: {
      findMany: jest.fn(async ({ where }) =>
        grants
          .filter((g) => matches(g, where))
          .map((g) => ({
            id: g.id,
            scopes: ['expenses:read'],
            createdAt: new Date('2026-01-01'),
            lastUsedAt: null,
            client: { name: 'App', logoUrl: null, homepageUrl: 'https://x.io', isVerified: false, status: 'blocked' },
            account: { id: g.accountId, name: 'Shared' },
            user: { id: 'uA', name: 'A' },
          })),
      ),
      findFirst: jest.fn(async ({ where }) => grants.find((g) => matches(g, where)) ?? null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    oAuthToken: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  };
  const svc = new OAuthGrantsService(prisma);
  return { prisma, ctrl: new ConnectedAppsController(svc) };
}

const req = (id: string): any => ({ user: { id } });
const members = [
  { accountId: 'a1', userId: 'uA', role: 'editor' },
  { accountId: 'a1', userId: 'uB', role: 'editor' },
  { accountId: 'a1', userId: 'uV', role: 'viewer' },
  { accountId: 'a2', userId: 'uO', role: 'owner' },
];
const grants: Grant[] = [{ id: 'g1', accountId: 'a1', revokedAt: null }];

describe('connected apps', () => {
  it('editor B sees the app editor A connected (tokenless grant, null lastUsedAt, blocked status)', async () => {
    const { ctrl } = build(members, grants);
    const list = await ctrl.list(req('uB'));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      grantId: 'g1',
      app: { name: 'App', status: 'blocked' },
      account: { id: 'a1' },
      connectedBy: { id: 'uA', name: 'A' },
      lastUsedAt: null,
    });
    expect(JSON.stringify(list)).not.toMatch(/clientId|email/);
  });

  it('editor B can revoke it as "user"', async () => {
    const { ctrl, prisma } = build(members, grants);
    await ctrl.revoke(req('uB'), 'g1');
    expect(prisma.oAuthGrant.updateMany).toHaveBeenCalledWith({
      where: { id: 'g1', revokedAt: null },
      data: expect.objectContaining({ revokedBy: 'user' }),
    });
  });

  it('viewer sees nothing and DELETE is 404', async () => {
    const { ctrl } = build(members, grants);
    expect(await ctrl.list(req('uV'))).toEqual([]);
    await expect(ctrl.revoke(req('uV'), 'g1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a user of another account gets 404 and nothing is revoked', async () => {
    const { ctrl, prisma } = build(members, grants);
    await expect(ctrl.revoke(req('uO'), 'g1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.oAuthGrant.updateMany).not.toHaveBeenCalled();
  });
});
