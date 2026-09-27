import { CommandHandler } from './command.handler';
import { t } from '../helpers/i18n';

/**
 * Focused on `/digest on|off|now` (ABA voice-digest Task 10) — mirrors the
 * lightweight direct-instantiation style used by `photo.handler.spec.ts`
 * (mocked deps passed `as never`, no Nest testing module needed).
 */
function makeCtx(overrides: { userState?: any; text?: string } = {}) {
  const userState = Object.prototype.hasOwnProperty.call(overrides, 'userState')
    ? overrides.userState
    : { userId: 'user-1', accountId: 'acc-1', accountRole: 'viewer', language: 'en', telegramUserId: 'tg-1' };
  return {
    userState,
    message: { text: overrides.text ?? '/digest' },
    reply: jest.fn().mockResolvedValue(undefined),
  };
}

function makeVoiceDigestService(overrides: Partial<{
  enableFrom: jest.Mock;
  disable: jest.Mock;
  getSettings: jest.Mock;
  runForUser: jest.Mock;
}> = {}) {
  return {
    enableFrom: overrides.enableFrom ?? jest.fn().mockResolvedValue(undefined),
    disable: overrides.disable ?? jest.fn().mockResolvedValue(undefined),
    getSettings:
      overrides.getSettings ??
      jest.fn().mockResolvedValue({
        enabled: true,
        day: 1,
        hour: 8,
        channel: 'telegram',
        availableChannels: ['telegram'],
        whatsappAvailable: false,
      }),
    runForUser: overrides.runForUser ?? jest.fn().mockResolvedValue('sent'),
  };
}

function makeCache(overrides: Partial<{ setIfAbsent: jest.Mock }> = {}) {
  return { setIfAbsent: overrides.setIfAbsent ?? jest.fn().mockResolvedValue(true) };
}

function makeHandler(
  voiceDigestService: ReturnType<typeof makeVoiceDigestService> = makeVoiceDigestService(),
  cache: ReturnType<typeof makeCache> = makeCache(),
) {
  return {
    handler: new CommandHandler({} as never, {} as never, {} as never, voiceDigestService as never, cache as never),
    voiceDigestService,
    cache,
  };
}

