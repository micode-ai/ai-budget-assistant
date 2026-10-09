import { Test } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../database/prisma.service';

describe('NotificationsService.sendToUser — trip_settle_up preference gate', () => {
  let service: NotificationsService;
  let prisma: any;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ status: 'ok', id: 'ticket-1' }] }),
    });
    (global as any).fetch = fetchMock;

    const module = await Test.createTestingModule({
      providers: [NotificationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(NotificationsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('skips sending when the member has notifyTripSettleUp: false', async () => {
    prisma.user.findUnique.mockResolvedValue({
      pushToken: 'ExponentPushToken[abc]',
      language: 'en',
      notifyTripSettleUp: false,
    });

    const result = await service.sendToUser(
      'user-1',
      'Bali trip has ended',
      'Time to settle up',
      { accountId: 'acc-1' },
      'trip_settle_up',
    );

    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends when the member has notifyTripSettleUp: true', async () => {
    prisma.user.findUnique.mockResolvedValue({
      pushToken: 'ExponentPushToken[abc]',
      language: 'en',
      notifyTripSettleUp: true,
    });

    const result = await service.sendToUser(
      'user-1',
      'Bali trip has ended',
      'Time to settle up',
      { accountId: 'acc-1' },
      'trip_settle_up',
    );

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationsService — group_reminder preference gate (ABA-653)', () => {
  let service: NotificationsService;
  let prisma: any;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn().mockResolvedValue({}) } };
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ status: 'ok', id: 'ticket-1' }] }),
    });
    (global as any).fetch = fetchMock;
    const module = await Test.createTestingModule({
      providers: [NotificationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(NotificationsService);
  });

  afterEach(() => jest.restoreAllMocks());

  const user = (notifyGroupReminders: boolean, extra: Record<string, unknown> = {}) => ({
    pushToken: 'ExponentPushToken[abc]',
    language: 'en',
    notifyGroupActivity: true,
    notifyGroupReminders,
    ...extra,
  });

  it('sendToUser skips a user who turned group reminders off', async () => {
    prisma.user.findUnique.mockResolvedValue(user(false));
    expect(await service.sendToUser('u1', 't', 'b', { groupId: 'g1' }, 'group_reminder')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sendToUser sends when group reminders are on', async () => {
    prisma.user.findUnique.mockResolvedValue(user(true));
    expect(await service.sendToUser('u1', 't', 'b', { groupId: 'g1' }, 'group_reminder')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('the reminder toggle does not gate group_activity, and vice versa', async () => {
    prisma.user.findUnique.mockResolvedValue(user(false));
    expect(await service.sendToUser('u1', 't', 'b', { groupId: 'g1' }, 'group_activity')).toBe(true);
    prisma.user.findUnique.mockResolvedValue(user(true, { notifyGroupActivity: false }));
    expect(await service.sendToUser('u1', 't', 'b', { groupId: 'g1' }, 'group_reminder')).toBe(true);
  });

  it('sendToUsers filters out the users who turned group reminders off', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', ...user(true, { pushToken: 'ExponentPushToken[one]' }) },
      { id: 'u2', ...user(false, { pushToken: 'ExponentPushToken[two]' }) },
    ]);
    await service.sendToUsers(['u1', 'u2'], 't', 'b', { groupId: 'g1' }, 'group_reminder');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.map((m: { to: string }) => m.to)).toEqual(['ExponentPushToken[one]']);
  });
});
