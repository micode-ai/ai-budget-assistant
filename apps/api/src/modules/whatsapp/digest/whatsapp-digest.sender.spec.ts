import { WhatsAppDigestSender } from './whatsapp-digest.sender';
import { WhatsAppGraphError } from '../whatsapp-client.service';
import { DigestBlockedError, DigestChannelRegistry, DigestUnavailableError } from '../../voice-digest/digest-channel.registry';

interface FakeLink {
  waPhoneNumber: string;
  defaultAccountId: string;
  lastInboundAt: Date | null;
}

function makeClient() {
  return {
    isConfigured: jest.fn().mockReturnValue(true),
    uploadMedia: jest.fn().mockResolvedValue('media-1'),
    sendAudio: jest.fn().mockResolvedValue('wamid.audio'),
    sendText: jest.fn().mockResolvedValue('wamid.text'),
    sendTemplate: jest.fn().mockResolvedValue('wamid.template'),
  };
}

function makeLinkService(link: FakeLink | null) {
  return { getLinkByUserId: jest.fn().mockResolvedValue(link) };
}

function makeConfig(templateName: string | undefined) {
  return { get: jest.fn().mockReturnValue(templateName) };
}

/**
 * In-memory stand-in for the WA_REDIS ioredis client.
 *
 * `get`/`del` are deliberately two SEPARATE round trips (as real GET/DEL
 * would be) so a concurrency test built on them can reproduce the
 * non-atomic get-then-del race the old implementation had. `getdel` is a
 * single call whose read+delete happen synchronously within one microtask
 * step, mirroring how a real Redis GETDEL is a single atomic server-side
 * command — with two concurrent callers, only one can observe a non-null
 * value.
 */
function makeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    set: jest.fn(async (key: string, value: string, ..._rest: unknown[]) => {
      store.set(key, value);
      return 'OK';
    }),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    del: jest.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    getdel: jest.fn(async (key: string) => {
      const value = store.get(key) ?? null;
      store.delete(key);
      return value;
    }),
  };
}

const RECENT = new Date(Date.now() - 60 * 60 * 1000); // 1h ago — inside the window
const STALE = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25h ago — outside the window

