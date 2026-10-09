import { GroupHandler, escapeWhatsApp } from './group.handler';
import { t } from '../helpers/i18n';
import { draftIdOf, makeGroupBotWorld } from '../../groups/__fixtures__/group-bot.fixture';
import type { WhatsAppUserState } from '../types';

const state = (over: Partial<WhatsAppUserState> = {}): WhatsAppUserState => ({
  userId: 'user-me',
  accountId: 'acc-1',
  accountRole: 'editor',
  conversationId: null,
  currencyCode: 'PLN',
  language: 'en',
  waPhoneNumber: '+48500600700',
  ...over,
});

function setup() {
  const w = makeGroupBotWorld();
  const client = {
    sendText: jest.fn().mockResolvedValue(undefined),
    sendButtons: jest.fn().mockResolvedValue(undefined),
    sendList: jest.fn().mockResolvedValue(undefined),
  };
  const handler = new GroupHandler(w.service, client as never);
  const buttons = () => client.sendButtons.mock.calls.at(-1)![2] as { id: string; title: string }[];
  return { w, client, handler, buttons };
}

describe('WhatsApp GroupHandler — group (ABA-658)', () => {
  it('happy path: one group -> confirm buttons with `--` ids -> one expense', async () => {
    const { w, client, handler, buttons } = setup();
    w.addGroup({ name: 'Flat' }, ['user-me', 'user-b']);
    await handler.handle('120 pizza', 'wamid.1', state());
    expect(client.sendButtons).toHaveBeenCalledWith(
      '+48500600700',
      t('groupConfirmCard', 'en', { group: 'Flat', amount: '120.00 PLN', description: 'pizza', count: '2' }),
      expect.any(Array),
    );
    const [confirm, cancel] = buttons();
    expect(confirm.id).toMatch(/^gc--[a-f0-9]{16}$/);
    expect(cancel.id).toMatch(/^gx--[a-f0-9]{16}$/);

    await handler.handleConfirm(draftIdOf(confirm.id), state());
    expect(w.expenses).toHaveLength(1);
    expect(client.sendText).toHaveBeenLastCalledWith('+48500600700', t('groupAdded', 'en', { group: 'Flat', amount: '120.00 PLN' }));
  });

  it('a viewer of the bot account can still add', async () => {
    const { w, handler, buttons } = setup();
    w.addGroup({ name: 'Flat' }, ['user-me', 'user-b']);
    await handler.handle('5', 'wamid.1', state({ accountRole: 'viewer' }));
    await handler.handleConfirm(draftIdOf(buttons()[0].id), state({ accountRole: 'viewer' }));
    expect(w.expenses).toHaveLength(1);
  });

  it('the picker is an interactive list of at most 10 rows; a forged row or another user is refused', async () => {
    const { w, client, handler, buttons } = setup();
    for (let i = 1; i <= 11; i += 1) w.addGroup({ name: `G${i}` }, ['user-me', 'user-x']);
    await handler.handle('50 dinner', 'wamid.1', state());
    const rows = client.sendList.mock.calls[0][3] as { id: string; title: string }[];
    expect(rows).toHaveLength(10);
    expect(rows[0]).toEqual({ id: expect.stringMatching(/^gp--[a-f0-9]{16}:0$/), title: 'G11' });
    const draftId = draftIdOf(rows[0].id);

    await handler.handlePick(`${draftId}:${w.groups[0].id}`, state());
    expect(client.sendText).toHaveBeenLastCalledWith('+48500600700', t('groupExpired', 'en'));
    await handler.handlePick(`${draftId}:0`, state({ userId: 'user-x' }));
    expect(client.sendText).toHaveBeenLastCalledWith('+48500600700', t('groupExpired', 'en'));

    await handler.handlePick(`${draftId}:9`, state());
    await handler.handleConfirm(draftIdOf(buttons()[0].id), state());
    expect(w.expenses[0].groupId).toBe(w.groups.find((g) => g.name === 'G2')!.id);
  });

  it('archived between the card and Confirm: refused, nothing written', async () => {
    const { w, client, handler, buttons } = setup();
    const g = w.addGroup({ name: 'Trip' }, ['user-me', 'user-b']);
    await handler.handle('30', 'wamid.1', state());
    g.status = 'archived';
    await handler.handleConfirm(draftIdOf(buttons()[0].id), state());
    expect(client.sendText).toHaveBeenLastCalledWith('+48500600700', t('groupNotAvailable', 'en'));
    expect(w.expenses).toHaveLength(0);
  });

  it('the same wamid twice (and a double Confirm) creates one expense', async () => {
    const { w, handler, buttons } = setup();
    w.addGroup({ name: 'Flat' }, ['user-me', 'user-b']);
    await handler.handle('10 bread', 'wamid.same', state());
    const a = draftIdOf(buttons()[0].id);
    await handler.handle('10 bread', 'wamid.same', state());
    const b = draftIdOf(buttons()[0].id);
    await Promise.all([handler.handleConfirm(a, state()), handler.handleConfirm(a, state()), handler.handleConfirm(b, state())]);
    expect(w.expenses).toHaveLength(1);
  });

  it('Cancel clears the draft', async () => {
    const { w, client, handler, buttons } = setup();
    w.addGroup({ name: 'Flat' }, ['user-me', 'user-b']);
    await handler.handle('10', 'wamid.1', state());
    const draftId = draftIdOf(buttons()[1].id);
    await handler.handleCancel(draftId, state());
    expect(client.sendText).toHaveBeenLastCalledWith('+48500600700', t('groupCancelled', 'en'));
    expect(w.cacheStore.has(`wa:grp:${draftId}`)).toBe(false);
    await handler.handleConfirm(draftId, state());
    expect(w.expenses).toHaveLength(0);
  });

  it('refuses an unsupported currency and a missing rate', async () => {
    const { w, client, handler } = setup();
    w.addGroup({ name: 'Trip' }, ['user-me', 'user-b']);
    await handler.handle('100 CHF fondue', 'wamid.1', state());
    expect(client.sendText).toHaveBeenLastCalledWith('+48500600700', t('groupCurrencyUnsupported', 'en', { currency: 'CHF' }));
    await handler.handle('100 GBP hotel', 'wamid.2', state());
    expect(client.sendText).toHaveBeenLastCalledWith('+48500600700', t('groupFxUnavailable', 'en', { currency: 'GBP' }));
  });

  it('neutralises WhatsApp formatting and auto-links in group labels and descriptions', async () => {
    const { w, client, handler } = setup();
    w.addGroup({ name: '*Flat* _x_ ~y~ `z`' }, ['user-me', 'user-b']);
    await handler.handle('10 see https://evil.example www.evil.example', 'wamid.9', state());
    const text = client.sendButtons.mock.calls.at(-1)![1] as string;
    expect(text).not.toContain('*Flat*');
    expect(text).not.toMatch(/https:\/\/evil/);
    expect(text).not.toMatch(/www\.evil/);
    expect(text).toContain('*\u200dFlat*\u200d');
  });

  it('escapeWhatsApp inserts a zero-width joiner after each formatting char, :// and www.', () => {
    expect(escapeWhatsApp('*a*')).toBe('*\u200da*\u200d');
    expect(escapeWhatsApp('_a_ ~b~ `c`')).toBe('_\u200da_\u200d ~\u200db~\u200d `\u200dc`\u200d');
    expect(escapeWhatsApp('http://x WWW.y')).toBe('http://\u200dx WWW.\u200dy');
  });
});
