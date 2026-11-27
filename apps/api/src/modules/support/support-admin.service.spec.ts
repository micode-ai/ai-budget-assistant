import { ConflictException, NotFoundException } from '@nestjs/common';
import { SupportAdminService } from './support-admin.service';

const now = new Date('2026-11-27T10:00:00Z');

function makeThread(over: Record<string, unknown> = {}) {
  return {
    id: 't1', userId: 'u1', status: 'open', muted: false, developerUnreadCount: 2, lastMessageAt: now,
    user: { id: 'u1', name: 'Ann', email: 'a@b.c', language: 'en', isActive: true, pushToken: 'ExponentPushToken[x]' },
    messages: [{ body: 'Hello' }],
    ...over,
  };
}

describe('SupportAdminService', () => {
  let prisma: any;
  let translation: { translate: jest.Mock };
  let notifications: { sendToUser: jest.Mock };
  let gateway: { emitSupportMessage: jest.Mock; emitSupportUnread: jest.Mock };
  let service: SupportAdminService;
  let supportEmail: { sendUnreadReplyEmail: jest.Mock };

  beforeEach(() => {
    prisma = {
      supportThread: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(makeThread()),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve(makeThread(data))),
        aggregate: jest.fn().mockResolvedValue({ _sum: { developerUnreadCount: 3 } }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      supportMessage: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'm1', readAt: null, createdAt: now, context: null, ...data })),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'm1', author: 'developer', body: 'b', bodyLang: 'ru', readAt: null, createdAt: now, via: 'admin', context: null, translatedBody: null, translatedLang: null, ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn().mockImplementation(async (ops: unknown[]) => Promise.all(ops)),
    };
    translation = { translate: jest.fn().mockResolvedValue({ detectedLang: 'ru', translation: 'Hi there' }) };
    notifications = { sendToUser: jest.fn().mockResolvedValue(true) };
    gateway = { emitSupportMessage: jest.fn(), emitSupportUnread: jest.fn() };
    supportEmail = { sendUnreadReplyEmail: jest.fn().mockResolvedValue(true) };
    service = new SupportAdminService(prisma, { get: jest.fn() } as never, translation as never, notifications as never, gateway as never, supportEmail as never);
  });

  const flush = () => new Promise((r) => setImmediate(r));

  describe('reply e-mail fallback', () => {
    it('e-mails immediately when the user has no pushToken', async () => {
      prisma.supportThread.findUnique.mockResolvedValue(makeThread({ userUnreadCount: 0, user: { id: 'u1', name: 'Ann', email: 'a@b.c', language: 'en', isActive: true, pushToken: null } }));
      await service.reply('t1', 'Hi', 'telegram');
      await flush();
      expect(supportEmail.sendUnreadReplyEmail).toHaveBeenCalledWith('t1');
    });

    it('does not e-mail immediately when the user has a push token', async () => {
      await service.reply('t1', 'Hi', 'admin');
      await flush();
      expect(supportEmail.sendUnreadReplyEmail).not.toHaveBeenCalled();
    });

    it('does not fail the reply when the e-mail send rejects', async () => {
      prisma.supportThread.findUnique.mockResolvedValue(makeThread({ user: { id: 'u1', name: 'Ann', email: 'a@b.c', language: 'en', isActive: true, pushToken: null } }));
      supportEmail.sendUnreadReplyEmail.mockRejectedValue(new Error('smtp'));
      await expect(service.reply('t1', 'Hi', 'admin')).resolves.toBeDefined();
      await flush();
    });

    it('sets firstUnreadReplyAt inside the transaction only where it is null, regardless of the pre-read count', async () => {
      // Pre-read count > 0 (stale: the user read during translation) but the field is null in the DB.
      prisma.supportThread.findUnique.mockResolvedValue(makeThread({ userUnreadCount: 3 }));
      await service.reply('t1', 'Hi', 'admin');
      expect(prisma.supportThread.updateMany).toHaveBeenCalledWith({
        where: { id: 't1', firstUnreadReplyAt: null },
        data: { firstUnreadReplyAt: expect.any(Date) },
      });
      expect(prisma.supportThread.update.mock.calls[0][0].data).not.toHaveProperty('firstUnreadReplyAt');
    });
  });

  describe('reply', () => {
    it('rejects an inactive user and stores/pushes nothing', async () => {
      prisma.supportThread.findUnique.mockResolvedValue(makeThread({ user: { id: 'u1', language: 'en', isActive: false } }));
      await expect(service.reply('t1', 'Hi', 'admin')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.supportMessage.create).not.toHaveBeenCalled();
      expect(notifications.sendToUser).not.toHaveBeenCalled();
    });

    it('throws NotFound for an unknown thread', async () => {
      prisma.supportThread.findUnique.mockResolvedValue(null);
      await expect(service.reply('x', 'Hi', 'admin')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reopens a closed thread, marks user messages read, pushes with support_reply', async () => {
      prisma.supportThread.findUnique.mockResolvedValue(makeThread({ status: 'closed' }));
      const view = await service.reply('t1', 'Привет', 'admin');
      expect(translation.translate).toHaveBeenCalledWith('Привет', 'en', 'u1');
      expect(prisma.supportMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ threadId: 't1', author: 'developer', via: 'admin', translatedBody: 'Hi there', translatedLang: 'en' }),
      });
      expect(prisma.supportThread.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'open', userUnreadCount: { increment: 1 }, developerUnreadCount: 0 }) }),
      );
      expect(prisma.supportMessage.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { threadId: 't1', author: 'user', readAt: null } }),
      );
      expect(view.author).toBe('developer');
      await flush();
      expect(notifications.sendToUser).toHaveBeenCalledWith('u1', expect.any(Function), expect.any(Function), { threadId: 't1' }, 'support_reply');
      const [, title, body] = notifications.sendToUser.mock.calls[0];
      expect(title('de')).toBe('Antwort vom Entwickler');
      expect(title('xx')).toBe('Reply from the developer');
      expect(body('en')).toBe('Hi there');
      expect(gateway.emitSupportUnread).toHaveBeenCalledWith({ total: 3 });
    });

    it('translates into br for a br user', async () => {
      prisma.supportThread.findUnique.mockResolvedValue(makeThread({ user: { id: 'u1', name: 'A', email: 'e', language: 'br', isActive: true } }));
      await service.reply('t1', 'Oi', 'admin');
      expect(translation.translate).toHaveBeenCalledWith('Oi', 'br', 'u1');
    });

    it('falls back to en for an empty language and truncates the push body to 120 chars', async () => {
      prisma.supportThread.findUnique.mockResolvedValue(makeThread({ user: { id: 'u1', name: 'A', email: 'e', language: '', isActive: true } }));
      translation.translate.mockResolvedValue({ detectedLang: 'ru', translation: null });
      await service.reply('t1', 'x'.repeat(300), 'admin');
      expect(translation.translate).toHaveBeenCalledWith('x'.repeat(300), 'en', 'u1');
      await flush();
      expect(notifications.sendToUser.mock.calls[0][2]('en')).toHaveLength(120);
    });

    it('on a muted thread does not mark user messages read', async () => {
      prisma.supportThread.findUnique.mockResolvedValue(makeThread({ muted: true }));
      await service.reply('t1', 'Hi', 'admin');
      expect(prisma.supportMessage.updateMany).not.toHaveBeenCalled();
      expect(prisma.supportMessage.create).toHaveBeenCalled();
    });
  });

  describe('getThread', () => {
    it('marks user messages read and zeroes the counter', async () => {
      await service.getThread('t1');
      expect(prisma.supportMessage.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { threadId: 't1', author: 'user', readAt: null } }),
      );
      expect(prisma.supportThread.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { developerUnreadCount: 0 } }),
      );
    });

    it('emits the unread total once when the thread had unread messages', async () => {
      await service.getThread('t1');
      await new Promise((r) => setImmediate(r));
      expect(gateway.emitSupportUnread).toHaveBeenCalledTimes(1);
    });

    it('emits nothing when an unmuted thread had no unread messages', async () => {
      prisma.supportThread.findUnique.mockResolvedValue(makeThread({ developerUnreadCount: 0 }));
      await service.getThread('t1');
      await new Promise((r) => setImmediate(r));
      expect(gateway.emitSupportUnread).not.toHaveBeenCalled();
    });

    it('on a muted thread does NOT set readAt', async () => {
      prisma.supportThread.findUnique.mockResolvedValue(makeThread({ muted: true }));
      await service.getThread('t1');
      expect(prisma.supportMessage.updateMany).not.toHaveBeenCalled();
      expect(prisma.supportThread.update).not.toHaveBeenCalled();
    });
  });

  describe('listThreads', () => {
    it('open excludes muted and threads without messages', async () => {
      await service.listThreads('open');
      expect(prisma.supportThread.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { muted: false, status: 'open', messages: { some: {} } } }),
      );
    });
    it('closed excludes muted', async () => {
      await service.listThreads('closed');
      expect(prisma.supportThread.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { muted: false, status: 'closed', messages: { some: {} } } }),
      );
    });
    it('muted includes only muted', async () => {
      await service.listThreads('muted');
      expect(prisma.supportThread.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { muted: true, messages: { some: {} } } }),
      );
    });
    it('orders unread first, then lastMessageAt desc', async () => {
      prisma.supportThread.findMany.mockResolvedValue([
        makeThread({ id: 'a', developerUnreadCount: 0, lastMessageAt: new Date('2026-11-27T12:00:00Z') }),
        makeThread({ id: 'b', developerUnreadCount: 1, lastMessageAt: new Date('2026-11-26T12:00:00Z') }),
      ]);
      const res = await service.listThreads('open');
      expect(res.map((t) => t.id)).toEqual(['b', 'a']);
    });
  });

  it('unreadTotal sums only non-muted threads', async () => {
    expect(await service.unreadTotal()).toBe(3);
    expect(prisma.supportThread.aggregate).toHaveBeenCalledWith({ where: { muted: false }, _sum: { developerUnreadCount: true } });
  });

  it('updateThread throws NotFound for an unknown thread', async () => {
    prisma.supportThread.findUnique.mockResolvedValue(null);
    await expect(service.updateThread('x', { muted: true })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateThread applies status and muted', async () => {
    await service.updateThread('t1', { status: 'closed', muted: true });
    expect(prisma.supportThread.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 't1' }, data: { status: 'closed', muted: true } }));
  });

  it('retranslate stores a new translation toward the user language for a developer message', async () => {
    prisma.supportMessage.findUnique.mockResolvedValue({ id: 'm1', author: 'developer', body: 'Привет', thread: makeThread() });
    await service.retranslate('m1');
    expect(translation.translate).toHaveBeenCalledWith('Привет', 'en', 'u1');
    expect(prisma.supportMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm1' }, data: expect.objectContaining({ translatedBody: 'Hi there', translatedLang: 'en' }) }),
    );
  });
});
