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
    uploadMedia: jest.fn().mockResolvedValue('media-1'),
    sendAudio: jest.fn().mockResolvedValue(undefined),
    sendText: jest.fn().mockResolvedValue(undefined),
    sendTemplate: jest.fn().mockResolvedValue(undefined),
  };
}

function makeLinkService(link: FakeLink | null) {
  return { getLinkByUserId: jest.fn().mockResolvedValue(link) };
}

function makeConfig(templateName: string | undefined) {
  return { get: jest.fn().mockReturnValue(templateName) };
}

/** In-memory stand-in for the WA_REDIS ioredis client. */
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
});
