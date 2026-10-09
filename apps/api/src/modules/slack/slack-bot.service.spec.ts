import { SlackBotService } from './slack-bot.service';
import { SlackEventCallback } from './types';

function makeService() {
  const photoHandler = {
    handleImage: jest.fn().mockResolvedValue(undefined),
    handleDocument: jest.fn().mockResolvedValue(undefined),
    handleDateInput: jest.fn().mockResolvedValue(false),
    handleItemEditInput: jest.fn().mockResolvedValue(false),
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
  const groupHandler = {
    handle: jest.fn().mockResolvedValue(undefined),
    handlePick: jest.fn().mockResolvedValue(undefined),
    handleConfirm: jest.fn().mockResolvedValue(undefined),
    handleCancel: jest.fn().mockResolvedValue(undefined),
  };

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
    noop, // categorizeHandler
    redis as never,
    groupHandler as never,
  );
  return { service, photoHandler, voiceHandler, chatHandler, client, linkService, groupHandler };
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

function textMessage(text: string): SlackEventCallback {
  return {
    type: 'event_callback',
    team_id: 'T1',
    event_id: `E-${text}`,
    event: { type: 'message', channel: 'D1', channel_type: 'im', user: 'U1', ts: '777.1', text },
  };
}

describe('SlackBotService — the group command (ABA-658)', () => {
  it('routes `group 120 pizza` to the group handler with the message ts', async () => {
    const { service, groupHandler, chatHandler } = makeService();
    await service.handleEvent(textMessage('group 120 pizza'));
    expect(groupHandler.handle).toHaveBeenCalledWith('120 pizza', '777.1', expect.objectContaining({ userId: 'u1' }));
    expect(chatHandler.handleText).not.toHaveBeenCalled();
  });

  it('leaves "group my expenses by category" to the AI chat', async () => {
    const { service, groupHandler, chatHandler } = makeService();
    await service.handleEvent(textMessage('group my expenses by category'));
    expect(groupHandler.handle).not.toHaveBeenCalled();
    expect(chatHandler.handleText).toHaveBeenCalled();
  });

  it('passes a static_select choice as `{draftId}:{value}` to the picker', async () => {
    const { service, groupHandler } = makeService();
    await service.handleInteractivity({
      type: 'block_actions',
      user: { id: 'U1', team_id: 'T1' },
      channel: { id: 'D1' },
      actions: [{ action_id: 'gp:0123456789abcdef', selected_option: { value: '2' } }],
    });
    expect(groupHandler.handlePick).toHaveBeenCalledWith('0123456789abcdef:2', expect.objectContaining({ userId: 'u1' }));
  });

  it('routes the confirm and cancel buttons', async () => {
    const { service, groupHandler } = makeService();
    const tap = (action_id: string) =>
      service.handleInteractivity({ type: 'block_actions', user: { id: 'U1', team_id: 'T1' }, channel: { id: 'D1' }, actions: [{ action_id }] });
    await tap('gc:0123456789abcdef');
    await tap('gx:0123456789abcdef');
    expect(groupHandler.handleConfirm).toHaveBeenCalledWith('0123456789abcdef', expect.anything());
    expect(groupHandler.handleCancel).toHaveBeenCalledWith('0123456789abcdef', expect.anything());
  });
});
