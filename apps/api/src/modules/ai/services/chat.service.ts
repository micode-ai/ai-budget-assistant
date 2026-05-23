import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';
import { AiResponseMode } from './response-mode.helper';
import { resolveAiModel, resolveCheapModel } from './model-resolver';
import { UserContextBuilder } from './user-context-builder.service';
import { AiToolsService } from './ai-tools.service';
import { PromptBuilder } from './prompt-builder.service';
import type { ChatActionType, ChatPendingAction } from '@budget/shared-types';

interface ChatMessageRecord {
  role: string;
  content: string;
}

@Injectable()
export class ChatService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
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

  async chat(userId: string, message: string, conversationId?: string, accountId?: string, accountName?: string | null) {
    const encryptionTier = await this.getEncryptionTier(accountId);
    if (encryptionTier >= 2) {
      return {
        message: 'AI chat is unavailable for this account because end-to-end encryption (full mode) is enabled. Financial data is encrypted and cannot be analyzed server-side.',
        conversationId: conversationId || null,
        encryptionRestricted: true,
      };
    }

    let conversation;
    if (conversationId) {
      conversation = await this.prisma.chatConversation.findUnique({
        where: { id: conversationId, userId },
        include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
      });
    }

    if (!conversation) {
      conversation = await this.prisma.chatConversation.create({
        data: {
          userId,
          title: message.slice(0, 100),
        },
        include: { messages: true },
      });
    }

    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: message,
      },
    });

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { aiResponseMode: true, aiModel: true } });
    const responseMode = (user?.aiResponseMode as AiResponseMode) || 'balanced';
    const { model: aiModel } = resolveAiModel(user?.aiModel);
    const context = await this.userContextBuilder.build(userId, accountId);

    const history = conversation.messages
      .filter((m: ChatMessageRecord) => ['user', 'assistant', 'system'].includes(m.role))
      .map((m: ChatMessageRecord) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      }));

    const systemPrompt = this.promptBuilder.buildSystemPrompt(context, encryptionTier, responseMode, message, history, accountName);

    const response = await this.openai.chat.completions.create({
      model: aiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message },
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
      try {
        functionArgs = JSON.parse(toolCall.function.arguments);
      } catch {
        functionArgs = {};
      }

      if (this.aiToolsService.isWriteAction(functionName)) {
        return this.handleWriteActionRequest(
          conversation, functionName, functionArgs, systemPrompt, history, message, aiModel, accountId,
        );
      } else {
        return this.handleReadAction(
          conversation, functionName, functionArgs, toolCall, systemPrompt, history, message, accountId,
        );
      }
    }

    const assistantMessage = choice?.message?.content || 'I apologize, but I could not generate a response.';
    const tokensUsed = response.usage?.total_tokens || 0;

    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: assistantMessage,
        tokensUsed,
      },
    });

    return {
      message: assistantMessage,
      conversationId: conversation.id,
    };
  }

  async confirmAction(userId: string, conversationId: string, actionId: string, accountId?: string) {
    const pendingMessage = await this.prisma.chatMessage.findFirst({
      where: {
        conversationId,
        role: 'pending_action',
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
      },
    });

    return {
      message: confirmText,
      conversationId,
      actionResult: result,
    };
  }

  async rejectAction(userId: string, conversationId: string, actionId: string, reason?: string) {
    const pendingMessage = await this.prisma.chatMessage.findFirst({
      where: {
        conversationId,
        role: 'pending_action',
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
      },
    });

    return {
      message: rejectText,
      conversationId,
    };
  }

  async getConversations(userId: string) {
    const conversations = await this.prisma.chatConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
    return conversations;
  }

  async getConversationMessages(userId: string, conversationId: string) {
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId, userId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    const messages = await this.prisma.chatMessage.findMany({
      where: {
        conversationId,
        role: { in: ['user', 'assistant'] },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: { id: true, conversationId: true, role: true, content: true, tokensUsed: true, createdAt: true },
    });
    return messages;
  }

  private async detectConversationLanguage(conversationId: string): Promise<string> {
    const recentMessages = await this.prisma.chatMessage.findMany({
      where: { conversationId, role: 'user' },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { content: true },
    });
    if (recentMessages.length === 0) return 'English';
    const allText = recentMessages.map(m => m.content).join(' ');
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
      },
    });

    return {
      message: summaryText,
      conversationId: conversation.id,
      actionResult: result,
    };
  }
}
