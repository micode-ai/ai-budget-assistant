import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
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

function buildDeps() {
  const prisma: any = {
    chatConversation: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
    chatConversationPin: { createMany: jest.fn(), deleteMany: jest.fn() },
    chatMessage: { create: jest.fn().mockResolvedValue({ id: 'm1', createdAt: new Date('2026-05-25T10:00:00Z') }), findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
  };
  const aiTools = { getToolDefinitions: () => [], isWriteAction: () => false, executeAction: jest.fn(), executeWithCache: jest.fn() };
  return { prisma, aiTools };
}

describe('ChatActionLifecycleService', () => {
  let service: ChatActionLifecycleService;
  let deps: ReturnType<typeof buildDeps>;

  beforeEach(async () => {
    mockChatCreate.mockReset();
    deps = buildDeps();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ChatActionLifecycleService,
        { provide: ConfigService, useValue: { get: () => 'sk-test' } },
        { provide: PrismaService, useValue: deps.prisma },
        { provide: AiToolsService, useValue: deps.aiTools },
        { provide: PromptBuilder, useValue: {
          buildSystemPrompt: () => 'SYS',
          detectLanguage: () => 'English',
          detectUserLanguage: () => 'English',
          buildActionSummary: () => 'summary',
          getConfirmText: () => 'ok',
          getFailText: (_lang: string, err?: string) => `fail: ${err}`,
          getRejectText: () => 'rejected',
          getShoppingListAddText: (_lang: string, listName: string, labels: string[]) => `added ${labels.join(',')} to ${listName}`,
          getShoppingListRemoveText: (_lang: string, removed: string[], notFound: string[]) => `removed ${removed.join(',')} notFound ${notFound.join(',')}`,
          getUndoConfirmText: (_lang: string, data: Record<string, unknown>) => `undone: ${JSON.stringify(data)}`,
          getUndoUnavailableText: (_lang: string, kind: string) => `nothing-to-undo:${kind}`,
        } },
      ],
    }).compile();
    service = moduleRef.get(ChatActionLifecycleService);
  });

  describe('confirmAction scoping', () => {
    it('rejects confirming when caller is not the initiator', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'c1', accountId: 'acc-1', isShared: true, userId: 'owner-1' });
      deps.prisma.chatMessage.findFirst.mockResolvedValue(null); // no pending action for this caller
      await expect(service.confirmAction('bob-1', 'c1', 'act-1', 'acc-1')).rejects.toThrow();
    });
    it('rejects confirming in a conversation outside the account', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue(null);
      await expect(service.confirmAction('owner-1', 'c-other', 'act-1', 'acc-1')).rejects.toThrow();
    });
  });

  describe('undo_last_action', () => {
    beforeEach(() => {
      deps.aiTools.isWriteAction = jest.fn((name: string) => name === 'undo_last_action') as any;
    });

    it('answers "nothing to undo" and creates no pending action when there is no action_executed message', async () => {
      deps.prisma.chatMessage.findFirst.mockResolvedValue(null); // no action_executed row yet

      const res = await service.handleUndoLastActionRequest(
        { id: 'conv-1' },
        'SYS',
        [],
        'undo that',
        'gpt-4o',
        'acc-1',
        'owner-1',
        'English',
      );

      expect(res.message).toBe('nothing-to-undo:nothing');
      expect((res as any).pendingAction).toBeUndefined();
      // No OpenAI call at all — there is nothing to confirm.
      expect(mockChatCreate).not.toHaveBeenCalled();
    });

    it('answers "too much time has passed" when the last write is older than the undo window', async () => {
      deps.prisma.chatMessage.findFirst.mockResolvedValue({
        id: 'am1',
        createdAt: new Date(Date.now() - 20 * 60 * 1000), // 20 minutes ago — past the 15-minute window
        content: JSON.stringify({
          id: 'pa1', actionType: 'create_expense', data: { amount: 50 }, displaySummary: 'x',
          status: 'executed', result: { actionType: 'create_expense', success: true, data: { id: 'e1', amount: 50, currencyCode: 'PLN' } },
        }),
      });

      const res = await service.handleUndoLastActionRequest(
        { id: 'conv-1' },
        'SYS',
        [],
        'undo that',
        'gpt-4o',
        'acc-1',
        'owner-1',
        'English',
      );

      expect(res.message).toBe('nothing-to-undo:stale');
      expect((res as any).pendingAction).toBeUndefined();
    });

    it('builds a pending action for a fresh undoable write and routes through the normal confirmation pipeline', async () => {
      deps.prisma.chatMessage.findFirst.mockResolvedValue({
        id: 'am1',
        createdAt: new Date(), // fresh, well within the window
        content: JSON.stringify({
          id: 'pa1', actionType: 'create_expense', data: { amount: 50, currencyCode: 'PLN' }, displaySummary: 'expense 50 PLN',
          status: 'executed', result: { actionType: 'create_expense', success: true, data: { id: 'e1', amount: 50, currencyCode: 'PLN', description: 'Groceries', category: 'Food' } },
        }),
      });
      mockChatCreate.mockResolvedValueOnce({
        choices: [{ message: { content: "I'd like to undo your last expense. Confirm?" } }],
        usage: { total_tokens: 8 },
      });

      const res = await service.handleUndoLastActionRequest(
        { id: 'conv-1' },
        'SYS',
        [],
        'undo that',
        'gpt-4o',
        'acc-1',
        'owner-1',
        'English',
      );

      expect((res as any).pendingAction).toMatchObject({ actionType: 'undo_last_action' });
      expect(((res as any).pendingAction as any).data).toMatchObject({
        sourceMessageId: 'am1',
        originalActionType: 'create_expense',
        amount: 50,
        currencyCode: 'PLN',
        categoryName: 'Food',
        description: 'Groceries',
      });
      expect(deps.prisma.chatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: 'pending_action' }) }),
      );
    });
  });

  describe('confirmAction — undo_last_action', () => {
    it('uses the undo confirm text and stamps undoneAt on the source action_executed message', async () => {
      const pendingContent = JSON.stringify({
        id: 'act-1', actionType: 'undo_last_action', accountId: 'acc-1',
        data: { sourceMessageId: 'am1', originalActionType: 'create_expense', originalResultData: { id: 'e1' } },
        displaySummary: 'undo the last action',
      });
      const sourceContent = JSON.stringify({
        id: 'pa1', actionType: 'create_expense', data: { amount: 50 }, displaySummary: 'x',
        status: 'executed', result: { actionType: 'create_expense', success: true, data: { id: 'e1' } },
      });

      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'c1', accountId: 'acc-1', isShared: false, userId: 'owner-1' });
      deps.prisma.chatMessage.findFirst.mockResolvedValue({ id: 'pending-1', content: pendingContent });
      deps.prisma.chatMessage.findUnique.mockResolvedValue({ id: 'am1', content: sourceContent });
      deps.prisma.chatMessage.findMany.mockResolvedValue([]); // detectConversationLanguage — no history, defaults to English
      deps.aiTools.executeAction = jest.fn().mockResolvedValue({
        actionType: 'undo_last_action',
        success: true,
        data: { undoneEntityType: 'expense', amount: 50, currencyCode: 'PLN', description: 'Groceries' },
      });

      const res = await service.confirmAction('owner-1', 'c1', 'act-1', 'acc-1');

      expect(res.message).toContain('undone:');
      expect(deps.prisma.chatMessage.update).toHaveBeenCalledWith({
        where: { id: 'am1' },
        data: { content: expect.stringContaining('"undoneAt"') },
      });
    });

    it('does not stamp anything when the revert itself failed', async () => {
      const pendingContent = JSON.stringify({
        id: 'act-1', actionType: 'undo_last_action', accountId: 'acc-1',
        data: { sourceMessageId: 'am1', originalActionType: 'create_expense', originalResultData: { id: 'e1' } },
        displaySummary: 'undo the last action',
      });
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'c1', accountId: 'acc-1', isShared: false, userId: 'owner-1' });
      deps.prisma.chatMessage.findFirst.mockResolvedValue({ id: 'pending-1', content: pendingContent });
      deps.prisma.chatMessage.findMany.mockResolvedValue([]); // detectConversationLanguage — no history, defaults to English
      deps.aiTools.executeAction = jest.fn().mockResolvedValue({
        actionType: 'undo_last_action',
        success: false,
        errorMessage: 'That entry no longer exists',
      });

      const res = await service.confirmAction('owner-1', 'c1', 'act-1', 'acc-1');

      expect(res.message).toBe('fail: That entry no longer exists');
      expect(deps.prisma.chatMessage.findUnique).not.toHaveBeenCalled();
    });
  });
});