describe('WhatsAppDigestSender', () => {
  it('registers itself on the channel registry on module init', () => {
    const registry = new DigestChannelRegistry();
    const sender = new WhatsAppDigestSender(
      registry,
      makeClient() as any,
      makeLinkService(null) as any,
      makeConfig(undefined) as any,
      makeRedis() as any,
    );

    sender.onModuleInit();

    expect(registry.get('whatsapp')).toBe(sender);
  });

  it('inside the 23h window: uploads media, sends audio then text, no template, resolves "sent"', async () => {
    const client = makeClient();
    const linkService = makeLinkService({ waPhoneNumber: '48500000000', defaultAccountId: 'acc-1', lastInboundAt: RECENT });
    const sender = new WhatsAppDigestSender(
      new DigestChannelRegistry(),
      client as any,
      linkService as any,
      makeConfig('voice_digest_ready') as any,
      makeRedis() as any,
    );
    const audio = Buffer.from('voice-bytes');

    const result = await sender.send({ userId: 'user-1', lang: 'en', text: 'Weekly digest', audio });

    expect(result).toBe('sent');
    expect(client.uploadMedia).toHaveBeenCalledWith(audio, 'audio/ogg', 'digest.ogg');
    expect(client.sendAudio).toHaveBeenCalledWith('48500000000', 'media-1');
    expect(client.sendText).toHaveBeenCalledWith('48500000000', 'Weekly digest');
    expect(client.sendTemplate).not.toHaveBeenCalled();
  });

  it('outside the window: stores the pending digest in Redis and sends the template with payload vd--listen and language uk for ua', async () => {
    const client = makeClient();
    const redis = makeRedis();
    const linkService = makeLinkService({ waPhoneNumber: '48500000000', defaultAccountId: 'acc-1', lastInboundAt: STALE });
    const sender = new WhatsAppDigestSender(
      new DigestChannelRegistry(),
      client as any,
      linkService as any,
      makeConfig('voice_digest_ready') as any,
      redis as any,
    );
    const audio = Buffer.from('voice-bytes');

    const result = await sender.send({ userId: 'user-1', lang: 'ua', text: 'Weekly digest', audio });

    expect(result).toBe('template');
    expect(client.sendText).not.toHaveBeenCalled();
    expect(client.sendTemplate).toHaveBeenCalledWith('48500000000', 'voice_digest_ready', 'uk', 'vd--listen');
    const stored = JSON.parse(redis.store.get('wa:vd:user-1')!);
    expect(stored).toEqual({ text: 'Weekly digest', audioB64: audio.toString('base64') });
    expect(redis.set).toHaveBeenCalledWith('wa:vd:user-1', expect.any(String), 'EX', 172800);
  });

  it('outside the window with no template configured: throws DigestUnavailableError', async () => {
    const client = makeClient();
    const linkService = makeLinkService({ waPhoneNumber: '48500000000', defaultAccountId: 'acc-1', lastInboundAt: STALE });
    const sender = new WhatsAppDigestSender(
      new DigestChannelRegistry(),
      client as any,
      linkService as any,
      makeConfig(undefined) as any,
      makeRedis() as any,
    );

    await expect(sender.send({ userId: 'user-1', lang: 'en', text: 'hi', audio: null })).rejects.toBeInstanceOf(
      DigestUnavailableError,
    );
    expect(client.sendTemplate).not.toHaveBeenCalled();
  });

  it('a 131047 direct-send failure inside the window falls back to the template path', async () => {
    const client = makeClient();
    client.sendText.mockRejectedValueOnce(new WhatsAppGraphError('WhatsApp send failed: 400', 400, 131047));
    const redis = makeRedis();
    const linkService = makeLinkService({ waPhoneNumber: '48500000000', defaultAccountId: 'acc-1', lastInboundAt: RECENT });
    const sender = new WhatsAppDigestSender(
      new DigestChannelRegistry(),
      client as any,
      linkService as any,
      makeConfig('voice_digest_ready') as any,
      redis as any,
    );

    const result = await sender.send({ userId: 'user-1', lang: 'en', text: 'hi', audio: null });

    expect(result).toBe('template');
    expect(client.sendTemplate).toHaveBeenCalledWith('48500000000', 'voice_digest_ready', 'en', 'vd--listen');
  });

  it('a 131026 failure maps to DigestBlockedError', async () => {
    const client = makeClient();
    client.sendText.mockRejectedValueOnce(new WhatsAppGraphError('WhatsApp send failed: 400', 400, 131026));
    const linkService = makeLinkService({ waPhoneNumber: '48500000000', defaultAccountId: 'acc-1', lastInboundAt: RECENT });
    const sender = new WhatsAppDigestSender(
      new DigestChannelRegistry(),
      client as any,
      linkService as any,
      makeConfig('voice_digest_ready') as any,
      makeRedis() as any,
    );

    await expect(sender.send({ userId: 'user-1', lang: 'en', text: 'hi', audio: null })).rejects.toBeInstanceOf(
      DigestBlockedError,
    );
  });

  it('a 131026 failure on the template send (outside window) also maps to DigestBlockedError', async () => {
    const client = makeClient();
    client.sendTemplate.mockRejectedValueOnce(new WhatsAppGraphError('WhatsApp send failed: 400', 400, 131026));
    const linkService = makeLinkService({ waPhoneNumber: '48500000000', defaultAccountId: 'acc-1', lastInboundAt: STALE });
    const sender = new WhatsAppDigestSender(
      new DigestChannelRegistry(),
      client as any,
      linkService as any,
      makeConfig('voice_digest_ready') as any,
      makeRedis() as any,
    );

    await expect(sender.send({ userId: 'user-1', lang: 'en', text: 'hi', audio: null })).rejects.toBeInstanceOf(
      DigestBlockedError,
    );
  });

  it('deliverPending sends once from the stored payload and then returns false', async () => {
    const client = makeClient();
    const redis = makeRedis();
    await redis.set('wa:vd:user-1', JSON.stringify({ text: 'Weekly digest', audioB64: Buffer.from('voice').toString('base64') }), 'EX', 172800);
    const linkService = makeLinkService({ waPhoneNumber: '48500000000', defaultAccountId: 'acc-1', lastInboundAt: null });
    const sender = new WhatsAppDigestSender(
      new DigestChannelRegistry(),
      client as any,
      linkService as any,
      makeConfig('voice_digest_ready') as any,
      redis as any,
    );

    const first = await sender.deliverPending('user-1');
    expect(first).toBe(true);
    expect(client.sendAudio).toHaveBeenCalledWith('48500000000', 'media-1');
    expect(client.sendText).toHaveBeenCalledWith('48500000000', 'Weekly digest');

    const second = await sender.deliverPending('user-1');
    expect(second).toBe(false);
  });

  it('throws DigestUnavailableError when the user has no WhatsApp link', async () => {
    const sender = new WhatsAppDigestSender(
      new DigestChannelRegistry(),
      makeClient() as any,
      makeLinkService(null) as any,
      makeConfig('voice_digest_ready') as any,
      makeRedis() as any,
    );

    await expect(sender.send({ userId: 'user-1', lang: 'en', text: 'hi', audio: null })).rejects.toBeInstanceOf(
      DigestUnavailableError,
    );
  });

  it('deliverPending is single-delivery under concurrency (two simultaneous "Listen" taps)', async () => {
    const client = makeClient();
    const redis = makeRedis();
    await redis.set(
      'wa:vd:user-1',
      JSON.stringify({ text: 'Weekly digest', audioB64: Buffer.from('voice').toString('base64') }),
      'EX',
      172800,
    );
    const linkService = makeLinkService({ waPhoneNumber: '48500000000', defaultAccountId: 'acc-1', lastInboundAt: null });
    const sender = new WhatsAppDigestSender(
      new DigestChannelRegistry(),
      client as any,
      linkService as any,
      makeConfig('voice_digest_ready') as any,
      redis as any,
    );

    const [first, second] = await Promise.all([sender.deliverPending('user-1'), sender.deliverPending('user-1')]);

    // Exactly one of the two concurrent calls delivered; the other found the
    // entry already taken.
    expect([first, second].sort()).toEqual([false, true]);
    expect(client.sendText).toHaveBeenCalledTimes(1);
    expect(client.sendAudio).toHaveBeenCalledTimes(1);
  });

  it('deliverPending restores the pending entry and rethrows when delivery fails after the entry was taken', async () => {
    const client = makeClient();
    const boom = new Error('network blip');
    client.sendText.mockRejectedValueOnce(boom);
    const redis = makeRedis();
    const payload = { text: 'Weekly digest', audioB64: null };
    await redis.set('wa:vd:user-1', JSON.stringify(payload), 'EX', 172800);
    const linkService = makeLinkService({ waPhoneNumber: '48500000000', defaultAccountId: 'acc-1', lastInboundAt: null });
    const sender = new WhatsAppDigestSender(
      new DigestChannelRegistry(),
      client as any,
      linkService as any,
      makeConfig('voice_digest_ready') as any,
      redis as any,
    );

    await expect(sender.deliverPending('user-1')).rejects.toBe(boom);

    // Restored so a retry (another "Listen" tap) can still deliver it.
    expect(redis.store.get('wa:vd:user-1')).toBe(JSON.stringify(payload));
    expect(redis.set).toHaveBeenLastCalledWith('wa:vd:user-1', JSON.stringify(payload), 'EX', 172800);

    client.sendText.mockResolvedValueOnce(undefined);
    await expect(sender.deliverPending('user-1')).resolves.toBe(true);
  });

  it('send(): an unconfigured WhatsApp client throws DigestUnavailableError before any Redis write or send', async () => {
    const client = makeClient();
    client.isConfigured.mockReturnValue(false);
    const redis = makeRedis();
    const linkService = makeLinkService({ waPhoneNumber: '48500000000', defaultAccountId: 'acc-1', lastInboundAt: RECENT });
    const sender = new WhatsAppDigestSender(
      new DigestChannelRegistry(),
      client as any,
      linkService as any,
      makeConfig('voice_digest_ready') as any,
      redis as any,
    );

    await expect(sender.send({ userId: 'user-1', lang: 'en', text: 'hi', audio: null })).rejects.toBeInstanceOf(
      DigestUnavailableError,
    );
    expect(redis.set).not.toHaveBeenCalled();
    expect(client.sendText).not.toHaveBeenCalled();
    expect(client.sendTemplate).not.toHaveBeenCalled();
    expect(client.uploadMedia).not.toHaveBeenCalled();
  });

  it('deliverPending(): an unconfigured WhatsApp client throws DigestUnavailableError before any Redis read/write or send', async () => {
    const client = makeClient();
    client.isConfigured.mockReturnValue(false);
    const redis = makeRedis();
    await redis.set('wa:vd:user-1', JSON.stringify({ text: 'hi', audioB64: null }), 'EX', 172800);
    const linkService = makeLinkService({ waPhoneNumber: '48500000000', defaultAccountId: 'acc-1', lastInboundAt: null });
    const sender = new WhatsAppDigestSender(
      new DigestChannelRegistry(),
      client as any,
      linkService as any,
      makeConfig('voice_digest_ready') as any,
      redis as any,
    );

    await expect(sender.deliverPending('user-1')).rejects.toBeInstanceOf(DigestUnavailableError);
    expect(redis.getdel).not.toHaveBeenCalled();
    expect(client.sendText).not.toHaveBeenCalled();
    // The entry must be untouched — still there for a retry once configured.
    expect(redis.store.get('wa:vd:user-1')).toBe(JSON.stringify({ text: 'hi', audioB64: null }));
  });

  describe('wamid to userId map for async statuses (wa:vdmsg:*)', () => {
    const TTL = 259200;

    it('direct send stores every returned wamid for the user', async () => {
      const redis = makeRedis();
      const sender = new WhatsAppDigestSender(
        new DigestChannelRegistry(),
        makeClient() as any,
        makeLinkService({ waPhoneNumber: '48500000000', defaultAccountId: 'acc-1', lastInboundAt: RECENT }) as any,
        makeConfig('voice_digest_ready') as any,
        redis as any,
      );

      await sender.send({ userId: 'user-1', lang: 'en', text: 'Weekly digest', audio: Buffer.from('v') });

      expect(redis.set).toHaveBeenCalledWith('wa:vdmsg:wamid.audio', 'user-1', 'EX', TTL);
      expect(redis.set).toHaveBeenCalledWith('wa:vdmsg:wamid.text', 'user-1', 'EX', TTL);
    });

    it('template send stores the template wamid', async () => {
      const redis = makeRedis();
      const sender = new WhatsAppDigestSender(
        new DigestChannelRegistry(),
        makeClient() as any,
        makeLinkService({ waPhoneNumber: '48500000000', defaultAccountId: 'acc-1', lastInboundAt: STALE }) as any,
        makeConfig('voice_digest_ready') as any,
        redis as any,
      );

      await sender.send({ userId: 'user-1', lang: 'en', text: 'Weekly digest', audio: null });

      expect(redis.store.get('wa:vdmsg:wamid.template')).toBe('user-1');
    });

    it('deliverPending stores the wamids of the delivered messages', async () => {
      const redis = makeRedis();
      redis.store.set('wa:vd:user-1', JSON.stringify({ text: 'Weekly digest', audioB64: null }));
      const sender = new WhatsAppDigestSender(
        new DigestChannelRegistry(),
        makeClient() as any,
        makeLinkService({ waPhoneNumber: '48500000000', defaultAccountId: 'acc-1', lastInboundAt: STALE }) as any,
        makeConfig('voice_digest_ready') as any,
        redis as any,
      );

      await sender.deliverPending('user-1');

      expect(redis.store.get('wa:vdmsg:wamid.text')).toBe('user-1');
    });

    it('takeDigestRecipient returns the mapped user once (GETDEL) and null for unknown ids', async () => {
      const redis = makeRedis();
      redis.store.set('wa:vdmsg:wamid.x', 'user-1');
      const sender = new WhatsAppDigestSender(
        new DigestChannelRegistry(),
        makeClient() as any,
        makeLinkService(null) as any,
        makeConfig(undefined) as any,
        redis as any,
      );

      await expect(sender.takeDigestRecipient('wamid.x')).resolves.toBe('user-1');
      await expect(sender.takeDigestRecipient('wamid.x')).resolves.toBeNull();
      await expect(sender.takeDigestRecipient('wamid.other')).resolves.toBeNull();
    });
  });
});
