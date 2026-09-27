import { BadRequestException } from '@nestjs/common';
import {
  DigestBlockedError,
  DigestChannelRegistry,
  DigestUnavailableError,
} from '../digest-channel.registry';
import { VoiceDigestService } from '../voice-digest.service';

const NOW = new Date('2026-09-27T12:00:00.000Z');

function makeSender(overrides: Partial<{
  channel: 'telegram' | 'whatsapp' | 'slack';
  isLinked: boolean;
  accountId: string | null;
  send: jest.Mock;
}> = {}) {
  return {
    channel: overrides.channel ?? 'telegram',
    isLinked: jest.fn().mockResolvedValue(overrides.isLinked ?? true),
    accountIdFor: jest.fn().mockResolvedValue(overrides.accountId === undefined ? 'acc-1' : overrides.accountId),
    send: overrides.send ?? jest.fn().mockResolvedValue('sent'),
  };
}

function make(o: {
  user?: any;
  account?: any;
  sender?: ReturnType<typeof makeSender> | null;
  registerChannels?: ('telegram' | 'whatsapp' | 'slack')[];
  gatherImpl?: () => Promise<any>;
  factsOverride?: any;
  narrateImpl?: () => Promise<any>;
  synthesizeImpl?: () => Promise<any>;
} = {}) {
  const user = o.user ?? {
    id: 'u1',
    timezone: 'Europe/Warsaw',
    language: 'en',
    currencyCode: 'PLN',
    voiceDigestChannel: 'telegram',
    voiceDigestEnabled: true,
    voiceDigestDay: 1,
    voiceDigestHour: 8,
  };

  const prisma: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue({}),
    },
    account: {
      findUnique: jest.fn().mockResolvedValue(o.account ?? { encryptionTier: 0 }),
    },
  };

  const registry = new DigestChannelRegistry();
  const sender = o.sender === null ? null : o.sender ?? makeSender();
  if (sender) registry.register(sender as any);

  const factsService: any = {
    gather: o.gatherImpl ? jest.fn().mockImplementation(o.gatherImpl) : jest.fn().mockResolvedValue({
      currency: 'PLN',
      weekTotal: 100,
      priorWeekTotals: [100, 100, 100, 100],
      categoryWeek: [],
      categoryUsual: [],
      safeToSpendToday: null,
      daysToIncome: null,
      shieldItem: null,
      restockNames: [],
      realChangePct: null,
    }),
  };

  const narrator: any = {
    narrate: o.narrateImpl
      ? jest.fn().mockImplementation(o.narrateImpl)
      : jest.fn().mockResolvedValue({ text: 'You spent 100 PLN this week.', usedModel: false }),
  };

  const tts: any = {
    synthesize: o.synthesizeImpl ? jest.fn().mockImplementation(o.synthesizeImpl) : jest.fn().mockResolvedValue(null),
  };

  const subscriptions: any = {
    recordAdditionalUsage: jest.fn().mockResolvedValue(undefined),
  };

  const notifications: any = {
    sendToUser: jest.fn().mockResolvedValue(true),
  };

  const service = new VoiceDigestService(
    prisma,
    registry,
    factsService,
    narrator,
    tts,
    subscriptions,
    notifications,
    { get: jest.fn().mockReturnValue(undefined) } as any,
  );

  return { service, prisma, registry, sender, factsService, narrator, tts, subscriptions, notifications };
}

