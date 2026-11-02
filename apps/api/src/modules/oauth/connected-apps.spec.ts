import { NotFoundException } from '@nestjs/common';
import { OAuthGrantsService } from './oauth-grants.service';
import { ConnectedAppsController } from './connected-apps.controller';

type Acc = { id: string; name: string; type: string; tier?: number; trip?: string | null };
type Member = { accountId: string; userId: string; role: string };

const ACCOUNTS: Acc[] = [
  { id: 'P', name: 'Private Wallet', type: 'personal' },
  { id: 'S', name: 'Family', type: 'shared' },
];

/** In-memory prisma implementing exactly the where-shapes the service issues. */
function build(members: Member[], grantAccounts: string[]) {
  let joins = [...grantAccounts];
  let revokedAt: Date | null = null;
  const grantRow = () => ({ id: 'g1', userId: 'uA', revokedAt });
  const isOwnerEditor = (userId: string, accountId: string) =>
    members.some((m) => m.accountId === accountId && m.userId === userId && ['owner', 'editor'].includes(m.role));
  const prisma: any = {
    oAuthGrant: {
      findMany: jest.fn(async ({ where }) => {
        const userId = where.OR[0].userId as string;
        const visible = !revokedAt && (userId === 'uA' || joins.some((a) => isOwnerEditor(userId, a)));
        if (!visible) return [];
        return [
          {
            id: 'g1',
            userId: 'uA',
            scopes: ['expenses:read'],
            createdAt: new Date('2026-01-01'),
            lastUsedAt: null,
            client: { name: 'App', logoUrl: null, homepageUrl: 'https://x.io', isVerified: false, status: 'blocked' },
            user: { id: 'uA', name: 'A' },
            accounts: joins.map((id) => {
              const a = ACCOUNTS.find((x) => x.id === id)!;
              return {
                account: {
                  id: a.id,
                  name: a.name,
                  type: a.type,
                  currencyCode: 'USD',
                  encryptionTier: a.tier ?? 0,
                  tripStatus: a.trip ?? null,
                  members: members.filter((m) => m.accountId === id).map((m) => ({ userId: m.userId, role: m.role })),
                },
              };
            }),
          },
        ];
      }),
      findFirst: jest.fn(async ({ where }) => {
        if (revokedAt || where.id !== 'g1') return null;
        const acc = where.accounts?.some?.accountId;
        if (acc && !joins.includes(acc)) return null;
        return { ...grantRow(), accounts: joins.map((accountId) => ({ accountId })) };
      }),
      updateMany: jest.fn(async () => {
        revokedAt = revokedAt ?? new Date();
        return { count: 1 };
      }),
    },
    accountMember: {
      findMany: jest.fn(async ({ where }) =>
        members.filter(
          (m) => m.userId === where.userId && where.role.in.includes(m.role) && where.accountId.in.includes(m.accountId),
        ),
      ),
      findFirst: jest.fn(async ({ where }) =>
        members.find((m) => m.userId === where.userId && m.accountId === where.accountId && where.role.in.includes(m.role)) ??
        null,
      ),
    },
    oAuthGrantAccount: {
      deleteMany: jest.fn(async ({ where }) => {
        joins = joins.filter((a) => !where.accountId.in.includes(a));
        return { count: 0 };
      }),
      count: jest.fn(async () => joins.length),
    },
    oAuthToken: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
  };
  return { prisma, ctrl: new ConnectedAppsController(new OAuthGrantsService(prisma)), state: () => ({ joins, revokedAt }) };
}

const req = (id: string): any => ({ user: { id } });
const members: Member[] = [
  { accountId: 'P', userId: 'uA', role: 'owner' },
  { accountId: 'S', userId: 'uA', role: 'editor' },
  { accountId: 'S', userId: 'uV', role: 'owner' },
  { accountId: 'S', userId: 'uW', role: 'viewer' },
];

