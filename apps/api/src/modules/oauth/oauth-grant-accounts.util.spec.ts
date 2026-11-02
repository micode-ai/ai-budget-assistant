import {
  GRANTING_ROLES,
  dropAccountFromGrants,
  grantAccountAccess,
  grantAccountStatus,
  loadGrantAccountStates,
  type GrantAccountState,
} from './oauth-grant-accounts.util';

const state = (o: Partial<GrantAccountState> = {}): GrantAccountState => ({
  id: 'a1',
  name: 'A',
  type: 'personal',
  currencyCode: 'USD',
  encryptionTier: 0,
  tripStatus: null,
  role: 'owner',
  ...o,
});

describe('grantAccountStatus', () => {
  it('role beats encryption', () => {
    expect(grantAccountStatus(state({ role: 'viewer', encryptionTier: 2 }))).toEqual({ active: false, reason: 'role' });
  });
  it('no membership is a role failure', () => {
    expect(grantAccountStatus(state({ role: null }))).toEqual({ active: false, reason: 'role' });
  });
  it('tier >= 2 is encrypted', () => {
    expect(grantAccountStatus(state({ role: 'owner', encryptionTier: 2 }))).toEqual({ active: false, reason: 'encrypted' });
  });
  it('an archived trip stays active but flagged', () => {
    expect(grantAccountStatus(state({ role: 'editor', tripStatus: 'archived' }))).toEqual({ active: true, reason: 'archived' });
  });
  it('plain is active', () => {
    expect(grantAccountStatus(state())).toEqual({ active: true, reason: null });
  });
});

describe('grantAccountAccess', () => {
  const W = ['expenses:read', 'expenses:write'];
  it('tier 1 is read even with write scope', () => {
    expect(grantAccountAccess(state({ encryptionTier: 1 }), W)).toBe('read');
  });
  it('tier 0 without write scope is read', () => {
    expect(grantAccountAccess(state(), ['expenses:read'])).toBe('read');
  });
  it('tier 0 with write scope is read_write', () => {
    expect(grantAccountAccess(state(), W)).toBe('read_write');
  });
  it('archived is read', () => {
    expect(grantAccountAccess(state({ tripStatus: 'archived' }), W)).toBe('read');
  });
  it('an inactive account is read', () => {
    expect(grantAccountAccess(state({ role: 'viewer' }), W)).toBe('read');
  });
});

it('GRANTING_ROLES is owner and editor', () => {
  expect([...GRANTING_ROLES].sort()).toEqual(['editor', 'owner']);
});

describe('loadGrantAccountStates', () => {
  it('joins active accounts with the grantor role, null when not a member', async () => {
    const db: any = {
      oAuthGrantAccount: {
        findMany: jest.fn().mockResolvedValue([
          { account: { id: 'a1', name: 'A', type: 'personal', currencyCode: 'USD', encryptionTier: 0, tripStatus: null } },
          { account: { id: 'a2', name: 'B', type: 'shared', currencyCode: 'EUR', encryptionTier: 1, tripStatus: null } },
        ]),
      },
      accountMember: { findMany: jest.fn().mockResolvedValue([{ accountId: 'a1', role: 'editor' }]) },
    };
    const r = await loadGrantAccountStates(db, 'g1', 'u1');
    expect(db.oAuthGrantAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { grantId: 'g1', account: { isActive: true } },
        orderBy: [{ createdAt: 'asc' }, { accountId: 'asc' }],
      }),
    );
    expect(r.map((s) => [s.id, s.role])).toEqual([
      ['a1', 'editor'],
      ['a2', null],
    ]);
  });
});

describe('dropAccountFromGrants', () => {
  function build(joins: { grantId: string; accountId: string }[]) {
    const tx: any = {
      oAuthGrantAccount: {
        findMany: jest.fn(async ({ where }) => joins.filter((j) => j.accountId === where.accountId)),
        deleteMany: jest.fn(async ({ where }) => {
          for (let i = joins.length - 1; i >= 0; i--) if (joins[i].accountId === where.accountId) joins.splice(i, 1);
          return { count: 0 };
        }),
      },
      oAuthGrant: {
        findMany: jest.fn(async ({ where }) =>
          (where.id.in as string[]).filter((id) => !joins.some((j) => j.grantId === id)).map((id) => ({ id })),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      oAuthToken: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    return tx;
  }

  it('keeps a grant that still has another account', async () => {
    const tx = build([
      { grantId: 'g1', accountId: 'A' },
      { grantId: 'g1', accountId: 'B' },
    ]);
    await dropAccountFromGrants(tx, 'A');
    expect(tx.oAuthGrantAccount.deleteMany).toHaveBeenCalledWith({ where: { accountId: 'A' } });
    expect(tx.oAuthGrant.updateMany).not.toHaveBeenCalled();
    expect(tx.oAuthToken.deleteMany).not.toHaveBeenCalled();
  });

  it('revokes a grant left with no accounts and deletes its tokens', async () => {
    const tx = build([{ grantId: 'g1', accountId: 'A' }]);
    await dropAccountFromGrants(tx, 'A');
    expect(tx.oAuthToken.deleteMany).toHaveBeenCalledWith({ where: { grantId: { in: ['g1'] } } });
    expect(tx.oAuthGrant.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['g1'] }, revokedAt: null },
      data: { revokedAt: expect.any(Date), revokedBy: 'user' },
    });
  });
});