describe('VoiceDigestService.runForUser', () => {
  it('sends the digest, stamps lastSentAt and records usage once', async () => {
    const { service, prisma, subscriptions } = make();
    const outcome = await service.runForUser('u1', { now: NOW });

    expect(outcome).toBe('sent');
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { voiceDigestLastSentAt: NOW } });
    expect(subscriptions.recordAdditionalUsage).toHaveBeenCalledWith('u1', 'voice_digest', 0.5, 'acc-1');
    expect(subscriptions.recordAdditionalUsage).toHaveBeenCalledTimes(1);
  });

  it('records usage on a template result too', async () => {
    const sender = makeSender({ send: jest.fn().mockResolvedValue('template') });
    const { service, subscriptions } = make({ sender });
    const outcome = await service.runForUser('u1', { now: NOW });

    expect(outcome).toBe('template');
    expect(subscriptions.recordAdditionalUsage).toHaveBeenCalledTimes(1);
  });

  it('returns empty and does not send or record usage for an empty week', async () => {
    const { service, prisma, subscriptions, sender } = make({
      gatherImpl: async () => ({
        currency: 'PLN',
        weekTotal: 0,
        priorWeekTotals: [],
        categoryWeek: [],
        categoryUsual: [],
        safeToSpendToday: null,
        daysToIncome: null,
        shieldItem: null,
        restockNames: [],
        realChangePct: null,
      }),
    });

    const outcome = await service.runForUser('u1', { now: NOW });

    expect(outcome).toBe('empty');
    expect(sender!.send).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(subscriptions.recordAdditionalUsage).not.toHaveBeenCalled();
  });

  it('returns no_channel when the user has no channel set', async () => {
    const { service } = make({ user: { id: 'u1', timezone: 'UTC', language: 'en', currencyCode: 'USD', voiceDigestChannel: null } });
    expect(await service.runForUser('u1', { now: NOW })).toBe('no_channel');
  });

  it('returns no_channel when no sender is registered for the channel', async () => {
    const { service } = make({ sender: null });
    expect(await service.runForUser('u1', { now: NOW })).toBe('no_channel');
  });

  it('returns no_channel when the sender reports the user is not linked', async () => {
    const sender = makeSender({ isLinked: false });
    const { service } = make({ sender });
    expect(await service.runForUser('u1', { now: NOW })).toBe('no_channel');
  });

  it('returns no_channel when accountIdFor resolves null', async () => {
    const sender = makeSender({ accountId: null });
    const { service } = make({ sender });
    expect(await service.runForUser('u1', { now: NOW })).toBe('no_channel');
  });

  it('returns encrypted for a tier-2+ account without gathering facts', async () => {
    const { service, factsService } = make({ account: { encryptionTier: 2 } });
    const outcome = await service.runForUser('u1', { now: NOW });

    expect(outcome).toBe('encrypted');
    expect(factsService.gather).not.toHaveBeenCalled();
  });

  it('disables the digest and sends a blocked push on DigestBlockedError, without recording usage', async () => {
    const sender = makeSender({ send: jest.fn().mockRejectedValue(new DigestBlockedError('blocked')) });
    const { service, prisma, notifications, subscriptions } = make({ sender });

    const outcome = await service.runForUser('u1', { now: NOW });

    expect(outcome).toBe('blocked');
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { voiceDigestEnabled: false } });
    expect(subscriptions.recordAdditionalUsage).not.toHaveBeenCalled();

    // Fire-and-forget push: allow the microtask queue to flush.
    await Promise.resolve();
    await Promise.resolve();
    expect(notifications.sendToUser).toHaveBeenCalledTimes(1);
    const [userId, title, body, data, type] = notifications.sendToUser.mock.calls[0];
    expect(userId).toBe('u1');
    expect(typeof title).toBe('function');
    expect(typeof body).toBe('function');
    expect(title('en')).toContain('paused');
    expect(body('en')).toContain('Telegram');
    expect(data).toEqual({ type: 'voice_digest_disabled' });
    expect(type).toBe('voice_digest_disabled');
  });

  it('returns unavailable without changing user state on DigestUnavailableError', async () => {
    const sender = makeSender({ send: jest.fn().mockRejectedValue(new DigestUnavailableError('down')) });
    const { service, prisma, subscriptions } = make({ sender });

    const outcome = await service.runForUser('u1', { now: NOW });

    expect(outcome).toBe('unavailable');
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(subscriptions.recordAdditionalUsage).not.toHaveBeenCalled();
  });

  it('returns failed and never throws when something unexpected blows up', async () => {
    const sender = makeSender({ send: jest.fn().mockRejectedValue(new Error('boom')) });
    const { service } = make({ sender });

    await expect(service.runForUser('u1', { now: NOW })).resolves.toBe('failed');
  });

  it('force still requires a channel', async () => {
    const { service } = make({ sender: null });
    expect(await service.runForUser('u1', { force: true, now: NOW })).toBe('no_channel');
  });
});

