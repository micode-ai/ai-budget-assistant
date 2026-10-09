import { GroupHandler } from './group.handler';
import { t } from '../helpers/i18n';
import { draftIdOf, makeGroupBotWorld } from '../../groups/__fixtures__/group-bot.fixture';

function makeCtx(text: string, opts: { messageId?: number; accountRole?: string; userId?: string; chatType?: string } = {}) {
  return {
    userState: {
      userId: opts.userId ?? 'user-me',
      accountId: 'acc-1',
      accountRole: opts.accountRole ?? 'editor',
      language: 'en',
      telegramUserId: '555',
    },
    from: { id: 555, language_code: 'en' },
    chat: { id: 555, type: opts.chatType ?? 'private' },
    message: { text, message_id: opts.messageId ?? 10 },
    reply: jest.fn().mockResolvedValue(undefined),
    editMessageText: jest.fn().mockResolvedValue(undefined),
    answerCbQuery: jest.fn().mockResolvedValue(undefined),
  };
}

const keyboardOf = (call: unknown[]) => (call[1] as any).reply_markup.inline_keyboard as { text: string; callback_data: string }[][];

function setup() {
  const w = makeGroupBotWorld();
  const handler = new GroupHandler(w.service);
  return { w, handler };
}

describe('Telegram GroupHandler — /group (ABA-658)', () => {
  it('happy path: one group -> confirm card with Confirm/Cancel -> one expense, card replaced', async () => {
    const { w, handler } = setup();
    w.addGroup({ name: 'Flat' }, ['user-me', 'user-b', null]);
    const ctx = makeCtx('/group 120 pizza');
    await handler.handle(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(
      t('groupConfirmCard', 'en', { group: 'Flat', amount: '120.00 PLN', description: 'pizza', count: '3' }),
      expect.objectContaining({ parse_mode: 'HTML' }),
    );
    const [[confirm, cancel]] = keyboardOf(ctx.reply.mock.calls[0]);
    expect(confirm.callback_data).toMatch(/^gc:[a-f0-9]{16}$/);
    expect(cancel.callback_data).toMatch(/^gx:[a-f0-9]{16}$/);
    expect(Buffer.byteLength(confirm.callback_data)).toBeLessThanOrEqual(64);

    await handler.handleConfirm(ctx as never, draftIdOf(confirm.callback_data));
    expect(w.expenses).toHaveLength(1);
    expect(ctx.answerCbQuery).toHaveBeenCalled();
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      t('groupAdded', 'en', { group: 'Flat', amount: '120.00 PLN' }),
      expect.objectContaining({ parse_mode: 'HTML' }),
    );
  });

  it('a viewer of the bot account can still add to their group (groups are not account-scoped)', async () => {
    const { w, handler } = setup();
    w.addGroup({ name: 'Flat' }, ['user-me', 'user-b']);
    const ctx = makeCtx('/group 10', { accountRole: 'viewer' });
    await handler.handle(ctx as never);
    const [[confirm]] = keyboardOf(ctx.reply.mock.calls[0]);
    await handler.handleConfirm(ctx as never, draftIdOf(confirm.callback_data));
    expect(w.expenses).toHaveLength(1);
  });

  it('a picker over several groups; a forged index or another user cannot reach a group', async () => {
    const { w, handler } = setup();
    w.addGroup({ name: 'Flat' }, ['user-me', 'user-x']);
    w.addGroup({ name: 'Trip' }, ['user-me', 'user-x']);
    const ctx = makeCtx('/group 50 dinner');
    await handler.handle(ctx as never);
    const rows = keyboardOf(ctx.reply.mock.calls[0]);
    expect(rows.map((r) => r[0].text)).toEqual(['Trip', 'Flat']);
    const draftId = draftIdOf(rows[0][0].callback_data);

    // A tampered callback: a raw group id instead of an index.
    await handler.handlePick(ctx as never, `${draftId}:${w.groups[0].id}`);
    expect(ctx.editMessageText).toHaveBeenLastCalledWith(t('groupExpired', 'en'), expect.anything());
    // Another linked Telegram user replaying the same callback data.
    const intruder = makeCtx('', { userId: 'user-x' });
    await handler.handlePick(intruder as never, `${draftId}:0`);
    await handler.handleConfirm(intruder as never, draftId);
    expect(intruder.editMessageText).toHaveBeenLastCalledWith(t('groupExpired', 'en'), expect.anything());

    await handler.handlePick(ctx as never, `${draftId}:1`);
    const card = ctx.editMessageText.mock.calls.at(-1)!;
    expect(card[0]).toContain('Flat');
    await handler.handleConfirm(ctx as never, draftIdOf(keyboardOf(card)[0][0].callback_data));
    expect(w.expenses).toHaveLength(1);
    expect(w.expenses[0].groupId).toBe(w.groups[0].id);
  });

  it('a non-member, an archived group: nothing to pick, nothing written', async () => {
    const { w, handler } = setup();
    w.addGroup({ name: 'Theirs' }, ['user-b', 'user-c']);
    w.addGroup({ name: 'Old' }, ['user-me', 'user-b']).status = 'archived';
    const ctx = makeCtx('/group 10');
    await handler.handle(ctx as never);
    expect(ctx.reply).toHaveBeenCalledWith(t('groupNone', 'en'), expect.anything());
    expect(w.expenses).toHaveLength(0);
  });

  it('the same Telegram message delivered twice creates one expense', async () => {
    const { w, handler } = setup();
    w.addGroup({ name: 'Flat' }, ['user-me', 'user-b']);
    const first = makeCtx('/group 10 bread', { messageId: 77 });
    const again = makeCtx('/group 10 bread', { messageId: 77 });
    await handler.handle(first as never);
    await handler.handle(again as never);
    await handler.handleConfirm(first as never, draftIdOf(keyboardOf(first.reply.mock.calls[0])[0][0].callback_data));
    await handler.handleConfirm(again as never, draftIdOf(keyboardOf(again.reply.mock.calls[0])[0][0].callback_data));
    expect(w.expenses).toHaveLength(1);
  });

  it('Cancel clears the draft; a later Confirm on the old card writes nothing', async () => {
    const { w, handler } = setup();
    w.addGroup({ name: 'Flat' }, ['user-me', 'user-b']);
    const ctx = makeCtx('/group 10');
    await handler.handle(ctx as never);
    const draftId = draftIdOf(keyboardOf(ctx.reply.mock.calls[0])[0][0].callback_data);
    await handler.handleCancel(ctx as never, draftId);
    expect(ctx.editMessageText).toHaveBeenLastCalledWith(t('groupCancelled', 'en'), expect.anything());
    expect(w.cacheStore.has(`telegram:grp:${draftId}`)).toBe(false);
    await handler.handleConfirm(ctx as never, draftId);
    expect(w.expenses).toHaveLength(0);
  });

  it('refuses a currency with no rate, with a clear message', async () => {
    const { w, handler } = setup();
    w.addGroup({ name: 'Trip' }, ['user-me', 'user-b']);
    const ctx = makeCtx('/group 100 GBP hotel');
    await handler.handle(ctx as never);
    expect(ctx.reply).toHaveBeenCalledWith(t('groupFxUnavailable', 'en', { currency: 'GBP' }), expect.anything());
    expect(w.draftKeys()).toHaveLength(0);
  });

  it('asks an unlinked user to link first', async () => {
    const { handler } = setup();
    const ctx = { ...makeCtx('/group 10'), userState: undefined };
    await handler.handle(ctx as never);
    expect(ctx.reply).toHaveBeenCalledWith(t('linkFirst', 'en'), expect.anything());
  });

  it('refuses the command in a group chat with a hint and starts nothing', async () => {
    const { w, handler } = setup();
    w.addGroup({ name: 'Flat' }, ['user-me', 'user-b']);
    const ctx = makeCtx('/group 10', { chatType: 'supergroup' });
    await handler.handle(ctx as never);
    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(ctx.reply).toHaveBeenCalledWith(t('groupPrivateOnly', 'en'));
    expect(w.draftKeys()).toHaveLength(0);
  });

  it('refuses callbacks in a group chat', async () => {
    const { w, handler } = setup();
    w.addGroup({ name: 'Flat' }, ['user-me', 'user-b']);
    const priv = makeCtx('/group 10');
    await handler.handle(priv as never);
    const draft = draftIdOf(keyboardOf(priv.reply.mock.calls[0])[0][0].callback_data);
    const ctx = makeCtx('', { chatType: 'group' });
    await handler.handleConfirm(ctx as never, draft);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(t('groupPrivateOnly', 'en'));
    expect(ctx.editMessageText).not.toHaveBeenCalled();
    expect(w.expenses).toHaveLength(0);
  });
});
