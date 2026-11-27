import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { SupportService } from './support.service';

const CTX = { appVersion: '1.0.0', platform: 'android' as const, locale: 'en' };

function makeThread(over: Record<string, unknown> = {}) {
  return { id: 't1', userId: 'u1', status: 'open', muted: false, autoTranslate: true, userUnreadCount: 0, developerUnreadCount: 0, ...over };
}

describe('SupportService', () => {
  let prisma: any;
  let cache: { incrementWindow: jest.Mock };
  let translation: { translate: jest.Mock };
  let gateway: { emitSupportMessage: jest.Mock; emitSupportUnread: jest.Mock };
  let forwarder: { forwardUserMessage: jest.Mock };
  let service: SupportService;
  const now = new Date('2026-11-27T10:00:00Z');

  beforeEach(() => {
    prisma = {
      supportThread: {
        upsert: jest.fn().mockResolvedValue(makeThread()),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { developerUnreadCount: 1 } }),
      },
      supportMessage: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'm1', readAt: null, createdAt: now, ...data })),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', name: 'Ann', email: 'a@b.c', language: 'en' }) },
      $transaction: jest.fn().mockImplementation(async (ops: unknown[]) => Promise.all(ops)),
    };
    cache = { incrementWindow: jest.fn().mockResolvedValue(1) };
    translation = { translate: jest.fn().mockResolvedValue({ detectedLang: 'en', translation: 'Привет' }) };
    gateway = { emitSupportMessage: jest.fn(), emitSupportUnread: jest.fn() };
    forwarder = { forwardUserMessage: jest.fn().mockResolvedValue(undefined) };
    const config = { get: jest.fn().mockReturnValue(undefined) };
    service = new SupportService(prisma, cache as never, config as never, translation as never, gateway as never, forwarder as never);
  });

  const flush = () => new Promise((r) => setImmediate(r));

  it('creates an open thread, stores the translation and bumps developerUnreadCount', async () => {
    const view = await service.sendUserMessage('u1', { body: 'Hi', context: CTX });
    expect(prisma.supportThread.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' }, update: { status: 'open' } }),
    );
    expect(translation.translate).toHaveBeenCalledWith('Hi', 'ru', 'u1');
    expect(prisma.supportMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        threadId: 't1', author: 'user', via: 'app', body: 'Hi', bodyLang: 'en', translatedBody: 'Привет', translatedLang: 'ru', context: CTX,
      }),
    });
    expect(prisma.supportThread.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't1' }, data: expect.objectContaining({ developerUnreadCount: { increment: 1 } }) }),
    );
    expect(view).not.toHaveProperty('context');
    expect(view).not.toHaveProperty('via');
    expect(view.createdAt).toBe(now.toISOString());
    await flush();
    expect(forwarder.forwardUserMessage).toHaveBeenCalled();
    expect(gateway.emitSupportMessage).toHaveBeenCalledWith({ threadId: 't1', messageId: 'm1', author: 'user' });
    expect(gateway.emitSupportUnread).toHaveBeenCalledWith({ total: 1 });
    expect(prisma.supportThread.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { muted: false } }));
  });

  it('still stores and forwards when translation fails', async () => {
    translation.translate.mockResolvedValue({ detectedLang: 'und', translation: null });
    const view = await service.sendUserMessage('u1', { body: 'Hi', context: CTX });
    expect(view.translatedBody).toBeNull();
    await flush();
    expect(forwarder.forwardUserMessage).toHaveBeenCalled();
  });

  it('fails closed when the rate limiter throws', async () => {
    cache.incrementWindow.mockRejectedValue(new Error('redis down'));
    await expect(service.sendUserMessage('u1', { body: 'Hi', context: CTX })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.supportMessage.create).not.toHaveBeenCalled();
  });

  it('rejects the 11th message in the window with 429', async () => {
    cache.incrementWindow.mockResolvedValue(11);
    const err = await service.sendUserMessage('u1', { body: 'Hi', context: CTX }).catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(429);
    expect(cache.incrementWindow).toHaveBeenCalledWith('support:send:u1', 24 * 60 * 60 * 1000);
    expect(prisma.supportMessage.create).not.toHaveBeenCalled();
  });

  it('muted thread: stores message, no unread bump, no forward, no emit', async () => {
    prisma.supportThread.upsert.mockResolvedValue(makeThread({ muted: true }));
    const view = await service.sendUserMessage('u1', { body: 'Hi', context: CTX });
    expect(view.id).toBe('m1');
    const data = prisma.supportThread.update.mock.calls[0][0].data;
    expect(data.developerUnreadCount).toBeUndefined();
    await flush();
    expect(forwarder.forwardUserMessage).not.toHaveBeenCalled();
    expect(gateway.emitSupportMessage).not.toHaveBeenCalled();
    expect(gateway.emitSupportUnread).not.toHaveBeenCalled();
  });

  it('reopens a closed thread via the upsert', async () => {
    await service.sendUserMessage('u1', { body: 'Hi', context: CTX });
    expect(prisma.supportThread.upsert.mock.calls[0][0].update).toEqual({ status: 'open' });
    expect(prisma.supportThread.upsert.mock.calls[0][0].create).toEqual(expect.objectContaining({ userId: 'u1', status: 'open' }));
  });

  it('re-fetches on a P2002 upsert race', async () => {
    prisma.supportThread.upsert.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    prisma.supportThread.findUnique.mockResolvedValue(makeThread());
    await service.sendUserMessage('u1', { body: 'Hi', context: CTX });
    expect(prisma.supportThread.findUnique).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(prisma.supportMessage.create).toHaveBeenCalled();
  });

  describe('getThreadForUser', () => {
    it('returns the empty shape without a thread', async () => {
      prisma.supportThread.findUnique.mockResolvedValue(null);
      await expect(service.getThreadForUser('u1')).resolves.toEqual({
        id: null, autoTranslate: true, userUnreadCount: 0, messages: [], hasMore: false,
      });
    });

    it('returns oldest-first views without context/via and flags hasMore', async () => {
      prisma.supportThread.findUnique.mockResolvedValue(makeThread({ userUnreadCount: 2 }));
      const row = (id: string, t: number) => ({
        id, author: 'user', body: 'b', bodyLang: 'en', translatedBody: null, translatedLang: null,
        readAt: null, createdAt: new Date(t), context: CTX, via: 'app',
      });
      // newest-first from the DB, limit + 1 rows
      prisma.supportMessage.findMany.mockResolvedValue([row('c', 3000), row('b', 2000), row('a', 1000)]);
      const view = await service.getThreadForUser('u1', undefined, 2);
      expect(prisma.supportMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3, orderBy: { createdAt: 'desc' } }));
      expect(view.hasMore).toBe(true);
      expect(view.userUnreadCount).toBe(2);
      expect(view.messages.map((m) => m.id)).toEqual(['b', 'c']);
      for (const m of view.messages) {
        expect(m).not.toHaveProperty('context');
        expect(m).not.toHaveProperty('via');
      }
    });
  });

  it('markReadByUser zeroes userUnreadCount', async () => {
    await service.markReadByUser('u1');
    expect(prisma.supportThread.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { userUnreadCount: 0 } });
  });

  it('setAutoTranslate updates the user thread', async () => {
    await service.setAutoTranslate('u1', false);
    expect(prisma.supportThread.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' }, update: { autoTranslate: false } }),
    );
  });
});
