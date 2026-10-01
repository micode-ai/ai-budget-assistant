import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../database/prisma.service';
import { AiToolsService } from './ai-tools.service';
import { PromptBuilder } from './prompt-builder.service';
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

// How long a queued write action stays confirmable. Matches the Redis TTL the Telegram and
// WhatsApp bots use for their pending actions (1800s), so every channel expires at the same age.
export const PENDING_ACTION_TTL_SEC = 1800;

type UndoLookup =
  | { status: 'ok'; messageId: string; actionType: ChatActionType; result: ChatActionResult }
  | { status: 'nothing' | 'stale' };

@Injectable()
export class ChatActionLifecycleService {
  private readonly logger = new Logger(ChatActionLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly promptBuilder: PromptBuilder,
    private readonly aiToolsService: AiToolsService,
  ) {}

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
    // Pending actions are ChatMessage rows with no TTL of their own — enforce the expiry here.
    // (rejectAction deliberately skips this: dropping a stale action is harmless.)
    if (Date.now() - new Date(pendingMessage.createdAt).getTime() > PENDING_ACTION_TTL_SEC * 1000) {
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

    const lang = await this.detectConversationLanguage(conversationId, userId);

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

    const lang = await this.detectConversationLanguage(conversationId, userId);
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

  /**
   * Same tiers as the chat reply (detectUserLanguage): the recent messages'
   * script first, then the user's app UI locale for plain-ASCII text — so a
   * French user typing without accents gets French confirmations too.
   */
  private async detectConversationLanguage(conversationId: string, userId: string): Promise<string> {
    const [recentMessages, user] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where: { conversationId, role: 'user' },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { content: true },
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { language: true } }),
    ]);
    const allText = recentMessages.map((m: { content: string }) => m.content).join(' ');
    return this.promptBuilder.detectUserLanguage(allText, [], user?.language);
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
      uiLanguage,
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
    uiLanguage?: string | null,
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

    // Deterministic per-language prompt built from the summary — the confirmation card carries
    // the details, so no model call is needed just to phrase "please confirm or cancel".
    const lang = this.promptBuilder.detectUserLanguage(userMessage, history, uiLanguage);
    const confirmMessage = this.promptBuilder.getConfirmPromptText(lang, this.promptBuilder.buildActionSummary(actionType, args, lang));

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
