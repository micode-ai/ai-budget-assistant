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

function makeDigestSender(deliverPending: jest.Mock = jest.fn().mockResolvedValue(true)) {
  return { deliverPending };
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
} = {}) {
  const linkService = overrides.linkService ?? makeLinkService();
  const client = overrides.client ?? makeClient();
  const commandHandler = overrides.commandHandler ?? makeCommandHandler();
  const digestSender = overrides.digestSender ?? makeDigestSender();
  const redis = makeRedis();
  const photoHandler = makePhotoHandler();
  const chatHandler = { handleText: jest.fn().mockResolvedValue(undefined) };
  const unused = {};

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
  );

  return { service, linkService, client, commandHandler, digestSender, redis };
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
