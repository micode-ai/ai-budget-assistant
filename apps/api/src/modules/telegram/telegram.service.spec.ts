import { TelegramService } from './telegram.service';

function makeService(cfg: Record<string, string | undefined>) {
  const config: any = { get: jest.fn((k: string) => cfg[k]) };
  return { service: new TelegramService(config), config };
}

describe('TelegramService (ops notifier)', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
    global.fetch = fetchMock as any;
  });

  it('skips (no network) and returns false when the ops bot is not configured', async () => {
    const { service } = makeService({});
    expect(await service.sendMessage('hello')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to the OPS bot token + OPS chat id, never the assistant TELEGRAM_* vars', async () => {
    const { service, config } = makeService({
      OPS_TELEGRAM_BOT_TOKEN: 'OPS_TOK',
      OPS_TELEGRAM_CHAT_ID: 'OPS_CHAT',
      TELEGRAM_BOT_TOKEN: 'ASSISTANT_TOK',
      TELEGRAM_CHAT_ID: 'ASSISTANT_CHAT',
    });
    expect(await service.sendMessage('hello')).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/botOPS_TOK/sendMessage');
    const body = JSON.parse(init.body);
    expect(body.chat_id).toBe('OPS_CHAT');
    expect(body.text).toBe('hello');
    // Ops must NEVER read the user-facing assistant bot vars.
    expect(config.get).not.toHaveBeenCalledWith('TELEGRAM_BOT_TOKEN');
    expect(config.get).not.toHaveBeenCalledWith('TELEGRAM_CHAT_ID');
  });

  it('prefixes messages with OPS_PROJECT_NAME when set', async () => {
    const { service } = makeService({
      OPS_TELEGRAM_BOT_TOKEN: 'T',
      OPS_TELEGRAM_CHAT_ID: 'C',
      OPS_PROJECT_NAME: 'AI Budget',
    });
    await service.sendMessage('New user');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).text).toBe('<b>[AI Budget]</b> New user');
  });

  it('adds no prefix when OPS_PROJECT_NAME is unset', async () => {
    const { service } = makeService({ OPS_TELEGRAM_BOT_TOKEN: 'T', OPS_TELEGRAM_CHAT_ID: 'C' });
    await service.sendMessage('New user');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).text).toBe('New user');
  });

  it('notifyNewUser funnels through the ops bot and inherits the prefix', async () => {
    const { service } = makeService({
      OPS_TELEGRAM_BOT_TOKEN: 'T',
      OPS_TELEGRAM_CHAT_ID: 'C',
      OPS_PROJECT_NAME: 'AI Budget',
    });
    service.notifyNewUser('Alice', 'a@x.io'); // fire-and-forget
    await new Promise((r) => setImmediate(r));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const text = JSON.parse(fetchMock.mock.calls[0][1].body).text;
    expect(text.startsWith('<b>[AI Budget]</b> ')).toBe(true);
    expect(text).toContain('New user registered');
  });
});
