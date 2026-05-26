import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';
import { CacheService } from '../../../common/cache/cache.service';
import { NotificationsService } from '../../notifications/notifications.service';
import * as ni18n from '../../notifications/notification-i18n';
import { AiResponseMode } from './response-mode.helper';
import { resolveAiModel, resolveCheapModel } from './model-resolver';
import { UserContextBuilder } from './user-context-builder.service';
import { AiToolsService } from './ai-tools.service';
import { PromptBuilder } from './prompt-builder.service';
import type { ChatActionType, ChatPendingAction } from '@budget/shared-types';

interface ChatMessageRecord {
  role: string;
  content: string;
  senderUserId?: string | null;
}

@Injectable()
export class ChatService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly notifications: NotificationsService,
    private readonly userContextBuilder: UserContextBuilder,
    private readonly aiToolsService: AiToolsService,
    private readonly promptBuilder: PromptBuilder,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  private logCacheUsage(label: string, usage: OpenAI.Completions.CompletionUsage | undefined): void {
    if (!usage) return;
    const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
    const total = usage.prompt_tokens ?? 0;
    const ratio = total > 0 ? (cached / total).toFixed(2) : '0.00';
    this.logger.log(`[ai/${label}] prompt_tokens=${total} cached_tokens=${cached} hit_ratio=${ratio}`);
  }

  private async getEncryptionTier(accountId?: string): Promise<number> {
    if (!accountId) return 0;
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { encryptionTier: true },
    });
    return account?.encryptionTier ?? 0;
  }

  private presenceKey(conversationId: string, userId: string): string {
    return `chat:presence:${conversationId}:${userId}`;
  }

  async touchPresence(conversationId: string, userId: string): Promise<void> {
    await this.cache.set(this.presenceKey(conversationId, userId), new Date().toISOString(), 45);
  }

  async isPresent(conversationId: string, userId: string): Promise<boolean> {
    return (await this.cache.get<string>(this.presenceKey(conversationId, userId))) !== null;
  }

  private sanitizeName(name: string | null | undefined): string {
    return (name ?? 'Someone').replace(/[\r\n]+/g, ' ').trim().slice(0, 40) || 'Someone';
  }

  async chat(
    userId: string,
    message: string,
    conversationId?: string,
    accountId?: string,
    accountName?: string | null,
    accountRole?: string,
    userName?: string | null,
    mentions?: Array<{ userId: string }>,
    initialIsShared?: boolean,
  ) {
    const encryptionTier = await this.getEncryptionTier(accountId);
    if (encryptionTier >= 2) {
      return {
        message: 'AI chat is unavailable for this account because end-to-end encryption (full mode) is enabled. Financial data is encrypted and cannot be analyzed server-side.',
        conversationId: conversationId || null,
        aiResponded: false,
        encryptionRestricted: true,
      };
    }

    let conversation: any = null;
    if (conversationId) {
      conversation = await this.prisma.chatConversation.findFirst({
        where: { id: conversationId, accountId, OR: [{ isShared: true }, { userId }] },
        include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
      });
    }
    if (!conversation) {
      conversation = await this.prisma.chatConversation.create({
        data: { userId, accountId: accountId ?? null, isShared: accountRole === 'owner' && !!initialIsShared, title: message.slice(0, 100) },
        include: { messages: true },
      });
    }

    const members = accountId
      ? await this.prisma.accountMember.findMany({ where: { accountId }, select: { userId: true, user: { select: { name: true } } } })
      : [];
    const nameByUserId = new Map<string, string>(members.map((m: any) => [m.userId, m.user?.name ?? 'Someone']));
    const memberIds = new Set<string>(members.map((m: any) => m.userId));

    const mentionedUserIds = (mentions ?? [])
      .map((m) => m.userId)
      .filter((id) => memberIds.has(id) && id !== userId);

    const userMsg = await this.prisma.chatMessage.create({
      data: { conversationId: conversation.id, role: 'user', content: message, senderUserId: userId, mentionedUserIds },
    });

    if (conversation.isShared && mentionedUserIds.length > 0) {
      const senderName = userName || nameByUserId.get(userId) || 'Someone';
      const preview = message.length > 120 ? message.slice(0, 120) + '…' : message;
      await Promise.allSettled(
        mentionedUserIds.map(async (mid) => {
          if (await this.isPresent(conversation.id, mid)) return;
          await this.notifications.sendToUser(
            mid,
            (lang) => ni18n.chatMentionTitle(lang, { senderName, preview }),
            (lang) => ni18n.chatMentionBody(lang, { senderName, preview }),
            { conversationId: conversation.id, accountId },
            'chat_mention',
          );
        }),
      );
      await this.prisma.chatConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
      return {
        message: '',
        conversationId: conversation.id,
        aiResponded: false,
        userMessageId: userMsg.id,
        userMessageCreatedAt: userMsg.createdAt.toISOString(),
      };
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { aiResponseMode: true, aiModel: true } });
    const responseMode = (user?.aiResponseMode as AiResponseMode) || 'balanced';
    const { model: aiModel } = resolveAiModel(user?.aiModel);
    const context = await this.userContextBuilder.build(userId, accountId);

    const prefix = (m: ChatMessageRecord) =>
      conversation.isShared && m.role === 'user' && m.senderUserId
        ? `[${this.sanitizeName(nameByUserId.get(m.senderUserId))}]: `
        : '';

    const history = conversation.messages
      .filter((m: ChatMessageRecord) => ['user', 'assistant', 'system'].includes(m.role))
      .map((m: ChatMessageRecord) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: `${prefix(m)}${m.content}`,
      }));

    const currentUserContent = conversation.isShared
      ? `[${this.sanitizeName(userName || nameByUserId.get(userId))}]: ${message}`
      : message;

    const systemPrompt = this.promptBuilder.buildSystemPrompt(context, encryptionTier, responseMode, message, history, accountName);

    const response = await this.openai.chat.completions.create({
      model: aiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: currentUserContent },
      ],
      tools: this.aiToolsService.getToolDefinitions(),
      tool_choice: 'auto',
      max_tokens: 1000,
    });

    this.logCacheUsage('chat', response.usage);
    const choice = response.choices[0];

    if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
      const toolCall = choice.message.tool_calls[0];
      const functionName = toolCall.function.name as ChatActionType;
      let functionArgs: Record<string, unknown>;
      try { functionArgs = JSON.parse(toolCall.function.arguments); } catch { functionArgs = {}; }

      if (this.aiToolsService.isWriteAction(functionName)) {
        const r = await this.handleWriteActionRequest(conversation, functionName, functionArgs, systemPrompt, history, message, aiModel, accountId, userId);
        return { ...r, aiResponded: true, userMessageId: userMsg.id, userMessageCreatedAt: userMsg.createdAt.toISOString() };
      }
      const r = await this.handleReadAction(conversation, functionName, functionArgs, toolCall, systemPrompt, history, message, accountId);
      return { ...r, aiResponded: true, userMessageId: userMsg.id, userMessageCreatedAt: userMsg.createdAt.toISOString() };
    }

    const assistantMessage = choice?.message?.content || 'I apologize, but I could not generate a response.';
    const tokensUsed = response.usage?.total_tokens || 0;
    const assistantMsg = await this.prisma.chatMessage.create({
      data: { conversationId: conversation.id, role: 'assistant', content: assistantMessage, tokensUsed, mentionedUserIds: [] },
    });

    return {
      message: assistantMessage,
      conversationId: conversation.id,
      aiResponded: true,
      userMessageId: userMsg.id,
      userMessageCreatedAt: userMsg.createdAt.toISOString(),
      assistantMessageId: assistantMsg.id,
      assistantCreatedAt: assistantMsg.createdAt.toISOString(),
    };
  }

  async confirmAction(userId: string, conversationId: string, actionId: string, accountId?: string) {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: { id: conversationId, accountId, OR: [{ isShared: true }, { userId }] },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const pendingMessage = await this.prisma.chatMessage.findFirst({
      where: {
        conversationId,
        role: 'pending_action',
        senderUserId: userId,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!pendingMessage) {
      throw new NotFoundException('Pending action not found or expired');
    }

    const pendingData = JSON.parse(pendingMessage.content) as ChatPendingAction & { accountId?: string };
    if (pendingData.id !== actionId) {
      throw new NotFoundException('Pending action not found');
    }

    const effectiveAccountId = pendingData.accountId || accountId || '';

    const result = await this.aiToolsService.executeAction(
      pendingData.actionType,
      pendingData.data as Record<string, unknown>,
      effectiveAccountId,
      userId,
    );

    await this.prisma.chatMessage.update({
      where: { id: pendingMessage.id },
      data: {
        role: 'action_executed',
        content: JSON.stringify({ ...pendingData, status: 'executed', result }),
      },
    });

    const lang = await this.detectConversationLanguage(conversationId);
    const localizedSummary = this.promptBuilder.buildActionSummary(
      pendingData.actionType,
      pendingData.data as Record<string, unknown>,
      lang,
    );

    const confirmText = result.success
      ? this.promptBuilder.getConfirmText(lang, localizedSummary)
      : this.promptBuilder.getFailText(lang, result.errorMessage);

    await this.prisma.chatMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        content: confirmText,
        mentionedUserIds: [],
      },
    });

    return {
      message: confirmText,
      conversationId,
      actionResult: result,
    };
  }

  async rejectAction(userId: string, conversationId: string, actionId: string, reason?: string, accountId?: string) {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: { id: conversationId, accountId, OR: [{ isShared: true }, { userId }] },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const pendingMessage = await this.prisma.chatMessage.findFirst({
      where: {
        conversationId,
        role: 'pending_action',
        senderUserId: userId,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!pendingMessage) {
      throw new NotFoundException('Pending action not found');
    }

    const pendingData = JSON.parse(pendingMessage.content) as ChatPendingAction;
    if (pendingData.id !== actionId) {
      throw new NotFoundException('Pending action not found');
    }

    await this.prisma.chatMessage.update({
      where: { id: pendingMessage.id },
      data: {
        role: 'action_rejected',
        content: JSON.stringify({ ...pendingData, status: 'rejected', reason }),
      },
    });

    const lang = await this.detectConversationLanguage(conversationId);
    const rejectText = this.promptBuilder.getRejectText(lang);
    await this.prisma.chatMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        content: rejectText,
        mentionedUserIds: [],
      },
    });

    return {
      message: rejectText,
      conversationId,
    };
  }

  async getConversations(userId: string, accountId?: string) {
    const conversations = await this.prisma.chatConversation.findMany({
      where: { accountId, OR: [{ isShared: true }, { userId }] },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: { id: true, title: true, isShared: true, userId: true, createdAt: true, updatedAt: true },
    });
    return conversations.map((c: any) => ({
      id: c.id,
      title: c.title,
      isShared: c.isShared,
      isOwner: c.userId === userId,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async getConversationMessages(userId: string, conversationId: string, accountId?: string, since?: string) {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: { id: conversationId, accountId, OR: [{ isShared: true }, { userId }] },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const members = accountId
      ? await this.prisma.accountMember.findMany({ where: { accountId }, select: { userId: true, user: { select: { name: true } } } })
      : [];
    const nameByUserId = new Map<string, string | null>(members.map((m: any) => [m.userId, m.user?.name ?? null]));

    const sinceDate = since ? new Date(since) : null;
    const validSince = sinceDate && !Number.isNaN(sinceDate.getTime()) ? sinceDate : null;

    const messages = await this.prisma.chatMessage.findMany({
      where: {
        conversationId,
        role: { in: ['user', 'assistant'] },
        ...(validSince ? { createdAt: { gt: validSince } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: { id: true, conversationId: true, role: true, content: true, senderUserId: true, mentionedUserIds: true, tokensUsed: true, createdAt: true },
    });

    return messages.map((m: any) => ({
      ...m,
      senderName: m.senderUserId ? nameByUserId.get(m.senderUserId) ?? null : null,
    }));
  }

  async setConversationShared(userId: string, conversationId: string, accountId: string | undefined, accountRole: string | undefined, isShared: boolean) {
    if (accountRole !== 'owner') {
      throw new ForbiddenException('Only the account owner can change sharing');
    }
    const conversation = await this.prisma.chatConversation.findFirst({ where: { id: conversationId, accountId } });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    const updated = await this.prisma.chatConversation.update({ where: { id: conversationId, accountId }, data: { isShared } });
    return { id: updated.id, isShared: updated.isShared };
  }

  async pollMessages(userId: string, conversationId: string, accountId: string | undefined, since?: string) {
    await this.touchPresence(conversationId, userId);
    return this.getConversationMessages(userId, conversationId, accountId, since);
  }

  private async detectConversationLanguage(conversationId: string): Promise<string> {
    const recentMessages = await this.prisma.chatMessage.findMany({
      where: { conversationId, role: 'user' },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { content: true },
    });
    if (recentMessages.length === 0) return 'English';
    const allText = recentMessages.map((m: { content: string }) => m.content).join(' ');
    return this.promptBuilder.detectLanguage(allText);
  }

  private async handleWriteActionRequest(
    conversation: { id: string },
    actionType: ChatActionType,
    args: Record<string, unknown>,
    systemPrompt: string,
    history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    userMessage: string,
    aiModel: string,
    accountId?: string,
    userId?: string,
  ) {
    const displaySummary = this.promptBuilder.buildActionSummary(actionType, args);
    const pendingAction: ChatPendingAction = {
      id: randomUUID(),
      actionType,
      data: args as any,
      displaySummary,
    };

    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'pending_action',
        content: JSON.stringify({ ...pendingAction, accountId }),
        senderUserId: userId,
        mentionedUserIds: [],
      },
    });

    const confirmationSystemPrompt = `${systemPrompt}\n\nThe user wants to perform this action: ${displaySummary}. Generate a SHORT confirmation message (1-2 sentences max) asking them to confirm or cancel. Format: "I'd like to [action]. Please confirm or cancel." Use the SAME language as the conversation.`;

    const confirmResponse = await this.openai.chat.completions.create({
      // Confirmation rendering is single-language formatting — no reasoning
      // needed, so we always use the cheap model regardless of user preference.
      model: resolveCheapModel(),
      messages: [
        { role: 'system', content: confirmationSystemPrompt },
        ...history,
        { role: 'user', content: userMessage },
      ],
      max_tokens: 150,
    });

    this.logCacheUsage('chat-confirm', confirmResponse.usage);

    const confirmMessage = confirmResponse.choices[0]?.message?.content || `I'd like to ${displaySummary}. Please confirm or cancel this action.`;

    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: confirmMessage,
        mentionedUserIds: [],
      },
    });

    return {
      message: confirmMessage,
      conversationId: conversation.id,
      pendingAction,
    };
  }

  private async handleReadAction(
    conversation: { id: string },
    actionType: ChatActionType,
    args: Record<string, unknown>,
    toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
    systemPrompt: string,
    history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    userMessage: string,
    accountId?: string,
  ) {
    const result = await this.aiToolsService.executeWithCache(actionType, args, accountId || '', '');

    const toolResultJson = JSON.stringify(result.data || {});
    const followUpResponse = await this.openai.chat.completions.create({
      // Read-action follow-up just narrates structured data into prose — use the cheap model.
      model: resolveCheapModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userMessage },
        {
          role: 'assistant',
          content: null,
          tool_calls: [toolCall],
        } as any,
        {
          role: 'tool',
          tool_call_id: toolCall.id,
          content: `IMPORTANT: Present ONLY these exact numbers to the user. Do NOT modify, round, or estimate any values.\n\n${toolResultJson}`,
        },
      ],
      temperature: 0,
      max_tokens: 1000,
    });

    this.logCacheUsage('chat-readaction', followUpResponse.usage);

    const summaryText = followUpResponse.choices[0]?.message?.content || 'Here are your results.';
    const tokensUsed = followUpResponse.usage?.total_tokens || 0;

    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: summaryText,
        tokensUsed,
        mentionedUserIds: [],
      },
    });

    return {
      message: summaryText,
      conversationId: conversation.id,
      actionResult: result,
    };
  }
}
