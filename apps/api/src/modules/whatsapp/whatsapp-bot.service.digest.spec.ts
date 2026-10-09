import { WhatsAppBotService } from './whatsapp-bot.service';
import { t } from './helpers/i18n';

/**
 * Focused on the digest-related dispatch added in Task 10: the `vd--listen`
 * callback route and the `digest on|off|now` command reaching
 * `CommandHandler.handleDigest`. Every other `WhatsAppBotService` behavior
 * (voice/photo/expense/income dispatch, other callback prefixes) already has
 * its own coverage elsewhere and is untouched by this task.
 */

const DEFAULT_LINK = {
  userId: 'user-1',
  defaultAccountId: 'acc-1',
  accountRole: 'editor' as const,
  conversationId: null,
  user: { currencyCode: 'USD', language: 'en' },
};

function makeLinkService(link: typeof DEFAULT_LINK | null = DEFAULT_LINK) {
  return {
    getLink: jest.fn().mockResolvedValue(link),
    updateLastInbound: jest.fn().mockResolvedValue(undefined),
  };
}

function makeClient() {
  return { sendText: jest.fn().mockResolvedValue(undefined) };
}

function makeRedis() {
  return { set: jest.fn().mockResolvedValue('OK') };
}

function makeDigestSender(
  deliverPending: jest.Mock = jest.fn().mockResolvedValue(true),
  takeDigestRecipient: jest.Mock = jest.fn().mockResolvedValue(null),
) {
  return { deliverPending, takeDigestRecipient };
}

function makeVoiceDigestService() {
  return { handleBlocked: jest.fn().mockResolvedValue(true) };
}

function makeCommandHandler() {
  return { handleDigest: jest.fn().mockResolvedValue(undefined) };
}

function makePhotoHandler() {
  return {
    handleItemEditInput: jest.fn().mockResolvedValue(false),
    handleDateInput: jest.fn().mockResolvedValue(false),
  };
}

function makeService(overrides: {
  digestSender?: ReturnType<typeof makeDigestSender>;
  commandHandler?: ReturnType<typeof makeCommandHandler>;
  linkService?: ReturnType<typeof makeLinkService>;
  client?: ReturnType<typeof makeClient>;
  voiceDigestService?: ReturnType<typeof makeVoiceDigestService>;
} = {}) {
  const voiceDigestService = overrides.voiceDigestService ?? makeVoiceDigestService();
  const linkService = overrides.linkService ?? makeLinkService();
  const client = overrides.client ?? makeClient();
  const commandHandler = overrides.commandHandler ?? makeCommandHandler();
  const digestSender = overrides.digestSender ?? makeDigestSender();
  const redis = makeRedis();
  const photoHandler = makePhotoHandler();
  const chatHandler = { handleText: jest.fn().mockResolvedValue(undefined) };
  const unused = {};
  const groupHandler = {
    handle: jest.fn().mockResolvedValue(undefined),
    handlePick: jest.fn().mockResolvedValue(undefined),
    handleConfirm: jest.fn().mockResolvedValue(undefined),
    handleCancel: jest.fn().mockResolvedValue(undefined),
  };

  const service = new WhatsAppBotService(
    linkService as never,
    client as never,
    commandHandler as never,
    chatHandler as never,
    unused as never, // expenseHandler
    unused as never, // incomeHandler
    unused as never, // categoryHandler
    unused as never, // voiceHandler
    photoHandler as never,
    unused as never, // purchaseRequestHandler
    unused as never, // categorizeHandler
    digestSender as never,
    redis as never,
    voiceDigestService as never,
    groupHandler as never,
  );

  return { service, linkService, client, commandHandler, digestSender, redis, voiceDigestService, groupHandler };
}

