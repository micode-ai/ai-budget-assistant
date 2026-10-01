import { TelegramBotService } from './telegram-bot.service';

// The webhook endpoint is public; this check is the only thing standing between
// it and a forged update that impersonates a linked user.
function serviceWithSecret(secret: string | null): TelegramBotService {
  const svc = Object.create(TelegramBotService.prototype) as TelegramBotService;
  (svc as unknown as { webhookSecret: string | null }).webhookSecret = secret;
  return svc;
}

describe('TelegramBotService.verifyWebhookSecret', () => {
  it('accepts only the exact secret in webhook mode', () => {
    const svc = serviceWithSecret('s3cret-token');
    expect(svc.verifyWebhookSecret('s3cret-token')).toBe(true);
    expect(svc.verifyWebhookSecret('s3cret-tokeN')).toBe(false);
    expect(svc.verifyWebhookSecret('short')).toBe(false);
    expect(svc.verifyWebhookSecret(undefined)).toBe(false);
  });

  it('rejects everything in long-polling mode, where Telegram never calls the webhook', () => {
    const svc = serviceWithSecret(null);
    expect(svc.verifyWebhookSecret(undefined)).toBe(false);
    expect(svc.verifyWebhookSecret('anything')).toBe(false);
  });
});