describe('VoiceDigestService.getSettings', () => {
  it('lists only linked channels as available, and nulls out an unlinked stored channel', async () => {
    const telegramSender = makeSender({ channel: 'telegram', isLinked: true });
    const whatsappSender = makeSender({ channel: 'whatsapp', isLinked: false });
    const { service, prisma, registry } = make({ sender: telegramSender });
    registry.register(whatsappSender as any);

    prisma.user.findUnique.mockResolvedValue({
      voiceDigestEnabled: true,
      voiceDigestDay: 2,
      voiceDigestHour: 9,
      voiceDigestChannel: 'whatsapp', // stored but no longer linked
    });

    const settings = await service.getSettings('u1');

    expect(settings.availableChannels).toEqual(['telegram']);
    expect(settings.channel).toBeNull();
    expect(settings.enabled).toBe(true);
    expect(settings.day).toBe(2);
    expect(settings.hour).toBe(9);
  });

  it('whatsappAvailable requires both a link and a configured template', async () => {
    const whatsappSender = makeSender({ channel: 'whatsapp', isLinked: true });
    const { service, prisma } = make({ sender: whatsappSender });
    prisma.user.findUnique.mockResolvedValue({
      voiceDigestEnabled: false,
      voiceDigestDay: 1,
      voiceDigestHour: 8,
      voiceDigestChannel: null,
    });

    const withoutTemplate = await service.getSettings('u1');
    expect(withoutTemplate.whatsappAvailable).toBe(false);
  });

  it('whatsappAvailable is true when linked and the template env var is set', async () => {
    const whatsappSender = makeSender({ channel: 'whatsapp', isLinked: true });
    const { service, prisma } = make({ sender: whatsappSender });
    (service as any).config.get = jest.fn().mockReturnValue('vd_template');
    prisma.user.findUnique.mockResolvedValue({
      voiceDigestEnabled: false,
      voiceDigestDay: 1,
      voiceDigestHour: 8,
      voiceDigestChannel: null,
    });

    const settings = await service.getSettings('u1');
    expect(settings.whatsappAvailable).toBe(true);
  });
});

describe('VoiceDigestService.updateSettings', () => {
  it('rejects a day outside 0-6', async () => {
    const { service } = make();
    await expect(service.updateSettings('u1', { day: 7 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a non-integer day', async () => {
    const { service } = make();
    await expect(service.updateSettings('u1', { day: 1.5 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an hour outside 0-23', async () => {
    const { service } = make();
    await expect(service.updateSettings('u1', { hour: 24 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a channel that is not linked', async () => {
    const { service, prisma } = make();
    prisma.user.findUnique.mockResolvedValue({
      voiceDigestEnabled: false,
      voiceDigestDay: 1,
      voiceDigestHour: 8,
      voiceDigestChannel: null,
    });
    await expect(service.updateSettings('u1', { channel: 'slack' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enabling with no channel picks the first available channel', async () => {
    const { service, prisma } = make();
    prisma.user.findUnique
      .mockResolvedValueOnce({ voiceDigestEnabled: false, voiceDigestDay: 1, voiceDigestHour: 8, voiceDigestChannel: null })
      .mockResolvedValueOnce({ voiceDigestEnabled: true, voiceDigestDay: 1, voiceDigestHour: 8, voiceDigestChannel: 'telegram' });

    const settings = await service.updateSettings('u1', { enabled: true });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { voiceDigestChannel: 'telegram', voiceDigestEnabled: true },
    });
    expect(settings.channel).toBe('telegram');
  });

  it('enabling with no available channel at all throws', async () => {
    const { service, prisma } = make({ sender: null });
    prisma.user.findUnique.mockResolvedValue({
      voiceDigestEnabled: false,
      voiceDigestDay: 1,
      voiceDigestHour: 8,
      voiceDigestChannel: null,
    });
    await expect(service.updateSettings('u1', { enabled: true })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates day/hour/channel together when valid', async () => {
    const { service, prisma } = make();
    prisma.user.findUnique
      .mockResolvedValueOnce({ voiceDigestEnabled: true, voiceDigestDay: 1, voiceDigestHour: 8, voiceDigestChannel: 'telegram' })
      .mockResolvedValueOnce({ voiceDigestEnabled: true, voiceDigestDay: 3, voiceDigestHour: 20, voiceDigestChannel: 'telegram' });

    await service.updateSettings('u1', { day: 3, hour: 20 });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { voiceDigestDay: 3, voiceDigestHour: 20 },
    });
  });
});

describe('VoiceDigestService enableFrom/disable', () => {
  it('enableFrom sets enabled true and the given channel', async () => {
    const { service, prisma } = make();
    await service.enableFrom('u1', 'slack');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { voiceDigestEnabled: true, voiceDigestChannel: 'slack' },
    });
  });

  it('disable sets enabled false', async () => {
    const { service, prisma } = make();
    await service.disable('u1');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { voiceDigestEnabled: false },
    });
  });
});