function interactiveBody(buttonId: string, from = '48500600700', msgId = 'wamid.btn.1') {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [],
              messages: [
                {
                  from,
                  id: msgId,
                  timestamp: '0',
                  type: 'interactive' as const,
                  interactive: { type: 'button_reply' as const, button_reply: { id: buttonId, title: 'Listen' } },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

/**
 * The real Cloud API shape of a TEMPLATE quick-reply tap: `type: 'button'` with
 * `button: { payload, text }` — not the session-message `interactive.button_reply`.
 */
function templateButtonBody(payload: string, from = '48500600700', msgId = 'wamid.tpl.1') {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '48123456789', phone_number_id: 'PNID' },
              contacts: [{ profile: { name: 'Anna' }, wa_id: from }],
              messages: [
                {
                  context: { from: '48123456789', id: 'wamid.template.sent' },
                  from,
                  id: msgId,
                  timestamp: '1727420000',
                  type: 'button' as const,
                  button: { payload, text: 'Listen' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function textBody(text: string, from = '48500600700', msgId = 'wamid.txt.1') {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [],
              messages: [{ from, id: msgId, timestamp: '0', type: 'text' as const, text: { body: text } }],
            },
          },
        ],
      },
    ],
  };
}

describe('WhatsAppBotService — vd--listen callback (ABA voice-digest Task 10)', () => {
  it('routes vd--listen to WhatsAppDigestSender.deliverPending and sends nothing extra on success', async () => {
    const digestSender = makeDigestSender(jest.fn().mockResolvedValue(true));
    const { service, client } = makeService({ digestSender });

    await service.handleUpdate(interactiveBody('vd--listen') as never);

    expect(digestSender.deliverPending).toHaveBeenCalledWith('user-1');
    expect(client.sendText).not.toHaveBeenCalled();
  });

  it('replies digestExpired when deliverPending resolves false', async () => {
    const digestSender = makeDigestSender(jest.fn().mockResolvedValue(false));
    const { service, client } = makeService({ digestSender });

    await service.handleUpdate(interactiveBody('vd--listen') as never);

    expect(client.sendText).toHaveBeenCalledWith('+48500600700', t('digestExpired', 'en'));
  });
});

describe('WhatsAppBotService — template quick-reply button (type: button)', () => {
  it('routes a template "Listen" tap (button.payload vd--listen) to deliverPending', async () => {
    const digestSender = makeDigestSender(jest.fn().mockResolvedValue(true));
    const { service, client } = makeService({ digestSender });

    await service.handleUpdate(templateButtonBody('vd--listen') as never);

    expect(digestSender.deliverPending).toHaveBeenCalledWith('user-1');
    expect(client.sendText).not.toHaveBeenCalled();
  });

  it('asks an unlinked sender to link first on a template button tap', async () => {
    const digestSender = makeDigestSender();
    const { service, client } = makeService({ digestSender, linkService: makeLinkService(null) });

    await service.handleUpdate(templateButtonBody('vd--listen') as never);

    expect(digestSender.deliverPending).not.toHaveBeenCalled();
    expect(client.sendText).toHaveBeenCalledWith('+48500600700', t('linkFirst'));
  });
});

describe('WhatsAppBotService — digest command dispatch', () => {
  it('routes "digest on" to CommandHandler.handleDigest with the parsed args', async () => {
    const commandHandler = makeCommandHandler();
    const { service } = makeService({ commandHandler });

    await service.handleUpdate(textBody('digest on') as never);

    expect(commandHandler.handleDigest).toHaveBeenCalledWith('on', expect.objectContaining({ userId: 'user-1' }));
  });

  it('routes "digest now" to CommandHandler.handleDigest with the parsed args', async () => {
    const commandHandler = makeCommandHandler();
    const { service } = makeService({ commandHandler });

    await service.handleUpdate(textBody('digest now') as never);

    expect(commandHandler.handleDigest).toHaveBeenCalledWith('now', expect.objectContaining({ userId: 'user-1' }));
  });
});

/** The real Cloud API shape of an async delivery-status webhook. */
function statusesBody(statuses: unknown[]) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '48123456789', phone_number_id: 'PNID' },
              statuses,
            },
          },
        ],
      },
    ],
  };
}

