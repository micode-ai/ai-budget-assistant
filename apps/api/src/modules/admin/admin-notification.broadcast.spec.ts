import { AdminNotificationService } from './admin-notification.service';

// ABA-742: a broadcast can be limited to people who actually use the app.
describe('AdminNotificationService.sendBroadcast — activeWithinDays filter', () => {
  function make() {
    const prisma = {
      user: { findMany: jest.fn().mockResolvedValue([]) },
      notificationLog: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
    } as any;
    const svc = new AdminNotificationService(prisma, {} as any, {} as any) as any;
    svc.sendEmail = jest.fn().mockResolvedValue({ recipientCount: 0, successCount: 0 });
    svc.sendPush = jest.fn().mockResolvedValue({ recipientCount: 0, successCount: 0 });
    return { svc, prisma };
  }

  const whereOf = (prisma: any) => prisma.user.findMany.mock.calls[0][0].where;

  it('limits recipients to last activity within N days', async () => {
    const { svc, prisma } = make();
    const before = Date.now();
    await svc.sendBroadcast('admin', 'email', { subject: 's', body: 'b', filters: { isActive: true, activeWithinDays: 30 } });
    const gte: Date = whereOf(prisma).lastSyncAt.gte;
    expect(before - gte.getTime()).toBeGreaterThanOrEqual(30 * 86_400_000 - 1000);
    expect(before - gte.getTime()).toBeLessThan(30 * 86_400_000 + 5000);
    expect(whereOf(prisma).isActive).toBe(true);
  });

  it('adds no activity filter when absent, zero or junk', async () => {
    for (const activeWithinDays of [undefined, 0, -5, 'abc' as any]) {
      const { svc, prisma } = make();
      await svc.sendBroadcast('admin', 'email', { subject: 's', body: 'b', filters: { activeWithinDays } });
      expect(whereOf(prisma).lastSyncAt).toBeUndefined();
    }
  });

  it('clamps to a year', async () => {
    const { svc, prisma } = make();
    const before = Date.now();
    await svc.sendBroadcast('admin', 'push', { title: 't', body: 'b', filters: { activeWithinDays: 9999 } });
    expect(before - whereOf(prisma).lastSyncAt.gte.getTime()).toBeLessThan(365 * 86_400_000 + 5000);
  });
});
