import { CommandHandler } from './command.handler';
import { t } from '../helpers/i18n';
import type { WhatsAppUserState } from '../types';

const USER: WhatsAppUserState = {
  userId: 'user-1',
  accountId: 'acc-1',
  accountRole: 'editor',
  conversationId: null,
  currencyCode: 'PLN',
  language: 'en',
  waPhoneNumber: '+48500600700',
};

function make(enableFrom: jest.Mock) {
  const client = { sendText: jest.fn().mockResolvedValue(undefined) };
  const voiceDigestService = {
    enableFrom,
    getSettings: jest.fn().mockResolvedValue({ day: 1, hour: 8 }),
    disable: jest.fn(),
    runForUser: jest.fn(),
  };
  const handler = new CommandHandler(
    {} as never,
    client as never,
    {} as never,
    {} as never,
    voiceDigestService as never,
    { setIfAbsent: jest.fn() } as never,
  );
  return { handler, client, voiceDigestService };
}

describe('WhatsApp CommandHandler.handleDigest on', () => {
  it('replies digestUnavailable and does not confirm when the template is not configured', async () => {
    const { handler, client, voiceDigestService } = make(jest.fn().mockResolvedValue(false));

    await handler.handleDigest('on', USER);

    expect(voiceDigestService.enableFrom).toHaveBeenCalledWith('user-1', 'whatsapp');
    expect(voiceDigestService.getSettings).not.toHaveBeenCalled();
    expect(client.sendText).toHaveBeenCalledTimes(1);
    expect(client.sendText).toHaveBeenCalledWith('+48500600700', t('digestUnavailable', 'en'));
  });

  it('confirms the schedule when enabling succeeded', async () => {
    const { handler, client } = make(jest.fn().mockResolvedValue(true));

    await handler.handleDigest('on', USER);

    expect(client.sendText).toHaveBeenCalledWith(
      '+48500600700',
      t('digestOn', 'en', { day: t('weekday1', 'en'), hour: '08:00' }),
    );
  });
});
