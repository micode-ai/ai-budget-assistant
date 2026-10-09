import { GroupHandler } from './group.handler';
import { t } from '../helpers/i18n';
import { draftIdOf, makeGroupBotWorld } from '../../groups/__fixtures__/group-bot.fixture';
import type { SlackUserState } from '../types';

const state = (over: Partial<SlackUserState> = {}): SlackUserState => ({
  userId: 'user-me',
  accountId: 'acc-1',
  accountRole: 'editor',
  conversationId: null,
  currencyCode: 'PLN',
  language: 'en',
  slackUserId: 'U1',
  slackTeamId: 'T1',
  channel: 'D1',
  ...over,
});

function setup() {
  const w = makeGroupBotWorld();
  const client = {
    sendText: jest.fn().mockResolvedValue(undefined),
    sendButtons: jest.fn().mockResolvedValue(undefined),
    sendSelect: jest.fn().mockResolvedValue(undefined),
  };
  const handler = new GroupHandler(w.service, client as never);
  const buttons = () => client.sendButtons.mock.calls.at(-1)![3] as { id: string; title: string }[];
  return { w, client, handler, buttons };
}

describe('Slack GroupHandler — group (ABA-658)', () => {
  it('happy path: one group -> Confirm/Cancel buttons -> one expense, as a new message', async () => {
    const { w, client, handler, buttons } = setup();
    w.addGroup({ name: 'Flat & Co' }, ['user-me', 'user-b']);
    await handler.handle('120 pizza', '111.1', state());
    expect(client.sendButtons).toHaveBeenCalledWith(
      'T1',
      'D1',
      t('groupConfirmCard', 'en', { group: 'Flat &amp; Co', amount: '120.00 PLN', description: 'pizza', count: '2' }),
      expect.any(Array),
    );
    const [confirm, cancel] = buttons();
    expect(confirm.id).toMatch(/^gc:[a-f0-9]{16}$/);
    expect(cancel.id).toMatch(/^gx:[a-f0-9]{16}$/);
    await handler.handleConfirm(draftIdOf(confirm.id), state());
    expect(w.expenses).toHaveLength(1);
    expect(client.sendText).toHaveBeenLastCalledWith('T1', 'D1', t('groupAdded', 'en', { group: 'Flat &amp; Co', amount: '120.00 PLN' }));
  });

  it('a viewer of the bot account can still add', async () => {
    const { w, handler, buttons } = setup();
    w.addGroup({ name: 'Flat' }, ['user-me', 'user-b']);
    await handler.handle('5', '111.1', state({ accountRole: 'viewer' }));
    await handler.handleConfirm(draftIdOf(buttons()[0].id), state({ accountRole: 'viewer' }));
    expect(w.expenses).toHaveLength(1);
  });

  it('the picker is a static_select; a forged option or another user is refused', async () => {
    const { w, client, handler, buttons } = setup();
    w.addGroup({ name: 'Flat' }, ['user-me', 'user-x']);
    w.addGroup({ name: 'Trip' }, ['user-me', 'user-x']);
    w.addGroup({ name: 'Theirs' }, ['user-x']);
    await handler.handle('50 dinner', '111.1', state());
    const [, , , actionId, , options] = client.sendSelect.mock.calls[0];
    expect(actionId).toMatch(/^gp:[a-f0-9]{16}$/);
    expect(options).toEqual([{ value: '0', label: 'Trip' }, { value: '1', label: 'Flat' }]);
    const draftId = draftIdOf(actionId);

    await handler.handlePick(`${draftId}:${w.groups[2].id}`, state());
    expect(client.sendText).toHaveBeenLastCalledWith('T1', 'D1', t('groupExpired', 'en'));
    await handler.handlePick(`${draftId}:2`, state());
    expect(client.sendText).toHaveBeenLastCalledWith('T1', 'D1', t('groupExpired', 'en'));
    await handler.handlePick(`${draftId}:0`, state({ userId: 'user-x' }));
    expect(client.sendText).toHaveBeenLastCalledWith('T1', 'D1', t('groupExpired', 'en'));

    await handler.handlePick(`${draftId}:0`, state());
    await handler.handleConfirm(draftIdOf(buttons()[0].id), state());
    expect(w.expenses).toHaveLength(1);
    expect(w.expenses[0].groupId).toBe(w.groups[1].id);
  });

  it('removed from the group between the card and Confirm: refused', async () => {
    const { w, client, handler, buttons } = setup();
    w.addGroup({ name: 'Trip' }, ['user-me', 'user-b']);
    await handler.handle('30', '111.1', state());
    w.members.find((m) => m.userId === 'user-me')!.removedAt = new Date();
    await handler.handleConfirm(draftIdOf(buttons()[0].id), state());
    expect(client.sendText).toHaveBeenLastCalledWith('T1', 'D1', t('groupNotAvailable', 'en'));
    expect(w.expenses).toHaveLength(0);
  });

  it('the same message ts twice, and a double Confirm, create one expense', async () => {
    const { w, handler, buttons } = setup();
    w.addGroup({ name: 'Flat' }, ['user-me', 'user-b']);
    await handler.handle('10 bread', '222.2', state());
    const a = draftIdOf(buttons()[0].id);
    await handler.handle('10 bread', '222.2', state());
    const b = draftIdOf(buttons()[0].id);
    await Promise.all([handler.handleConfirm(a, state()), handler.handleConfirm(a, state()), handler.handleConfirm(b, state())]);
    expect(w.expenses).toHaveLength(1);
  });

  it('Cancel clears the draft', async () => {
    const { w, client, handler, buttons } = setup();
    w.addGroup({ name: 'Flat' }, ['user-me', 'user-b']);
    await handler.handle('10', '111.1', state());
    const draftId = draftIdOf(buttons()[1].id);
    await handler.handleCancel(draftId, state());
    expect(client.sendText).toHaveBeenLastCalledWith('T1', 'D1', t('groupCancelled', 'en'));
    expect(w.cacheStore.has(`slack:grp:${draftId}`)).toBe(false);
  });

  it('refuses a currency with no rate', async () => {
    const { w, client, handler } = setup();
    w.addGroup({ name: 'Trip' }, ['user-me', 'user-b']);
    await handler.handle('100 GBP hotel', '111.1', state());
    expect(client.sendText).toHaveBeenLastCalledWith('T1', 'D1', t('groupFxUnavailable', 'en', { currency: 'GBP' }));
  });
});