describe('Telegram CommandHandler.handleDigest', () => {
  it('replies linkFirst when the telegram user has no linked account', async () => {
    const { handler } = makeHandler();
    const ctx = makeCtx({ userState: undefined, text: '/digest on' });

    await handler.handleDigest(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t('linkFirst', undefined), { parse_mode: 'HTML' });
  });

  it('digest on enables the digest for the telegram channel and reports the schedule', async () => {
    const { handler, voiceDigestService } = makeHandler();
    const ctx = makeCtx({ text: '/digest on' });

    await handler.handleDigest(ctx as never);

    expect(voiceDigestService.enableFrom).toHaveBeenCalledWith('user-1', 'telegram');
    expect(ctx.reply).toHaveBeenCalledWith(
      t('digestOn', 'en', { day: t('weekday1', 'en'), hour: '08:00' }),
      { parse_mode: 'HTML' },
    );
  });

  it('digest off disables the digest', async () => {
    const { handler, voiceDigestService } = makeHandler();
    const ctx = makeCtx({ text: '/digest off' });

    await handler.handleDigest(ctx as never);

    expect(voiceDigestService.disable).toHaveBeenCalledWith('user-1');
    expect(ctx.reply).toHaveBeenCalledWith(t('digestOff', 'en'), { parse_mode: 'HTML' });
  });

  it('digest now replies digestNowLimit and never calls runForUser when the 24h throttle is already taken', async () => {
    const cache = makeCache({ setIfAbsent: jest.fn().mockResolvedValue(false) });
    const { handler, voiceDigestService } = makeHandler(makeVoiceDigestService(), cache);
    const ctx = makeCtx({ text: '/digest now' });

    await handler.handleDigest(ctx as never);

    expect(cache.setIfAbsent).toHaveBeenCalledWith('vd:now:user-1', 86400);
    expect(ctx.reply).toHaveBeenCalledWith(t('digestNowLimit', 'en'), { parse_mode: 'HTML' });
    expect(voiceDigestService.runForUser).not.toHaveBeenCalled();
  });

  it('digest now replies digestPreparing immediately, without waiting on the background run', async () => {
    let resolveRun: (v: string) => void = () => {};
    const runForUser = jest.fn().mockImplementation(
      () => new Promise((resolve) => { resolveRun = resolve; }),
    );
    const { handler, cache } = makeHandler(makeVoiceDigestService({ runForUser }));
    const ctx = makeCtx({ text: '/digest now' });

    await handler.handleDigest(ctx as never);

    expect(cache.setIfAbsent).toHaveBeenCalledWith('vd:now:user-1', 86400);
    expect(ctx.reply).toHaveBeenCalledWith(t('digestPreparing', 'en'), { parse_mode: 'HTML' });
    expect(runForUser).toHaveBeenCalledWith('user-1', { force: true, channel: 'telegram', preview: true });
    // The background run has not resolved yet — no second reply.
    expect(ctx.reply).toHaveBeenCalledTimes(1);

    resolveRun('sent');
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.reply).toHaveBeenCalledTimes(1);
  });

  it.each(['unavailable', 'no_channel', 'failed', 'encrypted'])(
    'digest now background run reports digestUnavailable for outcome %s',
    async (outcome) => {
      const runForUser = jest.fn().mockResolvedValue(outcome);
      const { handler } = makeHandler(makeVoiceDigestService({ runForUser }));
      const ctx = makeCtx({ text: '/digest now' });

      await handler.handleDigest(ctx as never);
      await Promise.resolve();
      await Promise.resolve();

      expect(ctx.reply).toHaveBeenCalledWith(t('digestUnavailable', 'en'), { parse_mode: 'HTML' });
    },
  );

  it('digest now background run reports digestEmpty for the empty outcome', async () => {
    const runForUser = jest.fn().mockResolvedValue('empty');
    const { handler } = makeHandler(makeVoiceDigestService({ runForUser }));
    const ctx = makeCtx({ text: '/digest now' });

    await handler.handleDigest(ctx as never);
    await Promise.resolve();
    await Promise.resolve();

    expect(ctx.reply).toHaveBeenCalledWith(t('digestEmpty', 'en'), { parse_mode: 'HTML' });
  });

  it.each(['sent', 'template', 'blocked'])(
    'digest now background run stays silent for outcome %s',
    async (outcome) => {
      const runForUser = jest.fn().mockResolvedValue(outcome);
      const { handler } = makeHandler(makeVoiceDigestService({ runForUser }));
      const ctx = makeCtx({ text: '/digest now' });

      await handler.handleDigest(ctx as never);
      await Promise.resolve();
      await Promise.resolve();

      // Only the digestPreparing reply — no follow-up.
      expect(ctx.reply).toHaveBeenCalledTimes(1);
    },
  );
});

describe('Telegram CommandHandler.handleLink — digestOffer', () => {
  it('appends the digestOffer line (with the /digest on command) to the link-success reply', async () => {
    const linkService = { redeemCode: jest.fn().mockResolvedValue({ success: true }) };
    const prisma = {
      telegramLink: {
        findUnique: jest.fn().mockResolvedValue({ user: { language: 'en' } }),
      },
    };
    const handler = new CommandHandler(
      linkService as never,
      prisma as never,
      {} as never,
      makeVoiceDigestService() as never,
      makeCache() as never,
    );
    const ctx = {
      userState: undefined,
      message: { text: '/link ABC123' },
      from: { id: 123, username: 'tester' },
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await handler.handleLink(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(
      `${t('linkSuccess', 'en')}\n\n${t('digestOffer', 'en', { command: '/digest on' })}`,
      { parse_mode: 'HTML' },
    );
  });
});
