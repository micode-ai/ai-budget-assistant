import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { PrismaService } from '../../../database/prisma.service';
import { CacheService } from '../../../common/cache/cache.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { UserContextBuilder } from './user-context-builder.service';
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
    account: { findUnique: jest.fn().mockResolvedValue({ encryptionTier: 0 }) },
    chatConversation: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    chatMessage: { create: jest.fn().mockResolvedValue({ id: 'm1', createdAt: new Date('2026-05-25T10:00:00Z') }), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue({ aiResponseMode: 'balanced', aiModel: null, name: 'Alice' }) },
    accountMember: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() };
  const notifications = { sendToUser: jest.fn() };
  return { prisma, cache, notifications };
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
        { provide: CacheService, useValue: deps.cache },
        { provide: NotificationsService, useValue: deps.notifications },
        { provide: UserContextBuilder, useValue: { build: jest.fn().mockResolvedValue({}) } },
        { provide: AiToolsService, useValue: { getToolDefinitions: () => [], isWriteAction: () => false, executeAction: jest.fn(), executeWithCache: jest.fn() } },
        { provide: PromptBuilder, useValue: { buildSystemPrompt: () => 'SYS', detectLanguage: () => 'English', buildActionSummary: () => 'summary', getConfirmText: () => 'ok', getFailText: () => 'fail', getRejectText: () => 'rejected' } },
      ],
    }).compile();
    service = moduleRef.get(ChatService);
  });

  it('touchPresence writes a TTL key', async () => {
    await service.touchPresence('conv-1', 'user-1');
    expect(deps.cache.set).toHaveBeenCalledWith('chat:presence:conv-1:user-1', expect.any(String), 45);
  });

  it('isPresent returns true only when key exists', async () => {
    deps.cache.get.mockResolvedValueOnce('2026-05-25T10:00:00Z');
    expect(await service.isPresent('conv-1', 'user-1')).toBe(true);
    deps.cache.get.mockResolvedValueOnce(null);
    expect(await service.isPresent('conv-1', 'user-2')).toBe(false);
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
      deps.cache.get.mockResolvedValue(null);
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
      deps.cache.get.mockResolvedValue('2026-05-25T10:00:00Z');
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
    });
  });

  describe('scoping', () => {
    it('lists shared + own-private conversations for the account', async () => {
      deps.prisma.chatConversation.findMany.mockResolvedValue([
        { id: 'c1', title: 'A', isShared: true, userId: 'owner-1', createdAt: new Date(), updatedAt: new Date() },
      ]);
      const res = await service.getConversations('bob-1', 'acc-1');
      expect(deps.prisma.chatConversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { accountId: 'acc-1', OR: [{ isShared: true }, { userId: 'bob-1' }] },
      }));
      expect(res[0]).toMatchObject({ id: 'c1', isShared: true, isOwner: false });
    });

    it('returns messages with resolved sender names', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'c1', accountId: 'acc-1', isShared: true, userId: 'owner-1' });
      deps.prisma.accountMember.findMany.mockResolvedValue([{ userId: 'owner-1', user: { name: 'Alice' } }]);
      deps.prisma.chatMessage.findMany.mockResolvedValue([
        { id: 'm1', conversationId: 'c1', role: 'user', content: 'hi', senderUserId: 'owner-1', mentionedUserIds: [], tokensUsed: null, createdAt: new Date() },
      ]);
      const res = await service.getConversationMessages('owner-1', 'c1', 'acc-1');
      expect(res[0]).toMatchObject({ senderUserId: 'owner-1', senderName: 'Alice' });
    });
  });

  describe('setConversationShared', () => {
    it('flips isShared for an owner', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'c1', accountId: 'acc-1', userId: 'owner-1' });
      deps.prisma.chatConversation.update.mockResolvedValue({ id: 'c1', isShared: true });
      const r = await service.setConversationShared('owner-1', 'c1', 'acc-1', 'owner', true);
      expect(deps.prisma.chatConversation.update).toHaveBeenCalledWith({ where: { id: 'c1', accountId: 'acc-1' }, data: { isShared: true } });
      expect(r.isShared).toBe(true);
    });
    it('rejects a non-owner', async () => {
      await expect(service.setConversationShared('bob-1', 'c1', 'acc-1', 'editor', true)).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFound when the conversation is not in the account', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue(null);
      await expect(service.setConversationShared('owner-1', 'c-x', 'acc-1', 'owner', true)).rejects.toThrow(NotFoundException);
    });
  });

  describe('pollMessages', () => {
    it('touches presence and returns messages since timestamp', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'c1', accountId: 'acc-1', isShared: true, userId: 'owner-1' });
      deps.prisma.accountMember.findMany.mockResolvedValue([{ userId: 'owner-1', user: { name: 'Alice' } }]);
      deps.prisma.chatMessage.findMany.mockResolvedValue([]);
      await service.pollMessages('owner-1', 'c1', 'acc-1', '2026-05-25T10:00:00Z');
      expect(deps.cache.set).toHaveBeenCalledWith('chat:presence:c1:owner-1', expect.any(String), 45);
    });
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

  describe('chat() isShared on create', () => {
    it('creates a shared conversation when an owner sets isShared on first message', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue(null);
      deps.prisma.chatConversation.create.mockResolvedValue({ id: 'new-1', userId: 'owner-1', accountId: 'acc-1', isShared: true, messages: [] });
      deps.prisma.accountMember.findMany.mockResolvedValue([{ userId: 'owner-1', user: { name: 'Alice' } }]);
      mockChatCreate.mockResolvedValue({ choices: [{ message: { content: 'Hi' } }], usage: { total_tokens: 1 } });
      await service.chat('owner-1', 'hello', undefined, 'acc-1', 'Family', 'owner', 'Alice', [], true);
      expect(deps.prisma.chatConversation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isShared: true }) }));
    });
    it('does not create a shared conversation when a non-owner sets isShared', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue(null);
      deps.prisma.chatConversation.create.mockResolvedValue({ id: 'new-2', userId: 'bob-1', accountId: 'acc-1', isShared: false, messages: [] });
      deps.prisma.accountMember.findMany.mockResolvedValue([{ userId: 'bob-1', user: { name: 'Bob' } }]);
      mockChatCreate.mockResolvedValue({ choices: [{ message: { content: 'Hi' } }], usage: { total_tokens: 1 } });
      await service.chat('bob-1', 'hello', undefined, 'acc-1', 'Family', 'editor', 'Bob', [], true);
      expect(deps.prisma.chatConversation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isShared: false }) }));
    });
  });
});
