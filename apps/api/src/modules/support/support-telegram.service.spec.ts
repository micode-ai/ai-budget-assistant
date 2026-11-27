import { ConflictException } from '@nestjs/common';
import { SupportTelegramService } from './support-telegram.service';

const ENV: Record<string, string> = {
  SUPPORT_TELEGRAM_BOT_TOKEN: 'tok',
  SUPPORT_TELEGRAM_CHAT_ID: '555',
  SUPPORT_TELEGRAM_WEBHOOK_URL: 'https://api.example.com',
  SUPPORT_TELEGRAM_WEBHOOK_SECRET: 'sekret',
};

const ctx = { appVersion: '1.2.3', platform: 'android', osVersion: '14', locale: 'pl', tier: 'pro', fromRoute: '/settings' };

describe('SupportTelegramService', () => {
  let fetchMock: jest.Mock;
  let prisma: { supportMessage: { findUnique: jest.Mock; update: jest.Mock } };
  let admin: { reply: jest.Mock };
  const make = (env: Record<string, string> = ENV) =>
    new SupportTelegramService({ get: (k: string) => env[k] } as never, prisma as never, admin as never);
  const sent = () => fetchMock.mock.calls.map((c) => ({ url: c[0] as string, body: JSON.parse(c[1].body) }));
  const update = (over: Record<string, unknown> = {}, chatId = 555) => ({
    message: { message_id: 9, chat: { id: chatId }, text: 'hello', reply_to_message: { message_id: 100 }, ...over },
  });

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: { message_id: 321 } }) });
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
    prisma = {
      supportMessage: {
        findUnique: jest.fn().mockResolvedValue({ threadId: 't1', thread: { muted: false, user: { name: 'Ann' } } }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    admin = { reply: jest.fn().mockResolvedValue({ translatedBody: 'Cześć', translatedLang: 'pl' }) };
  });

  it('ignores a foreign chat', async () => {
    await make().handleUpdate(update({}, 1));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(admin.reply).not.toHaveBeenCalled();
  });

  it('refuses text without reply_to_message', async () => {
    await make().handleUpdate(update({ reply_to_message: undefined }));
    expect(admin.reply).not.toHaveBeenCalled();
    expect(sent()[0].body.text).toContain('Ответьте реплаем на карточку');
  });

  it('refuses a reply to an unknown message', async () => {
    prisma.supportMessage.findUnique.mockResolvedValue(null);
    await make().handleUpdate(update());
    expect(admin.reply).not.toHaveBeenCalled();
    expect(sent()[0].body.text).toContain('Карточка не найдена');
    expect(sent()[0].body.text).not.toContain('Ответьте реплаем');
  });

  it('refuses a reply longer than 4000 chars without truncating', async () => {
    await make().handleUpdate(update({ text: 'x'.repeat(4001) }));
    expect(admin.reply).not.toHaveBeenCalled();
    expect(sent()[0].body.text).toContain('Ответ длиннее 4000 символов');
  });

  it('accepts a reply of exactly 4000 chars', async () => {
    await make().handleUpdate(update({ text: 'x'.repeat(4000) }));
    expect(admin.reply).toHaveBeenCalledWith('t1', 'x'.repeat(4000), 'telegram');
  });

  it('registers a random secret_token when none is configured, and verifySecret accepts it', async () => {
    const { SUPPORT_TELEGRAM_WEBHOOK_SECRET: _omit, ...env } = ENV;
    const svc = make(env);
    await svc.onModuleInit();
    const call = sent().find((c) => c.url.endsWith('/setWebhook'));
    const token = call?.body.secret_token as string;
    expect(token).toEqual(expect.any(String));
    expect(token.length).toBeGreaterThan(0);
    expect(svc.verifySecret(token)).toBe(true);
    expect(svc.verifySecret('other')).toBe(false);
    expect(svc.verifySecret(undefined)).toBe(false);
  });

  it('refuses non-text messages', async () => {
    await make().handleUpdate(update({ text: undefined }));
    expect(admin.reply).not.toHaveBeenCalled();
    expect(sent()[0].body.text).toContain('Ответьте реплаем на карточку');
  });

  it('delivers a reply to a known card', async () => {
    await make().handleUpdate(update());
    expect(prisma.supportMessage.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { telegramMessageId: BigInt(100) } }),
    );
    expect(admin.reply).toHaveBeenCalledWith('t1', 'hello', 'telegram');
    expect(sent()[0].body.text).toBe('✓ Отправлено Ann · pl: Cześć');
  });

  it('confirms without translation', async () => {
    admin.reply.mockResolvedValue({ translatedBody: null, translatedLang: null });
    await make().handleUpdate(update());
    expect(sent()[0].body.text).toBe('✓ Отправлено Ann (без перевода)');
  });

  it('does not deliver to a muted thread', async () => {
    prisma.supportMessage.findUnique.mockResolvedValue({ threadId: 't1', thread: { muted: true, user: { name: 'Ann' } } });
    await make().handleUpdate(update());
    expect(admin.reply).not.toHaveBeenCalled();
    expect(sent()[0].body.text).toContain('Пользователь заглушён');
  });

  it('reports an inactive user', async () => {
    admin.reply.mockRejectedValue(new ConflictException('user_inactive'));
    await make().handleUpdate(update());
    expect(sent()[0].body.text).toContain('Пользователь удалил аккаунт');
  });

  describe('forwardUserMessage', () => {
    const base = { id: 'm1', body: 'Hi <b>', bodyLang: 'pl', translatedBody: null, context: ctx };
    const thread = { id: 't1' };
    const user = { id: 'u1', name: 'A&B' };

    it('sends a card without original section when untranslated, and stores the id', async () => {
      await make().forwardUserMessage(base as never, thread as never, user as never);
      const text = sent()[0].body.text as string;
      expect(sent()[0].url).toContain('/bottok/sendMessage');
      expect(sent()[0].body.parse_mode).toBe('HTML');
      expect(text).toContain('<b>A&amp;B</b> (u1) · pl');
      expect(text).toContain('Hi &lt;b&gt;');
      expect(text).not.toContain('original');
      expect(text).toContain('1.2.3 · android 14 · pl · pro · /settings');
      expect(text).toContain('https://admin.ai-budget.pl/support?thread=t1');
      expect(prisma.supportMessage.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { telegramMessageId: BigInt(321) },
      });
    });

    it('includes both translation and original', async () => {
      await make().forwardUserMessage({ ...base, translatedBody: 'Привет' } as never, thread as never, user as never);
      const text = sent()[0].body.text as string;
      expect(text).toContain('Привет');
      expect(text).toContain('— original (pl):');
      expect(text).toContain('Hi &lt;b&gt;');
    });

    it('omits missing context parts', async () => {
      const c = { appVersion: '1', platform: 'web', locale: 'en' };
      await make().forwardUserMessage({ ...base, context: c } as never, thread as never, user as never);
      const text = sent()[0].body.text as string;
      expect(text).not.toContain('undefined');
      expect(text).toContain('1 · web · en');
    });

    it('keeps a huge card under 4096 chars without cutting an entity', async () => {
      const big = '<'.repeat(4000);
      await make().forwardUserMessage({ ...base, body: big, translatedBody: big } as never, thread as never, user as never);
      const text = sent()[0].body.text as string;
      expect(text.length).toBeLessThanOrEqual(4096);
      expect(text).not.toMatch(/&[a-z#0-9]{0,5}(?![a-z#0-9;])/);
    });

    it('skips fetch when no token is configured', async () => {
      await expect(make({}).forwardUserMessage(base as never, thread as never, user as never)).resolves.toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('verifySecret', () => {
    it('accepts only the exact secret', () => {
      const s = make();
      expect(s.verifySecret('sekret')).toBe(true);
      expect(s.verifySecret(undefined)).toBe(false);
      expect(s.verifySecret('wrong!')).toBe(false);
      expect(s.verifySecret('short')).toBe(false);
    });
  });

  describe('onModuleInit', () => {
    it('registers the webhook when configured', async () => {
      await make().onModuleInit();
      expect(sent()[0].url).toContain('/bottok/setWebhook');
      expect(sent()[0].body).toMatchObject({
        url: 'https://api.example.com/support-telegram/webhook',
        secret_token: 'sekret',
      });
    });
    it('does nothing without token/url, and never throws', async () => {
      await make({}).onModuleInit();
      expect(fetchMock).not.toHaveBeenCalled();
      fetchMock.mockRejectedValue(new Error('net'));
      await expect(make().onModuleInit()).resolves.toBeUndefined();
    });
  });
});
