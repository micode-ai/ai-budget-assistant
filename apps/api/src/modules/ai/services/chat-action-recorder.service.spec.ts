import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ChatActionRecorderService } from './chat-action-recorder.service';
import { ChatActionLifecycleService } from './chat-action-lifecycle.service';
import { PrismaService } from '../../../database/prisma.service';
import { AiToolsService } from './ai-tools.service';
import { PromptBuilder } from './prompt-builder.service';

const mockChatCreate = jest.fn();
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockChatCreate } },
  })),
}));

function makePrisma() {
  return {
    chatConversation: { findFirst: jest.fn(), create: jest.fn() },
    chatMessage: { create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
  };
}

const RESULT_DATA = {
  id: 'exp-1',
  amount: 42.5,
  currencyCode: 'PLN' as const,
  description: 'Biedronka',
  category: 'Groceries',
  date: '2026-07-07',
};

describe('ChatActionRecorderService.recordExternalWrite', () => {
  it('reuses the given conversation when it exists and belongs to the caller', async () => {
    const prisma = makePrisma();
    prisma.chatConversation.findFirst.mockResolvedValue({ id: 'conv-1' });
    prisma.chatMessage.create.mockResolvedValue({ id: 'msg-1' });
    const service = new ChatActionRecorderService(prisma as never);

    const conversationId = await service.recordExternalWrite({
      userId: 'user-1',
      accountId: 'acc-1',
      conversationId: 'conv-1',
      actionType: 'create_expense',
      resultData: RESULT_DATA,
    });

    expect(conversationId).toBe('conv-1');
    expect(prisma.chatConversation.findFirst).toHaveBeenCalledWith({
      where: { id: 'conv-1', userId: 'user-1', accountId: 'acc-1' },
      select: { id: true },
    });
    expect(prisma.chatConversation.create).not.toHaveBeenCalled();
    expect(prisma.chatMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ conversationId: 'conv-1', role: 'action_executed', mentionedUserIds: [] }),
    });
  });

  it('creates a fresh conversation when none was given', async () => {
    const prisma = makePrisma();
    prisma.chatConversation.create.mockResolvedValue({ id: 'conv-new' });
    prisma.chatMessage.create.mockResolvedValue({ id: 'msg-1' });
    const service = new ChatActionRecorderService(prisma as never);

    const conversationId = await service.recordExternalWrite({
      userId: 'user-1',
      accountId: 'acc-1',
      conversationId: null,
      actionType: 'create_expense',
      resultData: RESULT_DATA,
    });

    expect(conversationId).toBe('conv-new');
    expect(prisma.chatConversation.findFirst).not.toHaveBeenCalled();
    expect(prisma.chatConversation.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', accountId: 'acc-1', isShared: false, title: 'Biedronka' },
    });
    expect(prisma.chatMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ conversationId: 'conv-new' }),
    });
  });

  it('does not reuse a conversation the caller opened for a different account', async () => {
    const prisma = makePrisma();
    // The lookup includes accountId, so the other account's conversation never matches.
    prisma.chatConversation.findFirst.mockResolvedValue(null);
    prisma.chatConversation.create.mockResolvedValue({ id: 'conv-acc-1' });
    prisma.chatMessage.create.mockResolvedValue({ id: 'msg-1' });
    const service = new ChatActionRecorderService(prisma as never);

    const conversationId = await service.recordExternalWrite({
      userId: 'user-1',
      accountId: 'acc-1',
      conversationId: 'conv-of-acc-2',
      actionType: 'create_expense',
      resultData: RESULT_DATA,
    });

    expect(prisma.chatConversation.findFirst.mock.calls[0][0].where).toEqual({ id: 'conv-of-acc-2', userId: 'user-1', accountId: 'acc-1' });
    expect(conversationId).toBe('conv-acc-1');
    expect(prisma.chatConversation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-1', accountId: 'acc-1' }),
    });
  });

  it('creates a fresh conversation when the given id belongs to another user', async () => {
    const prisma = makePrisma();
    // findFirst is scoped to { id, userId } — a conversation owned by someone
    // else simply never matches and resolves null, exactly like a missing id.
    prisma.chatConversation.findFirst.mockResolvedValue(null);
    prisma.chatConversation.create.mockResolvedValue({ id: 'conv-new-2' });
    prisma.chatMessage.create.mockResolvedValue({ id: 'msg-1' });
    const service = new ChatActionRecorderService(prisma as never);

    const conversationId = await service.recordExternalWrite({
      userId: 'user-1',
      accountId: 'acc-1',
      conversationId: 'someone-elses-conversation',
      actionType: 'create_income',
      resultData: { ...RESULT_DATA, id: 'inc-1' },
    });

    expect(conversationId).toBe('conv-new-2');
    expect(prisma.chatConversation.create).toHaveBeenCalledTimes(1);
  });

  it('falls back to a generic title when the write has no description', async () => {
    const prisma = makePrisma();
    prisma.chatConversation.create.mockResolvedValue({ id: 'conv-x' });
    prisma.chatMessage.create.mockResolvedValue({ id: 'msg-1' });
    const service = new ChatActionRecorderService(prisma as never);

    await service.recordExternalWrite({
      userId: 'user-1',
      accountId: 'acc-1',
      conversationId: undefined,
      actionType: 'create_income',
      resultData: { id: 'inc-1', amount: 3000, currencyCode: 'PLN' },
    });

    expect(prisma.chatConversation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ title: 'Income' }),
    });
  });

  it('writes a content shape findLastUndoableAction accepts (fed through the real parsing path)', async () => {
    // Captures the exact string ChatActionRecorderService writes, then feeds it
    // into a real ChatActionLifecycleService — the same class confirmAction
    // itself writes action_executed rows through — to prove a bot-recorded row
    // parses identically to a chat-confirmed one, not just that it looks right
    // by inspection.
    const prisma = makePrisma();
    prisma.chatConversation.create.mockResolvedValue({ id: 'conv-1' });
    let recordedContent = '';
    prisma.chatMessage.create.mockImplementation(async ({ data }: { data: { content: string } }) => {
      recordedContent = data.content;
      return { id: 'msg-1' };
    });
    const recorder = new ChatActionRecorderService(prisma as never);

    await recorder.recordExternalWrite({
      userId: 'user-1',
      accountId: 'acc-1',
      conversationId: null,
      actionType: 'create_expense',
      resultData: RESULT_DATA,
    });
    expect(recordedContent).toBeTruthy();

    // Now hand that exact row to a real ChatActionLifecycleService and ask it
    // to resolve "undo the last action" against it.
    mockChatCreate.mockReset();
    const lifecyclePrisma: any = {
      chatConversation: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
      chatConversationPin: { createMany: jest.fn(), deleteMany: jest.fn() },
      chatMessage: {
        create: jest.fn().mockResolvedValue({ id: 'am1', createdAt: new Date() }),
        findFirst: jest.fn().mockResolvedValue({ id: 'am-recorded', createdAt: new Date(), content: recordedContent }),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    const aiTools = { getToolDefinitions: () => [], isWriteAction: (name: string) => name === 'undo_last_action', executeAction: jest.fn(), executeWithCache: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ChatActionLifecycleService,
        { provide: ConfigService, useValue: { get: () => 'sk-test' } },
        { provide: PrismaService, useValue: lifecyclePrisma },
        { provide: AiToolsService, useValue: aiTools },
        { provide: PromptBuilder, useValue: {
          buildSystemPrompt: () => 'SYS',
          detectLanguage: () => 'English',
          detectUserLanguage: () => 'English',
          buildActionSummary: () => 'summary',
          getConfirmText: () => 'ok',
          getFailText: (_lang: string, err?: string) => `fail: ${err}`,
          getRejectText: () => 'rejected',
          getUndoConfirmText: () => 'undone',
          getUndoUnavailableText: (_lang: string, kind: string) => `nothing-to-undo:${kind}`,
        } },
      ],
    }).compile();
    const lifecycle = moduleRef.get(ChatActionLifecycleService);

    mockChatCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "I'd like to undo your last expense. Confirm?" } }],
      usage: { total_tokens: 8 },
    });

    const res = await lifecycle.handleUndoLastActionRequest(
      { id: 'conv-1' },
      'SYS',
      [],
      'undo that',
      'gpt-4o',
      'acc-1',
      'user-1',
      'English',
    );

    // "ok" status: a pendingAction was built for undo_last_action, resolving
    // straight from the bot-recorded row — not "nothing"/"stale".
    expect((res as any).pendingAction).toMatchObject({ actionType: 'undo_last_action' });
    expect(((res as any).pendingAction as any).data).toMatchObject({
      sourceMessageId: 'am-recorded',
      originalActionType: 'create_expense',
      amount: 42.5,
      currencyCode: 'PLN',
      categoryName: 'Groceries',
      description: 'Biedronka',
    });
  });
});
