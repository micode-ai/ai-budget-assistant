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

describe('NotificationsService.sendToUser — leaflet_promo preference gate (Gazetka match)', () => {
  let service: NotificationsService;
  let prisma: any;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) } };
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

  it('notifyLeafletPromos false → sendToUser returns false', async () => {
    prisma.user.findUnique.mockResolvedValue({ pushToken: 'ExponentPushToken[abc]', language: 'en', notifyLeafletPromos: false });
    const result = await service.sendToUser('user-1', 'T', 'B', { pushKey: 'log-1' }, 'leaflet_promo');
    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.user.findUnique.mock.calls[0][0].select.notifyLeafletPromos).toBe(true);
  });

  it('sends with data.type leaflet_promo and the pushKey when the toggle is on', async () => {
    prisma.user.findUnique.mockResolvedValue({ pushToken: 'ExponentPushToken[abc]', language: 'en', notifyLeafletPromos: true });
    const result = await service.sendToUser('user-1', 'T', 'B', { type: 'leaflet_promo', pushKey: 'log-1' }, 'leaflet_promo');
    expect(result).toBe(true);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    const message = Array.isArray(sent) ? sent[0] : sent;
    expect(message.data).toEqual({ type: 'leaflet_promo', pushKey: 'log-1' });
  });
});

describe('NotificationsService — quiet hours', () => {
  let service: NotificationsService;
  let prisma: any;
  let fetchMock: jest.Mock;

  const user = (over: Record<string, unknown> = {}) => ({
    pushToken: 'ExponentPushToken[abc]',
    language: 'en',
    timezone: 'UTC',
    notifyBudgetAlerts: true,
    quietHoursEnabled: true,
    quietHoursStart: 1320,
    quietHoursEnd: 480,
    ...over,
  });

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      heldPush: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn(), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ status: 'ok', id: 't' }] }),
    });
    (global as any).fetch = fetchMock;
    const module = await Test.createTestingModule({
      providers: [NotificationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(NotificationsService);
    jest.useFakeTimers().setSystemTime(new Date('2026-11-26T23:30:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('holds a typed push inside the window instead of sending', async () => {
    prisma.user.findUnique.mockResolvedValue(user());
    const ok = await service.sendToUser('u1', 'T', 'B', {}, 'budget_alert');
    expect(ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.heldPush.create.mock.calls[0][0].data.releaseAt.toISOString()).toBe('2026-11-27T08:00:00.000Z');
  });

  it('never holds an untyped (security) push', async () => {
    prisma.user.findUnique.mockResolvedValue(user());
    await service.sendToUser('u1', 'T', 'B');
    expect(prisma.heldPush.create).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('sends normally when quiet hours are off', async () => {
    prisma.user.findUnique.mockResolvedValue(user({ quietHoursEnabled: false }));
    await service.sendToUser('u1', 'T', 'B', {}, 'budget_alert');
    expect(prisma.heldPush.create).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalled();
  });

  const held = (over: Record<string, unknown> = {}) => ({
    id: 'h1', userId: 'u1', title: 'T', body: 'B', type: 'budget_alert', data: { type: 'budget_alert' },
    releaseAt: new Date('2026-11-27T08:00:00Z'),
    user: { pushToken: 'ExponentPushToken[abc]', notifyBudgetAlerts: true },
    ...over,
  });

  it('releases due held pushes after claiming (deleting) the row', async () => {
    prisma.heldPush.findMany.mockResolvedValue([held()]);
    expect(await service.releaseHeldPushes()).toBe(1);
    expect(prisma.heldPush.deleteMany).toHaveBeenCalledWith({ where: { id: 'h1' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('drops a held push without sending when the type preference was turned off', async () => {
    prisma.heldPush.findMany.mockResolvedValue([held({ user: { pushToken: 'ExponentPushToken[abc]', notifyBudgetAlerts: false } })]);
    expect(await service.releaseHeldPushes()).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.heldPush.deleteMany).toHaveBeenCalled();
  });

  it('skips a row another tick already claimed', async () => {
    prisma.heldPush.findMany.mockResolvedValue([held()]);
    prisma.heldPush.deleteMany.mockResolvedValue({ count: 0 });
    expect(await service.releaseHeldPushes()).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('re-queues the row when the transport fails', async () => {
    prisma.heldPush.findMany.mockResolvedValue([held()]);
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('boom') });
    expect(await service.releaseHeldPushes()).toBe(0);
    expect(prisma.heldPush.create).toHaveBeenCalledTimes(1);
    expect(prisma.heldPush.create.mock.calls[0][0].data.userId).toBe('u1');
  });

  it('does not resend or re-queue when ticket handling throws, and continues the loop', async () => {
    prisma.heldPush.findMany.mockResolvedValue([held(), held({ id: 'h2' })]);
    jest.spyOn(service as any, 'handleTicketErrors').mockRejectedValue(new Error('db down'));
    expect(await service.releaseHeldPushes()).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(prisma.heldPush.create).not.toHaveBeenCalled();
  });

  it('continues past a row that throws', async () => {
    prisma.heldPush.findMany.mockResolvedValue([held(), held({ id: 'h2' })]);
    prisma.heldPush.deleteMany.mockRejectedValueOnce(new Error('db')).mockResolvedValue({ count: 1 });
    expect(await service.releaseHeldPushes()).toBe(1);
  });
});
