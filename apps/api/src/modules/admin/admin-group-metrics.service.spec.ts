import 'reflect-metadata';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminGroupMetricsService } from './admin-group-metrics.service';

function makePrisma() {
  const today = new Date();
  return {
    expenseGroup: {
      count: jest.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(4).mockResolvedValueOnce(2),
      findMany: jest.fn().mockResolvedValue([{ createdAt: today }, { createdAt: today }]),
    },
    expenseGroupMember: {
      count: jest.fn().mockResolvedValueOnce(30).mockResolvedValueOnce(12).mockResolvedValueOnce(3).mockResolvedValueOnce(7),
      findMany: jest
        .fn()
        .mockResolvedValueOnce([{ createdAt: today }])
        .mockResolvedValueOnce([{ linkedAt: today }]),
    },
  } as any;
}

describe('AdminGroupMetricsService', () => {
  it('assembles totals and a gap-free daily series', async () => {
    const prisma = makePrisma();
    const res = await new AdminGroupMetricsService(prisma).getGroupMetrics(7);
    expect(res.windowDays).toBe(7);
    expect(res.totals).toEqual({
      groupsCreated: 10,
      activeGroups: 4,
      archivedGroups: 2,
      membersTotal: 30,
      guestMembers: 12,
      guestsLinked: 3,
      appUsersJoinedViaLink: 7,
    });
    expect(res.daily).toHaveLength(7);
    expect(res.daily[6]).toMatchObject({ groupsCreated: 2, guestsJoined: 1, guestsLinked: 1 });
    expect(res.daily[0]).toMatchObject({ groupsCreated: 0, guestsJoined: 0, guestsLinked: 0 });
  });

  it('active means non-archived with an expense or settlement in the window', async () => {
    const prisma = makePrisma();
    await new AdminGroupMetricsService(prisma).getGroupMetrics(30);
    const where = prisma.expenseGroup.count.mock.calls[1][0].where;
    expect(where.status).toBe('active');
    expect(where.OR).toHaveLength(2);
  });

  it('counts guests by provenance and links by linkedAt', async () => {
    const prisma = makePrisma();
    await new AdminGroupMetricsService(prisma).getGroupMetrics(30);
    const calls = prisma.expenseGroupMember.count.mock.calls.map((c: any) => c[0].where);
    expect(calls[1].joinedVia).toEqual({ in: ['guest', 'guest_linked'] });
    expect(calls[2].linkedAt).toEqual({ not: null });
    expect(calls[3].joinedVia).toBe('app_link');
  });

  it('exposes no identifying fields', async () => {
    const res = await new AdminGroupMetricsService(makePrisma()).getGroupMetrics(3);
    expect(JSON.stringify(res)).not.toMatch(/userId|email|guestToken|displayName/i);
  });
});

describe('AdminController group metrics route', () => {
  it('sits behind JwtAuthGuard + AdminGuard (class level)', () => {
    expect(Reflect.getMetadata('__guards__', AdminController)).toEqual([JwtAuthGuard, AdminGuard]);
    expect(typeof AdminController.prototype.getGroupMetrics).toBe('function');
  });

  it('clamps days to 1..365 and defaults to 30', async () => {
    const svc = { getGroupMetrics: jest.fn() } as any;
    const ctl = new (AdminController as any)(null, null, null, null, null, svc);
    await ctl.getGroupMetrics(undefined);
    await ctl.getGroupMetrics('9999');
    await ctl.getGroupMetrics('0');
    expect(svc.getGroupMetrics.mock.calls.map((c: any) => c[0])).toEqual([30, 365, 1]);
  });
});
