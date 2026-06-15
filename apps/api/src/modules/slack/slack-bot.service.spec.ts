import { SlackBotService } from './slack-bot.service';
import { SlackEventCallback } from './types';

function makeService() {
  const photoHandler = {
    handleImage: jest.fn().mockResolvedValue(undefined),
    handleDocument: jest.fn().mockResolvedValue(undefined),
    handleDateInput: jest.fn().mockResolvedValue(false),
  };
  const voiceHandler = { handle: jest.fn().mockResolvedValue(undefined) };
  const chatHandler = { handleText: jest.fn().mockResolvedValue(undefined) };
  const client = {
    getBotUserId: jest.fn().mockResolvedValue('BBOT'),
    sendText: jest.fn().mockResolvedValue(undefined),
  };
  const linkService = {
    getLink: jest.fn().mockResolvedValue({
      userId: 'u1',
      defaultAccountId: 'a1',
      accountRole: 'editor',
      conversationId: null,
      user: { currencyCode: 'PLN', language: 'en' },
    }),
    updateLastInbound: jest.fn().mockResolvedValue(undefined),
  };
  const redis = { set: jest.fn().mockResolvedValue('OK'), get: jest.fn(), del: jest.fn() };
  const noop = {} as never;

  const service = new SlackBotService(
    linkService as never,
    client as never,
    noop, // commandHandler
    chatHandler as never,
    noop, // expenseHandler
    noop, // incomeHandler
    noop, // categoryHandler
    voiceHandler as never,
    photoHandler as never,
    redis as never,
  );
  return { service, photoHandler, voiceHandler, chatHandler, client, linkService };
}

function imageUpload(subtype?: string): SlackEventCallback {
  return {
    type: 'event_callback',
    team_id: 'T1',
    event_id: 'E1',
    event: {
      type: 'message',
      subtype,
      channel: 'D1',
      channel_type: 'im',
      user: 'U1',
      ts: '123.45',
      files: [
        { id: 'F1', mimetype: 'image/jpeg', url_private_download: 'https://files.slack.com/x.jpg' },
      ],
    },
  };
}

describe('SlackBotService.handleEvent — file uploads', () => {
  it('routes a file_share image message to the photo handler', async () => {
    const { service, photoHandler } = makeService();
    await service.handleEvent(imageUpload('file_share'));
    expect(photoHandler.handleImage).toHaveBeenCalledTimes(1);
  });

  it('still ignores edit/system subtypes (e.g. message_changed)', async () => {
    const { service, photoHandler, linkService } = makeService();
    await service.handleEvent(imageUpload('message_changed'));
    expect(photoHandler.handleImage).not.toHaveBeenCalled();
    // dropped before user resolution
    expect(linkService.getLink).not.toHaveBeenCalled();
  });
});
