import { TelegramError } from 'telegraf';
import { TelegramDigestSender } from './telegram-digest.sender';
import { DigestBlockedError, DigestChannelRegistry, DigestUnavailableError } from '../../voice-digest/digest-channel.registry';

function makeBotService(impl?: (chatId: string, audio: Buffer | null, text: string) => Promise<void>) {
  return { sendDigest: jest.fn(impl ?? (() => Promise.resolve())) };
}

function makeLinkService(link: { telegramUserId: string; defaultAccountId: string } | null) {
  return { getLinkByUserId: jest.fn().mockResolvedValue(link) };
}

describe('TelegramDigestSender', () => {
  it('registers itself on the channel registry on module init', () => {
    const registry = new DigestChannelRegistry();
    const sender = new TelegramDigestSender(registry, makeBotService() as any, makeLinkService(null) as any);

    sender.onModuleInit();

    expect(registry.get('telegram')).toBe(sender);
  });

  it('sends the voice then the text and resolves "sent"', async () => {
    const registry = new DigestChannelRegistry();
    const botService = makeBotService();
    const linkService = makeLinkService({ telegramUserId: 'tg-1', defaultAccountId: 'acc-1' });
    const sender = new TelegramDigestSender(registry, botService as any, linkService as any);
    const audio = Buffer.from('voice-bytes');

    const result = await sender.send({ userId: 'user-1', lang: 'en', text: 'Weekly digest', audio });

    expect(result).toBe('sent');
    expect(botService.sendDigest).toHaveBeenCalledWith('tg-1', audio, 'Weekly digest');
  });

  it('maps a Telegraf 403 (blocked) error to DigestBlockedError', async () => {
    const registry = new DigestChannelRegistry();
    const blockedError = new TelegramError({ error_code: 403, description: 'Forbidden: bot was blocked by the user' });
    const botService = makeBotService(() => Promise.reject(blockedError));
    const linkService = makeLinkService({ telegramUserId: 'tg-1', defaultAccountId: 'acc-1' });
    const sender = new TelegramDigestSender(registry, botService as any, linkService as any);

    await expect(sender.send({ userId: 'user-1', lang: 'en', text: 'hi', audio: null })).rejects.toBeInstanceOf(
      DigestBlockedError,
    );
  });

  it('throws DigestUnavailableError when the user has no Telegram link', async () => {
    const registry = new DigestChannelRegistry();
    const sender = new TelegramDigestSender(registry, makeBotService() as any, makeLinkService(null) as any);

    await expect(sender.send({ userId: 'user-1', lang: 'en', text: 'hi', audio: null })).rejects.toBeInstanceOf(
      DigestUnavailableError,
    );
  });

  it('propagates a non-blocked, non-unavailable error unchanged', async () => {
    const registry = new DigestChannelRegistry();
    const boom = new Error('network blip');
    const botService = makeBotService(() => Promise.reject(boom));
    const linkService = makeLinkService({ telegramUserId: 'tg-1', defaultAccountId: 'acc-1' });
    const sender = new TelegramDigestSender(registry, botService as any, linkService as any);

    await expect(sender.send({ userId: 'user-1', lang: 'en', text: 'hi', audio: null })).rejects.toBe(boom);
  });

  it('isLinked/accountIdFor reflect the link service', async () => {
    const registry = new DigestChannelRegistry();
    const linkService = makeLinkService({ telegramUserId: 'tg-1', defaultAccountId: 'acc-1' });
    const sender = new TelegramDigestSender(registry, makeBotService() as any, linkService as any);

    await expect(sender.isLinked('user-1')).resolves.toBe(true);
    await expect(sender.accountIdFor('user-1')).resolves.toBe('acc-1');
  });
});
