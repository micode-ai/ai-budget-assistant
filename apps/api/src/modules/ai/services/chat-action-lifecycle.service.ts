import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';
import { resolveCheapModel } from './model-resolver';
import { AiToolsService } from './ai-tools.service';
import { PromptBuilder } from './prompt-builder.service';
import { logCacheUsage } from '../utils/log-cache-usage';
import type { ChatActionType, ChatActionResult, ChatPendingAction, UndoLastActionData } from '@budget/shared-types';

// The 5 write types docs/product-ideas/chat-undo-last-action.md scopes "undo" to. create_budget
// and create_category are deliberately excluded — no clean single-row revert for either, and the
// sketch this feature was built from names exactly these 5.
const UNDOABLE_ACTION_TYPES = new Set<ChatActionType>([
  'create_expense',
  'create_income',
  'create_debt',
  'record_debt_repayment',
  'update_goal_balance',
]);

// Top of the product idea's "10-15 minutes" window — a stale undo reaching back through several
// turns risks reverting something the user has already built on top of.
const UNDO_WINDOW_MS = 15 * 60 * 1000;

type UndoLookup =
  | { status: 'ok'; messageId: string; actionType: ChatActionType; result: ChatActionResult }
  | { status: 'nothing' | 'stale' };

@Injectable()
export class ChatActionLifecycleService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(ChatActionLifecycleService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly promptBuilder: PromptBuilder,
    private readonly aiToolsService: AiToolsService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
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

    // A successful undo must stamp its SOURCE action_executed message so a second "undo" can't
    // re-fire the same write — findLastUndoableAction refuses any row carrying `undoneAt`.
    // Best-effort: a malformed/already-modified source message must not roll back the undo that
    // already happened, so a parse failure here is swallowed, not thrown.
    if (pendingData.actionType === 'undo_last_action' && result.success) {
      const sourceMessageId = String((pendingData.data as Record<string, unknown>)?.sourceMessageId || '');
      if (sourceMessageId) {
        try {
          const sourceMsg = await this.prisma.chatMessage.findUnique({ where: { id: sourceMessageId } });
          if (sourceMsg) {
            const sourceParsed = JSON.parse(sourceMsg.content);
            await this.prisma.chatMessage.update({
              where: { id: sourceMessageId },
              data: { content: JSON.stringify({ ...sourceParsed, undoneAt: new Date().toISOString() }) },
            });
          }
        } catch (err) {
          this.logger.warn(`[ai/chat] failed to stamp undoneAt on source message ${sourceMessageId}: ${err}`);
        }
      }
    }

    const lang = await this.detectConversationLanguage(conversationId);

    const confirmText = result.success
      ? (pendingData.actionType === 'undo_last_action'
          ? this.promptBuilder.getUndoConfirmText(lang, result.data || {})
          : this.promptBuilder.getConfirmText(lang, this.promptBuilder.buildActionSummary(pendingData.actionType, pendingData.data as Record<string, unknown>, lang)))
      : this.promptBuilder.getFailText(lang, result.errorMessage);

    const assistantMsg = await this.prisma.chatMessage.create({
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
      assistantMessageId: assistantMsg.id,
      assistantCreatedAt: assistantMsg.createdAt.toISOString(),
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
    const assistantMsg = await this.prisma.chatMessage.create({
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
      assistantMessageId: assistantMsg.id,
      assistantCreatedAt: assistantMsg.createdAt.toISOString(),
    };
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

  /**
   * Resolves "the single most recent write in this conversation" from the persisted
   * `action_executed` ChatMessage rows chat() already writes for every confirmed write — no
   * schema change needed. Only ever looks at the SINGLE latest row: if it's already undone,
   * unsupported, or failed, there is nothing undoable, even if an earlier row would qualify —
   * "only the single most recent write is undoable" per the product idea.
   */
  private async findLastUndoableAction(conversationId: string): Promise<UndoLookup> {
    const last = await this.prisma.chatMessage.findFirst({
      where: { conversationId, role: 'action_executed' },
      orderBy: { createdAt: 'desc' },
    });
    if (!last) return { status: 'nothing' };

    let parsed: (ChatPendingAction & { result?: ChatActionResult; undoneAt?: string }) | undefined;
    try {
      parsed = JSON.parse(last.content);
    } catch {
      return { status: 'nothing' };
    }
    if (!parsed || parsed.undoneAt || !parsed.result?.success) return { status: 'nothing' };
    if (!UNDOABLE_ACTION_TYPES.has(parsed.actionType)) return { status: 'nothing' };

    const ageMs = Date.now() - last.createdAt.getTime();
    if (ageMs > UNDO_WINDOW_MS) return { status: 'stale' };

    return { status: 'ok', messageId: last.id, actionType: parsed.actionType, result: parsed.result };
  }

  async handleUndoLastActionRequest(
    conversation: { id: string },
    systemPrompt: string,
    history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    userMessage: string,
    aiModel: string,
    accountId: string | undefined,
    userId: string,
    uiLanguage?: string | null,
  ) {
    const lookup = await this.findLastUndoableAction(conversation.id);

    if (lookup.status !== 'ok') {
      const lang = this.promptBuilder.detectUserLanguage(userMessage, history, uiLanguage);
      const text = this.promptBuilder.getUndoUnavailableText(lang, lookup.status);
      const assistantMsg = await this.prisma.chatMessage.create({
        data: { conversationId: conversation.id, role: 'assistant', content: text, mentionedUserIds: [] },
      });
      return {
        message: text,
        conversationId: conversation.id,
        assistantMessageId: assistantMsg.id,
        assistantCreatedAt: assistantMsg.createdAt.toISOString(),
      };
    }

    const od = lookup.result.data || {};
    const undoArgs: UndoLastActionData = {
      sourceMessageId: lookup.messageId,
      originalActionType: lookup.actionType,
      originalResultData: od,
      // Flattened purely so ActionConfirmationCard's existing generic detail rows render for
      // this action too — see the shared-types contract. Server logic reads originalResultData.
      amount: typeof od.amount === 'number' ? od.amount : undefined,
      currencyCode: typeof od.currencyCode === 'string' ? (od.currencyCode as UndoLastActionData['currencyCode']) : undefined,
      categoryName: typeof od.category === 'string' ? od.category : undefined,
      date: typeof od.date === 'string' ? od.date : undefined,
      description: typeof od.description === 'string' ? od.description : undefined,
    };

    return this.handleWriteActionRequest(
      conversation,
      'undo_last_action',
      undoArgs as unknown as Record<string, unknown>,
      systemPrompt,
      history,
      userMessage,
      aiModel,
      accountId,
      userId,
    );
  }

  async handleWriteActionRequest(
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

    logCacheUsage(this.logger, 'chat-confirm', confirmResponse.usage);

    const confirmMessage = confirmResponse.choices[0]?.message?.content || `I'd like to ${displaySummary}. Please confirm or cancel this action.`;

    const confirmMsg = await this.prisma.chatMessage.create({
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
      assistantMessageId: confirmMsg.id,
      assistantCreatedAt: confirmMsg.createdAt.toISOString(),
    };
  }
}