function failedStatus(id: string, code: number) {
  return {
    id,
    status: 'failed',
    timestamp: '1727420000',
    recipient_id: '48500600700',
    errors: [
      {
        code,
        title: code === 131026 ? 'Message undeliverable' : 'Re-engagement message',
        message: code === 131026 ? 'Message undeliverable' : 'Re-engagement message',
        error_data: { details: 'Message failed to send.' },
        href: 'https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/',
      },
    ],
  };
}

describe('WhatsAppBotService — async digest delivery statuses', () => {
  it('a failed 131026 status for a digest message disables the digest via handleBlocked', async () => {
    const digestSender = makeDigestSender(undefined, jest.fn().mockResolvedValue('user-1'));
    const { service, voiceDigestService } = makeService({ digestSender });

    await service.handleUpdate(statusesBody([failedStatus('wamid.digest.1', 131026)]) as never);

    expect(digestSender.takeDigestRecipient).toHaveBeenCalledWith('wamid.digest.1');
    expect(voiceDigestService.handleBlocked).toHaveBeenCalledWith('user-1', 'whatsapp');
  });

  it('a failed 131026 status for a non-digest message does nothing', async () => {
    const digestSender = makeDigestSender(undefined, jest.fn().mockResolvedValue(null));
    const { service, voiceDigestService } = makeService({ digestSender });

    await service.handleUpdate(statusesBody([failedStatus('wamid.chat.1', 131026)]) as never);

    expect(voiceDigestService.handleBlocked).not.toHaveBeenCalled();
  });

  it('a failed 131047 status only logs a warning, without consuming the mapping or disabling', async () => {
    const digestSender = makeDigestSender(undefined, jest.fn().mockResolvedValue('user-1'));
    const { service, voiceDigestService } = makeService({ digestSender });
    const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);

    await service.handleUpdate(statusesBody([failedStatus('wamid.digest.2', 131047)]) as never);

    expect(voiceDigestService.handleBlocked).not.toHaveBeenCalled();
    expect(digestSender.takeDigestRecipient).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('131047');
  });

  it('delivered/read statuses are ignored', async () => {
    const digestSender = makeDigestSender();
    const { service, voiceDigestService } = makeService({ digestSender });

    await service.handleUpdate(
      statusesBody([
        { id: 'wamid.a', status: 'delivered', timestamp: '1', recipient_id: '48500600700' },
        { id: 'wamid.a', status: 'read', timestamp: '2', recipient_id: '48500600700' },
      ]) as never,
    );

    expect(digestSender.takeDigestRecipient).not.toHaveBeenCalled();
    expect(voiceDigestService.handleBlocked).not.toHaveBeenCalled();
  });
});

describe('WhatsAppBotService — the group command (ABA-658)', () => {
  it('routes `group 120 pizza` to the group handler with the inbound message id', async () => {
    const { service, groupHandler } = makeService();
    await service.handleUpdate(textBody('group 120 pizza', '48500600700', 'wamid.grp.1') as never);
    expect(groupHandler.handle).toHaveBeenCalledWith('120 pizza', 'wamid.grp.1', expect.objectContaining({ userId: 'user-1' }));
  });

  it('routes the picker row and the confirm / cancel buttons by their `--` ids', async () => {
    const { service, groupHandler } = makeService();
    await service.handleUpdate(interactiveBody('gp--0123456789abcdef:1', '48500600700', 'wamid.a') as never);
    await service.handleUpdate(interactiveBody('gc--0123456789abcdef', '48500600700', 'wamid.b') as never);
    await service.handleUpdate(interactiveBody('gx--0123456789abcdef', '48500600700', 'wamid.c') as never);
    expect(groupHandler.handlePick).toHaveBeenCalledWith('0123456789abcdef:1', expect.anything());
    expect(groupHandler.handleConfirm).toHaveBeenCalledWith('0123456789abcdef', expect.anything());
    expect(groupHandler.handleCancel).toHaveBeenCalledWith('0123456789abcdef', expect.anything());
  });
});
