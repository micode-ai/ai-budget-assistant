import { ConfigService } from '@nestjs/config';
import { SlackClientService } from './slack-client.service';
import { SlackInstallationService } from './slack-installation.service';

const conversationsOpen = jest.fn();
const filesUploadV2 = jest.fn();

jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    conversations: { open: conversationsOpen },
    files: { uploadV2: filesUploadV2 },
    chat: { postMessage: jest.fn(), update: jest.fn() },
    auth: { test: jest.fn() },
  })),
}));

function makeInstallations(token: string | null = null) {
  return {
    getToken: jest.fn().mockResolvedValue(token),
    getBotUserId: jest.fn().mockResolvedValue(null),
  } as unknown as SlackInstallationService;
}

function makeConfig(botToken = 'env-bot-token') {
  return { get: jest.fn().mockReturnValue(botToken) } as unknown as ConfigService;
}

describe('SlackClientService — digest methods (ABA voice-digest Task 8)', () => {
  beforeEach(() => {
    conversationsOpen.mockReset();
    filesUploadV2.mockReset();
  });

  it('openDm returns the DM channel id', async () => {
    conversationsOpen.mockResolvedValue({ ok: true, channel: { id: 'D123' } });
    const client = new SlackClientService(makeConfig(), makeInstallations());

    const channelId = await client.openDm('T1', 'U1');

    expect(channelId).toBe('D123');
    expect(conversationsOpen).toHaveBeenCalledWith({ users: 'U1' });
  });

  it('openDm throws when Slack returns no channel id', async () => {
    conversationsOpen.mockResolvedValue({ ok: true });
    const client = new SlackClientService(makeConfig(), makeInstallations());

    await expect(client.openDm('T1', 'U1')).rejects.toThrow();
  });

  it('openDm throws when no bot token is available for the team', async () => {
    const client = new SlackClientService(makeConfig(''), makeInstallations(null));

    await expect(client.openDm('T1', 'U1')).rejects.toThrow();
  });

  it('uploadAudio calls files.uploadV2 with the audio buffer and text as initial_comment', async () => {
    filesUploadV2.mockResolvedValue({ ok: true });
    const client = new SlackClientService(makeConfig(), makeInstallations());
    const audio = Buffer.from('voice-bytes');

    await client.uploadAudio('T1', 'D123', audio, 'Weekly digest');

    expect(filesUploadV2).toHaveBeenCalledWith({
      channel_id: 'D123',
      file: audio,
      filename: 'digest.ogg',
      initial_comment: 'Weekly digest',
    });
  });
});
