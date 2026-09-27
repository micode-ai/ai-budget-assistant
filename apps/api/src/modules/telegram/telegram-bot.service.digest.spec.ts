import { TelegramBotService } from './telegram-bot.service';
import { DigestUnavailableError } from '../voice-digest/digest-channel.registry';

/**
 * Focused on `sendDigest` only (ABA voice-digest Task 8) — every other
 * `TelegramBotService` behavior (webhook wiring, handler dispatch) already
 * has its own coverage via the handler specs and is untouched by this task.
 * `bot` is a private field with no constructor injection point, so it's set
 * via reflection to a fake Telegraf-shaped object — the same tradeoff the
 * brief's other two senders avoid by mocking at the client-service layer;
 * `TelegramBotService` itself IS that layer for Telegram.
 */
function makeService(bot: { telegram: { sendVoice: jest.Mock; sendMessage: jest.Mock } } | null): TelegramBotService {
  const deps = new Array(10).fill(undefined);
  const service = new (TelegramBotService as any)(...deps) as TelegramBotService;
  (service as any).bot = bot;
  return service;
}

describe('TelegramBotService.sendDigest', () => {
  it('throws DigestUnavailableError when the bot never started', async () => {
    const service = makeService(null);

    await expect(service.sendDigest('chat-1', null, 'hello')).rejects.toBeInstanceOf(DigestUnavailableError);
  });

  it('sends voice then text when audio is present', async () => {
    const sendVoice = jest.fn().mockResolvedValue(undefined);
    const sendMessage = jest.fn().mockResolvedValue(undefined);
    const service = makeService({ telegram: { sendVoice, sendMessage } });
    const audio = Buffer.from('bytes');

    await service.sendDigest('chat-1', audio, 'Weekly digest text');

    expect(sendVoice).toHaveBeenCalledWith('chat-1', { source: audio, filename: 'digest.ogg' });
    expect(sendMessage).toHaveBeenCalledWith('chat-1', 'Weekly digest text');
    // Voice must be attempted before the text follow-up.
    expect(sendVoice.mock.invocationCallOrder[0]).toBeLessThan(sendMessage.mock.invocationCallOrder[0]);
  });

  it('sends only the text when there is no audio', async () => {
    const sendVoice = jest.fn().mockResolvedValue(undefined);
    const sendMessage = jest.fn().mockResolvedValue(undefined);
    const service = makeService({ telegram: { sendVoice, sendMessage } });

    await service.sendDigest('chat-1', null, 'Text-only digest');

    expect(sendVoice).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith('chat-1', 'Text-only digest');
  });
});
