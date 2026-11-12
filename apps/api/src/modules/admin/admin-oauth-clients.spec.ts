import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AdminOAuthClientsService } from './admin-oauth-clients.service';
import { AdminOAuthClientsController } from './admin-oauth-clients.controller';

function make(client: any) {
  const prisma = {
    oAuthClient: {
      findUnique: jest.fn().mockResolvedValue(client),
      findMany: jest.fn().mockResolvedValue(client ? [client] : []),
      count: jest.fn().mockResolvedValue(client ? 1 : 0),
      update: jest.fn().mockResolvedValue({}),
    },
    oAuthGrant: { groupBy: jest.fn().mockResolvedValue([{ clientId: 'c1', _count: { _all: 2 } }]), updateMany: jest.fn() },
  } as any;
  const cache = { peekWindow: jest.fn().mockResolvedValue(7) } as any;
  return { prisma, cache, svc: new AdminOAuthClientsService(prisma, cache) };
}
const base = {
  id: 'c1', name: 'App', homepageUrl: 'https://x.io', createdAt: new Date('2026-01-01'), status: 'active',
  blockedReason: null, isVerified: false, rateLimitPerGrant: null, rateLimitPerClient: null, deletedAt: null,
  owner: { id: 'u1', name: 'Dev', email: 'd@x.io' },
};

describe('AdminGuard', () => {
  it('refuses a non-admin', () => {
    process.env.ADMIN_EMAILS = 'admin@x.io';
    const ctx: any = { switchToHttp: () => ({ getRequest: () => ({ user: { email: 'u@x.io' } }) }) };
    expect(() => new AdminGuard().canActivate(ctx)).toThrow(ForbiddenException);
  });
});

