import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccountGroupsService } from './account-groups.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

function make(over: { members?: string[]; groups?: any[]; count?: number } = {}) {
  const prisma: any = {
    accountMember: {
      findMany: jest.fn().mockResolvedValue((over.members ?? ['a1', 'a2']).map((accountId) => ({ accountId }))),
    },
    accountGroup: {
      count: jest.fn().mockResolvedValue(over.count ?? 0),
      findMany: jest.fn().mockResolvedValue(over.groups ?? []),
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve((over.groups ?? []).find((g) => g.id === where.id && g.userId === where.userId) ?? null),
        ),
      create: jest
        .fn()
        .mockImplementation(({ data }: any) =>
          Promise.resolve({ id: 'g-new', name: data.name, accounts: data.accounts.create }),
        ),
      update: jest
        .fn()
        .mockImplementation(({ where, data }: any) =>
          Promise.resolve({ id: where.id, name: data.name, accounts: data.accounts.create }),
        ),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  return { prisma, svc: new AccountGroupsService(prisma) };
}

const group = (accountIds: string[]) => ({
  id: 'g1',
  userId: 'u',
  name: 'Family',
  accounts: accountIds.map((accountId) => ({ accountId })),
});

describe('AccountGroupsService', () => {
  it('create rejects an account the user is not a member of (403)', async () => {
    const { svc, prisma } = make({ members: ['a1'] });
    await expect(svc.create('u', { name: 'X', accountIds: ['a1', 'zz'] })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.accountGroup.create).not.toHaveBeenCalled();
  });

  it('create rejects the 21st group with GROUP_LIMIT (400)', async () => {
    const { svc } = make({ count: 20 });
    const err: any = await svc.create('u', { name: 'X', accountIds: ['a1'] }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toBe('GROUP_LIMIT');
  });

  it('create stores a trimmed name and de-duplicated accounts', async () => {
    const { svc, prisma } = make();
    const r = await svc.create('u', { name: '  Home ', accountIds: ['a1', 'a1', 'a2'] });
    expect(prisma.accountGroup.create.mock.calls[0][0].data.name).toBe('Home');
    expect(r).toEqual({ id: 'g-new', name: 'Home', accountIds: ['a1', 'a2'] });
  });

  it('update/remove/resolveAccountIds of another user group -> 404', async () => {
    const { svc } = make({ groups: [group(['a1'])] });
    await expect(svc.update('other', 'g1', { name: 'X', accountIds: ['a1'] })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.remove('other', 'g1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.resolveAccountIds('other', 'g1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update checks membership before replacing the accounts', async () => {
    const { svc, prisma } = make({ groups: [group(['a1'])], members: ['a1'] });
    await expect(svc.update('u', 'g1', { name: 'X', accountIds: ['zz'] })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.accountGroup.update).not.toHaveBeenCalled();
  });

  it('list drops an account the user is no longer a member of', async () => {
    const { svc } = make({ groups: [group(['a1', 'gone'])], members: ['a1'] });
    expect(await svc.list('u')).toEqual([{ id: 'g1', name: 'Family', accountIds: ['a1'] }]);
  });

  it('resolveAccountIds re-filters by current membership', async () => {
    const { svc } = make({ groups: [group(['a1', 'gone'])], members: ['a1'] });
    expect(await svc.resolveAccountIds('u', 'g1')).toEqual(['a1']);
  });

  it('remove deletes the owner group', async () => {
    const { svc, prisma } = make({ groups: [group(['a1'])] });
    await svc.remove('u', 'g1');
    expect(prisma.accountGroup.delete).toHaveBeenCalledWith({ where: { id: 'g1' } });
  });
});
