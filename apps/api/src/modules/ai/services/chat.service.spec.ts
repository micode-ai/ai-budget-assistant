import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { PrismaService } from '../../../database/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { UserContextBuilder } from './user-context-builder.service';
import { AiToolsService } from './ai-tools.service';
import { PromptBuilder } from './prompt-builder.service';
import { ChatConversationService } from './chat-conversation.service';
import { ChatActionLifecycleService } from './chat-action-lifecycle.service';

const mockChatCreate = jest.fn();
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockChatCreate } },
  })),
}));

function buildDeps() {
  const prisma: any = {
    account: { findUnique: jest.fn().mockResolvedValue({ encryptionTier: 0 }) },
    chatConversation: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
    chatConversationPin: { createMany: jest.fn(), deleteMany: jest.fn() },
    chatMessage: { create: jest.fn().mockResolvedValue({ id: 'm1', createdAt: new Date('2026-05-25T10:00:00Z') }), findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue({ aiResponseMode: 'balanced', aiModel: null, name: 'Alice' }) },
    accountMember: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const notifications = { sendToUser: jest.fn() };
  const aiTools = { getToolDefinitions: () => [], isWriteAction: () => false, executeAction: jest.fn(), executeWithCache: jest.fn() };
  const chatConversationService = { isPresent: jest.fn().mockResolvedValue(false) };
  const chatActionLifecycle = {
    handleWriteActionRequest: jest.fn(),
    handleUndoLastActionRequest: jest.fn(),
  };
  return { prisma, notifications, aiTools, chatConversationService, chatActionLifecycle };
}

describe('ChatService', () => {
  let service: ChatService;
  let deps: ReturnType<typeof buildDeps>;

  beforeEach(async () => {
    mockChatCreate.mockReset();
    deps = buildDeps();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: ConfigService, useValue: { get: () => 'sk-test' } },
        { provide: PrismaService, useValue: deps.prisma },
        { provide: NotificationsService, useValue: deps.notifications },
        { provide: UserContextBuilder, useValue: { build: jest.fn().mockResolvedValue({}) } },
        { provide: AiToolsService, useValue: deps.aiTools },
        { provide: ChatConversationService, useValue: deps.chatConversationService },
        { provide: ChatActionLifecycleService, useValue: deps.chatActionLifecycle },
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
    service = moduleRef.get(ChatService);
  });

  describe('chat() encryption guard', () => {
    it('returns encryptionRestricted without calling OpenAI when full E2E encryption is on', async () => {
      deps.prisma.account.findUnique.mockResolvedValueOnce({ encryptionTier: 2 });
      const res = await service.chat('owner-1', 'hello', undefined, 'acc-1', 'Family', 'owner', 'Alice', []);
      expect(res.encryptionRestricted).toBe(true);
      expect(res.aiResponded).toBe(false);
      expect(mockChatCreate).not.toHaveBeenCalled();
    });
  });

  describe('chat() shared mention behavior', () => {
    it('skips OpenAI and pushes absent mentioned members when a member is mentioned in a shared conversation', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'conv-1', userId: 'owner-1', accountId: 'acc-1', isShared: true, messages: [] });
      deps.prisma.accountMember.findMany.mockResolvedValue([
        { userId: 'owner-1', user: { name: 'Alice' } },
        { userId: 'bob-1', user: { name: 'Bob' } },
      ]);
      deps.chatConversationService.isPresent.mockResolvedValue(false);
      const res = await service.chat('owner-1', 'did you pay rent?', 'conv-1', 'acc-1', 'Family', 'owner', 'Alice', [{ userId: 'bob-1' }]);
      expect(res.aiResponded).toBe(false);
      expect(mockChatCreate).not.toHaveBeenCalled();
      expect(deps.notifications.sendToUser).toHaveBeenCalledWith('bob-1', expect.any(Function), expect.any(Function), expect.objectContaining({ conversationId: 'conv-1' }), 'chat_mention');
      expect(deps.prisma.chatMessage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: 'user', senderUserId: 'owner-1', mentionedUserIds: ['bob-1'] }) }));
    });

    it('does not push to a mentioned member who is present', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'conv-1', userId: 'owner-1', accountId: 'acc-1', isShared: true, messages: [] });
      deps.prisma.accountMember.findMany.mockResolvedValue([
        { userId: 'owner-1', user: { name: 'Alice' } },
        { userId: 'bob-1', user: { name: 'Bob' } },
      ]);
      deps.chatConversationService.isPresent.mockResolvedValue(true);
      await service.chat('owner-1', 'hi @Bob', 'conv-1', 'acc-1', 'Family', 'owner', 'Alice', [{ userId: 'bob-1' }]);
      expect(deps.notifications.sendToUser).not.toHaveBeenCalled();
    });

    it('excludes a self-mention from mentionedUserIds (no self push)', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'conv-1', userId: 'owner-1', accountId: 'acc-1', isShared: true, messages: [] });
      deps.prisma.accountMember.findMany.mockResolvedValue([{ userId: 'owner-1', user: { name: 'Alice' } }]);
      mockChatCreate.mockResolvedValue({ choices: [{ message: { content: 'Sure!' } }], usage: { total_tokens: 5 } });
      await service.chat('owner-1', 'note to self @Alice', 'conv-1', 'acc-1', 'Family', 'owner', 'Alice', [{ userId: 'owner-1' }]);
      expect(deps.notifications.sendToUser).not.toHaveBeenCalled();
      expect(deps.prisma.chatMessage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ senderUserId: 'owner-1', mentionedUserIds: [] }) }));
    });

    it('calls OpenAI when no member is mentioned', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'conv-1', userId: 'owner-1', accountId: 'acc-1', isShared: true, messages: [] });
      deps.prisma.accountMember.findMany.mockResolvedValue([{ userId: 'owner-1', user: { name: 'Alice' } }]);
      mockChatCreate.mockResolvedValue({ choices: [{ message: { content: 'Sure!' } }], usage: { total_tokens: 5 } });
      const res = await service.chat('owner-1', 'what did I spend?', 'conv-1', 'acc-1', 'Family', 'owner', 'Alice', []);
      expect(mockChatCreate).toHaveBeenCalled();
      expect(res.aiResponded).toBe(true);
      expect(res.message).toBe('Sure!');
      // Regression (ABA-135): the assistant message insert must include
      // mentionedUserIds — the column is NOT NULL with no DB default, so
      // omitting it crashed every chat reply with a Prisma null-constraint error.
      expect(deps.prisma.chatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: 'assistant', mentionedUserIds: [] }) }),
      );
    });

    // Regression (ABA-136): a read action (e.g. get_expenses) must return the
    // server-assigned assistantMessageId. Without it the mobile client tags the
    // bubble with a random UUID, and the shared-chat poller — which dedups by id
    // — re-adds the same server message, producing a duplicate reply.
    it('returns the server assistantMessageId for a read action', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'conv-1', userId: 'owner-1', accountId: 'acc-1', isShared: true, messages: [] });
      deps.aiTools.executeWithCache.mockResolvedValue({ data: { recentExpenses: [] } });
      mockChatCreate
        .mockResolvedValueOnce({ choices: [{ message: { tool_calls: [{ id: 'tc1', function: { name: 'get_expenses', arguments: '{"startDate":"2026-05-01","endDate":"2026-05-31"}' } }] } }], usage: { total_tokens: 10 } })
        .mockResolvedValueOnce({ choices: [{ message: { content: 'Here are your May expenses.' } }], usage: { total_tokens: 5 } });
      const res = await service.chat('owner-1', 'my may expenses', 'conv-1', 'acc-1', 'Family', 'owner', 'Alice', []);
      expect(res.message).toBe('Here are your May expenses.');
      expect(res.assistantMessageId).toBe('m1');
      expect(res.assistantCreatedAt).toBeDefined();
    });
  });

  describe('check_affordability (read action, no confirmation)', () => {
    it('executes check_affordability immediately and returns the verdict in actionResult', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'conv-1', userId: 'owner-1', accountId: 'acc-1', isShared: false, messages: [] });
      deps.prisma.accountMember.findMany.mockResolvedValue([{ userId: 'owner-1', user: { name: 'Alice' } }]);
      deps.prisma.user.findUnique.mockResolvedValue({ aiResponseMode: 'balanced', aiModel: null, name: 'Alice', currencyCode: 'USD' });
      const mockVerdict = {
        affordable: true,
        amount: 50,
        currencyCode: 'USD',
        amountInBase: 50,
        safeToSpendToday: 120,
        reasonCode: 'within_safe',
        baseCurrency: 'USD',
      };
      deps.aiTools.isWriteAction = jest.fn().mockReturnValue(false);
      deps.aiTools.executeWithCache = jest.fn().mockResolvedValue({
        actionType: 'check_affordability',
        success: true,
        data: mockVerdict,
      });
      mockChatCreate
        .mockResolvedValueOnce({
          choices: [{ message: { tool_calls: [{ id: 'tc1', function: { name: 'check_affordability', arguments: '{"amount":50,"currencyCode":"USD","description":"shoes"}' } }] } }],
          usage: { total_tokens: 10 },
        })
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'Yes, you can afford $50 shoes — within your safe daily budget.' } }],
          usage: { total_tokens: 8 },
        });

      const res = await service.chat('owner-1', 'can I afford $50 shoes?', 'conv-1', 'acc-1', 'Personal', 'owner', 'Alice', []);
      expect(res.aiResponded).toBe(true);
      expect(deps.aiTools.executeWithCache).toHaveBeenCalledWith(
        'check_affordability',
        expect.any(Object),
        'acc-1',
        'owner-1',
        expect.any(String),
      );
      // Must NOT have called executeAction for a write confirmation
      expect(deps.prisma.chatMessage.create).toHaveBeenCalled();
    });
  });

  describe('remove_from_shopping_list (immediate write, no confirmation)', () => {
    it('executes immediately via executeAction and never routes through the write-confirmation path', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'conv-1', userId: 'owner-1', accountId: 'acc-1', isShared: false, messages: [] });
      deps.prisma.accountMember.findMany.mockResolvedValue([{ userId: 'owner-1', user: { name: 'Alice' } }]);
      deps.prisma.user.findUnique.mockResolvedValue({ aiResponseMode: 'balanced', aiModel: null, name: 'Alice', currencyCode: 'USD' });
      deps.aiTools.isWriteAction = jest.fn().mockReturnValue(false);
      deps.aiTools.executeAction = jest.fn().mockResolvedValue({
        actionType: 'remove_from_shopping_list',
        success: true,
        data: { removedLabels: ['Milk'], notFoundLabels: [] },
      });
      mockChatCreate.mockResolvedValueOnce({
        choices: [{ message: { tool_calls: [{ id: 'tc1', function: { name: 'remove_from_shopping_list', arguments: '{"items":["Milk"]}' } }] } }],
        usage: { total_tokens: 10 },
      });

      const res = await service.chat('owner-1', 'remove milk from my list', 'conv-1', 'acc-1', 'Personal', 'owner', 'Alice', []);
      expect(res.aiResponded).toBe(true);
      expect(deps.aiTools.executeAction).toHaveBeenCalledWith('remove_from_shopping_list', { items: ['Milk'] }, 'acc-1', 'owner-1');
      // A single tool round-trip only — no second (narration) OpenAI call like handleReadAction does.
      expect(mockChatCreate).toHaveBeenCalledTimes(1);
      expect(deps.prisma.chatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ content: 'removed Milk notFound ' }) }),
      );
    });
  });

  describe('get_shopping_suggestions (read action, falls through to generic read path)', () => {
    it('executes via executeWithCache like other read actions, no dedicated branch', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'conv-1', userId: 'owner-1', accountId: 'acc-1', isShared: false, messages: [] });
      deps.prisma.accountMember.findMany.mockResolvedValue([{ userId: 'owner-1', user: { name: 'Alice' } }]);
      deps.prisma.user.findUnique.mockResolvedValue({ aiResponseMode: 'balanced', aiModel: null, name: 'Alice', currencyCode: 'USD' });
      deps.aiTools.isWriteAction = jest.fn().mockReturnValue(false);
      deps.aiTools.executeWithCache = jest.fn().mockResolvedValue({
        actionType: 'get_shopping_suggestions',
        success: true,
        data: { restock: [], deals: [] },
      });
      mockChatCreate
        .mockResolvedValueOnce({
          choices: [{ message: { tool_calls: [{ id: 'tc1', function: { name: 'get_shopping_suggestions', arguments: '{}' } }] } }],
          usage: { total_tokens: 10 },
        })
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'You are not running low on anything right now.' } }],
          usage: { total_tokens: 8 },
        });

      const res = await service.chat('owner-1', 'what am I running low on?', 'conv-1', 'acc-1', 'Personal', 'owner', 'Alice', []);
      expect(res.aiResponded).toBe(true);
      expect(deps.aiTools.executeWithCache).toHaveBeenCalledWith(
        'get_shopping_suggestions',
        expect.any(Object),
        'acc-1',
        'owner-1',
        expect.any(String),
      );
    });
  });

  describe('chat() isShared on create', () => {
    it('creates a shared conversation when an owner sets isShared on first message', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue(null);
      deps.prisma.chatConversation.create.mockResolvedValue({ id: 'new-1', userId: 'owner-1', accountId: 'acc-1', isShared: true, messages: [] });
      deps.prisma.accountMember.findMany.mockResolvedValue([{ userId: 'owner-1', user: { name: 'Alice' } }]);
      mockChatCreate.mockResolvedValue({ choices: [{ message: { content: 'Hi' } }], usage: { total_tokens: 1 } });
      await service.chat('owner-1', 'hello', undefined, 'acc-1', 'Family', 'owner', 'Alice', [], true);
      expect(deps.prisma.chatConversation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isShared: true }) }));
    });
    it('creates a shared conversation when a non-owner member sets isShared', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue(null);
      deps.prisma.chatConversation.create.mockResolvedValue({ id: 'new-2', userId: 'bob-1', accountId: 'acc-1', isShared: true, messages: [] });
      deps.prisma.accountMember.findMany.mockResolvedValue([{ userId: 'bob-1', user: { name: 'Bob' } }]);
      mockChatCreate.mockResolvedValue({ choices: [{ message: { content: 'Hi' } }], usage: { total_tokens: 1 } });
      await service.chat('bob-1', 'hello', undefined, 'acc-1', 'Family', 'editor', 'Bob', [], true);
      expect(deps.prisma.chatConversation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isShared: true }) }));
    });
  });

  describe('semanticFilterExpenses (index-based matching)', () => {
    // Mirrors the real prod failure: keyword "пиво" over a list where the only match is
    // the English "Beer" row. The model returns the line NUMBER, not a UUID.
    const list = [
      { id: 'e1', description: 'Milk', merchant: null, category: 'Groceries', amount: 3, currencyCode: 'PLN' },
      { id: 'e2', description: 'Beer', merchant: null, category: 'Groceries', amount: 8, currencyCode: 'PLN' },
      { id: 'e3', description: 'Bread', merchant: null, category: 'Groceries', amount: 5, currencyCode: 'PLN' },
    ];

    it('maps model line-indices back to the correct expense IDs (cross-language)', async () => {
      mockChatCreate.mockResolvedValueOnce({ choices: [{ message: { content: '{"indices":[2]}' } }] });
      const ids = await (service as any).semanticFilterExpenses(list, 'пиво');
      expect([...ids]).toEqual(['e2']);
    });

    it('unions deterministic substring matches even when the model returns none', async () => {
      const withNetflix = [
        { id: 'a', description: 'lunch', merchant: 'Netflix', category: null, amount: 40, currencyCode: 'PLN' },
        { id: 'b', description: 'coffee', merchant: null, category: null, amount: 12, currencyCode: 'PLN' },
      ];
      mockChatCreate.mockResolvedValueOnce({ choices: [{ message: { content: '{"indices":[]}' } }] });
      const ids = await (service as any).semanticFilterExpenses(withNetflix, 'netflix');
      expect([...ids]).toEqual(['a']);
    });

    it('degrades to deterministic-only on model failure — never returns everything', async () => {
      mockChatCreate.mockRejectedValueOnce(new Error('boom'));
      // "пиво" has no substring match in the English list → empty, NOT all three ids.
      const ids = await (service as any).semanticFilterExpenses(list, 'пиво');
      expect(ids.size).toBe(0);
    });

    it('ignores hallucinated out-of-range indices', async () => {
      mockChatCreate.mockResolvedValueOnce({ choices: [{ message: { content: '{"indices":[2,99,0]}' } }] });
      const ids = await (service as any).semanticFilterExpenses(list, 'beer');
      expect([...ids]).toEqual(['e2']); // 99 and 0 discarded; 2 → e2 (also a substring hit)
    });
  });
});
