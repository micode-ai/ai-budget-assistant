import { ChatHandler } from './chat.handler';

function setup(memberships: { id: string; name: string }[]) {
  const chatService: any = {
    chat: jest.fn().mockResolvedValue({ message: 'Add 50?', conversationId: 'conv-b', pendingAction: { id: 'act-1' } }),
    confirmAction: jest.fn().mockResolvedValue({ message: 'Added' }),
    rejectAction: jest.fn().mockResolvedValue({ message: 'Cancelled' }),
  };
  const linkService: any = { updateConversationId: jest.fn() };
  const prisma: any = {
    accountMember: {
      findMany: jest.fn().mockResolvedValue(
        memberships.map((a) => ({ account: { ...a, currencyCode: 'PLN' } })),
      ),
    },
  };
  const subs: any = { trackAiUsage: jest.fn() };
  const store = new Map<string, unknown>();
  const cache: any = {
    set: jest.fn(async (k: string, v: unknown) => store.set(k, v)),
    get: jest.fn(async (k: string) => store.get(k)),
    del: jest.fn(),
  };
  const handler = new ChatHandler(chatService, linkService, prisma, subs, cache);
  const ctx: any = {
    userState: {
      userId: 'u1',
      accountId: 'a',
      accountRole: 'owner',
      conversationId: 'conv-a',
      currencyCode: 'PLN',
      language: 'en',
      telegramUserId: 't1',
      accountName: 'Home',
      multiAccount: memberships.length > 1,
    },
    reply: jest.fn(),
    answerCbQuery: jest.fn(),
    editMessageText: jest.fn(),
  };
  return { handler, ctx, chatService, cache, store, subs };
}

describe('Telegram chat — which account a write goes to (ABA-812)', () => {
  it('shows the linked account under a proposed write', async () => {
    const { handler, ctx } = setup([{ id: 'a', name: 'Home' }, { id: 'b', name: 'Trip' }]);
    await handler.processMessage(ctx, 'lunch 50');
    expect(ctx.reply.mock.calls[0][0]).toContain('Home');
    expect(ctx.reply.mock.calls[0][0]).toContain('/account');
  });

  it('confirms in the account the proposal was made in, even if the message named another one', async () => {
    const { handler, ctx, chatService, store, subs } = setup([{ id: 'a', name: 'Home' }, { id: 'b', name: 'Trip' }]);
    await handler.processMessage(ctx, 'dinner 40 Trip');
    expect(chatService.chat).toHaveBeenCalledWith('u1', 'dinner 40 Trip', 'conv-a', 'b', 'Trip');
    expect(ctx.reply.mock.calls[0][0]).toContain('Trip');
    const shortId = [...store.keys()][0].split(':').pop()!;

    await handler.handleConfirmCallback(ctx, shortId);
    expect(chatService.confirmAction).toHaveBeenCalledWith('u1', 'conv-b', 'act-1', 'b');
    expect(subs.trackAiUsage).toHaveBeenLastCalledWith('u1', 'chat', 0.5, 'b');
    expect(ctx.editMessageText.mock.calls[0][0]).toContain('Trip');
  });

  it('does not take over an account whose name is only part of a word', async () => {
    const { handler, ctx, chatService } = setup([{ id: 'a', name: 'Home' }, { id: 'b', name: 'Дом' }]);
    await handler.processMessage(ctx, 'купил хлеб домой');
    expect(chatService.chat.mock.calls[0][3]).toBe('a');
  });

  it('adds no account line for a user with one account', async () => {
    const { handler, ctx } = setup([{ id: 'a', name: 'Home' }]);
    await handler.processMessage(ctx, 'lunch 50');
    expect(ctx.reply.mock.calls[0][0]).not.toContain('/account');
  });
});
