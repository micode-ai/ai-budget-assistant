import { SlackDigestSender } from './slack-digest.sender';
import { DigestBlockedError, DigestChannelRegistry, DigestUnavailableError } from '../../voice-digest/digest-channel.registry';

interface FakeLink {
  slackUserId: string;
  slackTeamId: string;
  defaultAccountId: string;
}

function makeClient() {
  return {
    openDm: jest.fn().mockResolvedValue('D12345'),
    uploadAudio: jest.fn().mockResolvedValue(undefined),
    sendText: jest.fn().mockResolvedValue(undefined),
  };
}

function makeLinkService(link: FakeLink | null) {
  return { getLinkByUserId: jest.fn().mockResolvedValue(link) };
}

/** Shaped like a @slack/web-api WebAPIPlatformError. */
function slackPlatformError(code: string) {
  return { code: 'slack_webapi_platform_error', data: { ok: false, error: code } };
}

describe('SlackDigestSender', () => {
  it('registers itself on the channel registry on module init', () => {
    const registry = new DigestChannelRegistry();
    const sender = new SlackDigestSender(registry, makeClient() as any, makeLinkService(null) as any);

    sender.onModuleInit();

    expect(registry.get('slack')).toBe(sender);
  });

  it('with audio: opens the DM and uploads the audio with the text as the comment', async () => {
    const client = makeClient();
    const linkService = makeLinkService({ slackUserId: 'U1', slackTeamId: 'T1', defaultAccountId: 'acc-1' });
    const sender = new SlackDigestSender(new DigestChannelRegistry(), client as any, linkService as any);
    const audio = Buffer.from('voice-bytes');

    const result = await sender.send({ userId: 'user-1', lang: 'en', text: 'Weekly digest', audio });

    expect(result).toBe('sent');
    expect(client.openDm).toHaveBeenCalledWith('T1', 'U1');
    expect(client.uploadAudio).toHaveBeenCalledWith('T1', 'D12345', audio, 'Weekly digest');
    expect(client.sendText).not.toHaveBeenCalled();
  });

  it('without audio: sends plain text', async () => {
    const client = makeClient();
    const linkService = makeLinkService({ slackUserId: 'U1', slackTeamId: 'T1', defaultAccountId: 'acc-1' });
    const sender = new SlackDigestSender(new DigestChannelRegistry(), client as any, linkService as any);

    const result = await sender.send({ userId: 'user-1', lang: 'en', text: 'Weekly digest', audio: null });

    expect(result).toBe('sent');
    expect(client.uploadAudio).not.toHaveBeenCalled();
    expect(client.sendText).toHaveBeenCalledWith('T1', 'D12345', 'Weekly digest');
  });

  it('channel_not_found maps to DigestBlockedError', async () => {
    const client = makeClient();
    client.openDm.mockRejectedValueOnce(slackPlatformError('channel_not_found'));
    const linkService = makeLinkService({ slackUserId: 'U1', slackTeamId: 'T1', defaultAccountId: 'acc-1' });
    const sender = new SlackDigestSender(new DigestChannelRegistry(), client as any, linkService as any);

    await expect(sender.send({ userId: 'user-1', lang: 'en', text: 'hi', audio: null })).rejects.toBeInstanceOf(
      DigestBlockedError,
    );
  });

  it('an unrelated error is propagated unchanged', async () => {
    const client = makeClient();
    const boom = new Error('network blip');
    client.sendText.mockRejectedValueOnce(boom);
    const linkService = makeLinkService({ slackUserId: 'U1', slackTeamId: 'T1', defaultAccountId: 'acc-1' });
    const sender = new SlackDigestSender(new DigestChannelRegistry(), client as any, linkService as any);

    await expect(sender.send({ userId: 'user-1', lang: 'en', text: 'hi', audio: null })).rejects.toBe(boom);
  });

  it('throws DigestUnavailableError when the user has no Slack link', async () => {
    const sender = new SlackDigestSender(new DigestChannelRegistry(), makeClient() as any, makeLinkService(null) as any);

    await expect(sender.send({ userId: 'user-1', lang: 'en', text: 'hi', audio: null })).rejects.toBeInstanceOf(
      DigestUnavailableError,
    );
  });

  it('isLinked/accountIdFor reflect the link service', async () => {
    const linkService = makeLinkService({ slackUserId: 'U1', slackTeamId: 'T1', defaultAccountId: 'acc-1' });
    const sender = new SlackDigestSender(new DigestChannelRegistry(), makeClient() as any, linkService as any);

    await expect(sender.isLinked('user-1')).resolves.toBe(true);
    await expect(sender.accountIdFor('user-1')).resolves.toBe('acc-1');
  });
});