describe('AdminOAuthClientsService', () => {
  it('lists with grants, live request counter and owner', async () => {
    const { svc, cache } = make(base);
    const { items: [row] } = await svc.list();
    expect(cache.peekWindow).toHaveBeenCalledWith('pa:c:c1');
    expect(row).toMatchObject({ activeGrants: 2, requestsLastMinute: 7, ownerId: 'u1', ownerEmail: 'd@x.io', isDeleted: false });
  });

  it('admin list filters by source and returns ownerEmail null for DCR clients', async () => {
    const dcr = { ...base, source: 'mcp_dcr', owner: null, homepageUrl: null };
    const { svc, prisma } = make(dcr);
    const { items: [row] } = await svc.list('mcp_dcr');
    expect(prisma.oAuthClient.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { source: 'mcp_dcr' } }));
    expect(row).toMatchObject({ source: 'mcp_dcr', ownerId: null, ownerEmail: null, homepageUrl: null });
    await svc.list();
    expect(prisma.oAuthClient.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: {} }));
  });

  it('paginates: default 50, newest first with a stable tiebreak, page/limit honoured', async () => {
    const { svc, prisma } = make(base);
    prisma.oAuthClient.count.mockResolvedValue(120);
    const r = await svc.list();
    expect(prisma.oAuthClient.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: 0, take: 50 }),
    );
    expect(r).toMatchObject({ total: 120, page: 1, limit: 50, totalPages: 3 });
    const r3 = await svc.list('manual', '3', '20');
    expect(prisma.oAuthClient.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { source: 'manual' }, skip: 40, take: 20 }),
    );
    expect(prisma.oAuthClient.count).toHaveBeenLastCalledWith({ where: { source: 'manual' } });
    expect(r3).toMatchObject({ page: 3, limit: 20, totalPages: 6 });
  });

  it('peeks the request counter only for the rows of the returned page, and groups grants by those ids', async () => {
    const { svc, prisma, cache } = make(base);
    const rows = Array.from({ length: 3 }, (_, i) => ({ ...base, id: `c${i}` }));
    prisma.oAuthClient.findMany.mockResolvedValue(rows);
    prisma.oAuthClient.count.mockResolvedValue(10_000);
    const r = await svc.list(undefined, 1, 3);
    expect(cache.peekWindow).toHaveBeenCalledTimes(3);
    expect(prisma.oAuthGrant.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: { in: ['c0', 'c1', 'c2'] }, revokedAt: null } }),
    );
    expect(r.items).toHaveLength(3);
  });

  it('an empty page skips the grant lookup and reports one page', async () => {
    const { svc, prisma } = make(null);
    const r = await svc.list();
    expect(prisma.oAuthGrant.groupBy).not.toHaveBeenCalled();
    expect(r).toEqual({ items: [], total: 0, page: 1, limit: 50, totalPages: 1 });
  });

  it('rejects a bad page or limit before Prisma', async () => {
    const { svc, prisma } = make(base);
    for (const [page, limit] of [['0', undefined], ['-1', undefined], ['x', undefined], [undefined, '0'], [undefined, '201'], [undefined, '1.5']] as const) {
      await expect(svc.list(undefined, page, limit)).rejects.toThrow(BadRequestException);
    }
    expect(prisma.oAuthClient.findMany).not.toHaveBeenCalled();
  });

  it('rejects a source outside the allow-list before Prisma', async () => {
    const { svc, prisma } = make(base);
    await expect(svc.list('evil' as any)).rejects.toThrow(BadRequestException);
    expect(prisma.oAuthClient.findMany).not.toHaveBeenCalled();
  });

  it('blocks an mcp_dcr client like a manual one', async () => {
    const { svc, prisma } = make({ ...base, source: 'mcp_dcr', owner: null });
    await svc.update('c1', { status: 'blocked', blockedReason: 'abuse' });
    expect(prisma.oAuthClient.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { status: 'blocked', blockedReason: 'abuse' } });
  });

  it('block sets status and reason, never touches grants', async () => {
    const { svc, prisma } = make(base);
    await svc.update('c1', { status: 'blocked', blockedReason: ' abuse ' });
    expect(prisma.oAuthClient.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { status: 'blocked', blockedReason: 'abuse' } });
    expect(prisma.oAuthGrant.updateMany).not.toHaveBeenCalled();
  });

  it('block without reason or over 300 chars is rejected', async () => {
    const { svc } = make(base);
    await expect(svc.update('c1', { status: 'blocked' })).rejects.toThrow(BadRequestException);
    await expect(svc.update('c1', { status: 'blocked', blockedReason: '  ' })).rejects.toThrow(BadRequestException);
    await expect(svc.update('c1', { status: 'blocked', blockedReason: 'x'.repeat(301) })).rejects.toThrow(BadRequestException);
  });

  it('unblock clears the reason', async () => {
    const { svc, prisma } = make({ ...base, status: 'blocked', blockedReason: 'abuse' });
    await svc.update('c1', { status: 'active', blockedReason: 'ignored' });
    expect(prisma.oAuthClient.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { status: 'active', blockedReason: null } });
  });

  it('verifies and sets limits, null resets', async () => {
    const { svc, prisma } = make(base);
    await svc.update('c1', { isVerified: true, rateLimitPerGrant: 600, rateLimitPerClient: null });
    expect(prisma.oAuthClient.update).toHaveBeenCalledWith({
      where: { id: 'c1' }, data: { isVerified: true, rateLimitPerGrant: 600, rateLimitPerClient: null },
    });
  });

  it.each([0, -1, 1.5, 100001])('rejects limit %p', async (v) => {
    const { svc } = make(base);
    await expect(svc.update('c1', { rateLimitPerGrant: v })).rejects.toThrow(BadRequestException);
  });

  it('404 unknown, 409 deleted, 400 empty or invalid status', async () => {
    await expect(make(null).svc.update('x', { isVerified: true })).rejects.toThrow(NotFoundException);
    await expect(make({ ...base, deletedAt: new Date() }).svc.update('c1', { isVerified: true })).rejects.toThrow(ConflictException);
    await expect(make(base).svc.update('c1', {})).rejects.toThrow(BadRequestException);
    await expect(make(base).svc.update('c1', { status: 'x' as any })).rejects.toThrow(BadRequestException);
  });
});

describe('AdminOAuthClientsController', () => {
  it('passes the source, page and limit queries to the service', () => {
    const svc = { list: jest.fn() } as any;
    new AdminOAuthClientsController(svc, {} as any).list('manual', '2', '25');
    expect(svc.list).toHaveBeenCalledWith('manual', '2', '25');
  });

  it('writes an audit entry on update', async () => {
    const svc = { update: jest.fn().mockResolvedValue({ isVerified: true }) } as any;
    const admin = { logAction: jest.fn() } as any;
    const ctrl = new AdminOAuthClientsController(svc, admin);
    await ctrl.update('c1', { isVerified: true }, { user: { id: 'a1' }, headers: {}, socket: { remoteAddress: '1.1.1.1' } } as any);
    expect(admin.logAction).toHaveBeenCalledWith('a1', 'oauth_client.update', 'oauth_client', 'c1', { isVerified: true }, '1.1.1.1');
  });
});
