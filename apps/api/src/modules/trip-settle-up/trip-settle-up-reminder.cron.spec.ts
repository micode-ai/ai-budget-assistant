import { TripSettleUpReminderCron } from './trip-settle-up-reminder.cron';
import * as ni18n from '../notifications/notification-i18n';

describe('TripSettleUpReminderCron', () => {
  it('transitions ended trips to settling and notifies every member', async () => {
    const prisma: any = {
      account: {
        findMany: jest.fn().mockResolvedValue([{ id: 'acc-1', name: 'Bali trip' }]),
        update: jest.fn().mockResolvedValue({}),
      },
      accountMember: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'alice' }, { userId: 'bob' }]),
      },
    };
    const notificationsService: any = { sendToUser: jest.fn().mockResolvedValue(undefined) };

    const cron = new TripSettleUpReminderCron(prisma, notificationsService);
    await cron.handleTripEndings();

    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: { type: 'trip', tripStatus: 'active', tripEndDate: { lt: expect.any(Date) } },
      select: { id: true, name: true },
    });
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { tripStatus: 'settling' },
    });
    expect(prisma.accountMember.findMany).toHaveBeenCalledWith({
      where: { accountId: 'acc-1' },
      select: { userId: true },
    });

    // Status transition must happen before the member/notification loop, so a
    // crash mid-loop doesn't leave the trip stuck on `active` forever.
    const updateOrder = prisma.account.update.mock.invocationCallOrder[0];
    const membersOrder = prisma.accountMember.findMany.mock.invocationCallOrder[0];
    expect(updateOrder).toBeLessThan(membersOrder);

    expect(notificationsService.sendToUser).toHaveBeenCalledTimes(2);
    expect(notificationsService.sendToUser.mock.calls[0][0]).toBe('alice');
    expect(notificationsService.sendToUser.mock.calls[1][0]).toBe('bob');
    expect(notificationsService.sendToUser.mock.calls[0][4]).toBe('trip_settle_up');
  });

  it('sends localized title/body (not hardcoded English strings)', async () => {
    const prisma: any = {
      account: {
        findMany: jest.fn().mockResolvedValue([{ id: 'acc-1', name: 'Bali trip' }]),
        update: jest.fn().mockResolvedValue({}),
      },
      accountMember: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'alice' }]),
      },
    };
    const notificationsService: any = { sendToUser: jest.fn().mockResolvedValue(undefined) };

    const cron = new TripSettleUpReminderCron(prisma, notificationsService);
    await cron.handleTripEndings();

    const [, title, body] = notificationsService.sendToUser.mock.calls[0];

    // Title/body must be resolver functions (lang) => string, not plain
    // hardcoded strings — this is what lets NotificationsService.sendToUser
    // localize per-recipient via user.language.
    expect(typeof title).toBe('function');
    expect(typeof body).toBe('function');

    expect(title('en')).toBe(ni18n.tripSettleUpTitle('en', { tripName: 'Bali trip' }));
    expect(body('en')).toBe(ni18n.tripSettleUpBody('en', { tripName: 'Bali trip' }));
    expect(title('en')).toBe('Bali trip has ended');
    expect(body('en')).toBe('Time to settle up with your trip group');

    // A non-English language must produce genuinely different copy, proving
    // this isn't just wrapping the same hardcoded English string in a function.
    expect(title('pl')).toBe('Wyjazd "Bali trip" się zakończył');
    expect(body('pl')).toBe('Czas rozliczyć się z grupą wyjazdową');
    expect(title('pl')).not.toBe(title('en'));
    expect(body('pl')).not.toBe(body('en'));
  });

  it('does not throw when a notification send rejects for one member', async () => {
    const prisma: any = {
      account: {
        findMany: jest.fn().mockResolvedValue([{ id: 'acc-1', name: 'Bali trip' }]),
        update: jest.fn().mockResolvedValue({}),
      },
      accountMember: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'alice' }, { userId: 'bob' }]),
      },
    };
    const notificationsService: any = {
      sendToUser: jest
        .fn()
        .mockRejectedValueOnce(new Error('push failed'))
        .mockResolvedValueOnce(undefined),
    };

    const cron = new TripSettleUpReminderCron(prisma, notificationsService);
    await expect(cron.handleTripEndings()).resolves.not.toThrow();
    expect(notificationsService.sendToUser).toHaveBeenCalledTimes(2);
  });

  it('does nothing when there are no ended active trips', async () => {
    const prisma: any = {
      account: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      accountMember: {
        findMany: jest.fn(),
      },
    };
    const notificationsService: any = { sendToUser: jest.fn() };

    const cron = new TripSettleUpReminderCron(prisma, notificationsService);
    await cron.handleTripEndings();

    expect(prisma.account.update).not.toHaveBeenCalled();
    expect(prisma.accountMember.findMany).not.toHaveBeenCalled();
    expect(notificationsService.sendToUser).not.toHaveBeenCalled();
  });
});