describe('connected apps (multi-account)', () => {
  it('the grantor sees every granted account and isGrantor', async () => {
    const { ctrl } = build(members, ['P', 'S']);
    const list = await ctrl.list(req('uA'));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      grantId: 'g1',
      isGrantor: true,
      app: { name: 'App', status: 'blocked' },
      account: { id: 'P', name: 'Private Wallet' },
      connectedBy: { id: 'uA', name: 'A' },
      lastUsedAt: null,
    });
    expect(list[0].accounts.map((a) => a.id)).toEqual(['P', 'S']);
    expect(JSON.stringify(list)).not.toMatch(/clientId|email/);
  });

  it('a co-owner sees only the accounts they own/edit, never the grantor private account', async () => {
    const { ctrl } = build(members, ['P', 'S']);
    const list = await ctrl.list(req('uV'));
    expect(list).toHaveLength(1);
    expect(list[0].isGrantor).toBe(false);
    expect(list[0].accounts.map((a) => a.id)).toEqual(['S']);
    expect(JSON.stringify(list)).not.toContain('Private Wallet');
  });

  it('a viewer sees nothing', async () => {
    const { ctrl } = build(members, ['P', 'S']);
    expect(await ctrl.list(req('uW'))).toEqual([]);
  });

  it('a grantor demoted to viewer still sees the account, inactive for role', async () => {
    const demoted = members.map((m) => (m.userId === 'uA' && m.accountId === 'S' ? { ...m, role: 'viewer' } : m));
    const { ctrl } = build(demoted, ['P', 'S']);
    const row = (await ctrl.list(req('uA')))[0];
    expect(row.accounts.find((a) => a.id === 'S')).toMatchObject({ name: 'Family', active: false, reason: 'role' });
    expect(row.accounts.find((a) => a.id === 'P')).toMatchObject({ active: true, reason: null });
  });

  it('a grantor who left the account (no membership) sees the row but not its current name', async () => {
    const left = members.filter((m) => !(m.userId === 'uA' && m.accountId === 'S'));
    const { ctrl } = build(left, ['P', 'S']);
    const row = (await ctrl.list(req('uA')))[0];
    expect(row.accounts.find((a) => a.id === 'S')).toMatchObject({ name: null, active: false, reason: 'role' });
    expect(row.accounts.find((a) => a.id === 'P')).toMatchObject({ name: 'Private Wallet' });
    expect(JSON.stringify(row)).not.toContain('Family');
  });

  it('co-owner Disconnect removes only their accounts; the grant stays active with the rest', async () => {
    const { ctrl, state } = build(members, ['P', 'S']);
    await ctrl.disconnect(req('uV'), 'g1');
    expect(state().joins).toEqual(['P']);
    expect(state().revokedAt).toBeNull();
  });

  it('grantor Disconnect revokes the whole grant', async () => {
    const { ctrl, state, prisma } = build(members, ['P', 'S']);
    await ctrl.disconnect(req('uA'), 'g1');
    expect(state().revokedAt).not.toBeNull();
    expect(prisma.oAuthToken.deleteMany).toHaveBeenCalledWith({ where: { grantId: 'g1' } });
  });

  it('a viewer Disconnect is 404 and changes nothing', async () => {
    const { ctrl, state } = build(members, ['P', 'S']);
    await expect(ctrl.disconnect(req('uW'), 'g1')).rejects.toBeInstanceOf(NotFoundException);
    expect(state().joins).toEqual(['P', 'S']);
  });

  it('a co-owner cannot remove an account they do not own/edit (404)', async () => {
    const { ctrl, state } = build(members, ['P', 'S']);
    await expect(ctrl.removeAccount(req('uV'), 'g1', 'P')).rejects.toBeInstanceOf(NotFoundException);
    expect(state().joins).toEqual(['P', 'S']);
  });

  it('a co-owner can remove their own account, the grantor any granted one', async () => {
    const a = build(members, ['P', 'S']);
    await a.ctrl.removeAccount(req('uV'), 'g1', 'S');
    expect(a.state().joins).toEqual(['P']);
    const b = build(members, ['P', 'S']);
    await b.ctrl.removeAccount(req('uA'), 'g1', 'P');
    expect(b.state().joins).toEqual(['S']);
  });

  it('removing the last account revokes the grant; an account outside the grant is 404', async () => {
    const { ctrl, state } = build(members, ['S']);
    await expect(ctrl.removeAccount(req('uA'), 'g1', 'P')).rejects.toBeInstanceOf(NotFoundException);
    await ctrl.removeAccount(req('uA'), 'g1', 'S');
    expect(state().revokedAt).not.toBeNull();
  });
});
