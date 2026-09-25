import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../database/prisma.service';
import type { ChatActionResult, ChatPendingAction } from '@budget/shared-types';

/** The shape `ai-expense-tools.service.ts`'s `executeCreateExpense`/`executeCreateIncome`
 * already return as `ChatActionResult.data` for these two action types — the recorder
 * mirrors it exactly so a bot-created row parses identically to a chat-confirmed one. */
export interface RecordExternalWriteResultData {
  id: string;
  amount: number;
  currencyCode: string;
  // `| null` on these three: every one of the 9 call sites passes a just-created
  // Prisma row's own fields straight through (`description`/`category?.name` can be
  // `null`), and `.date` is the raw Prisma `Date` — JSON.stringify serializes it to
  // the same ISO string once the ChatMessage content is persisted either way.
  description?: string | null;
  category?: string | null;
  date?: string | Date | null;
}

export interface RecordExternalWriteParams {
  userId: string;
  accountId: string;
  /** The bot link's currently-tracked conversation, if any. Reused only when it still
   * belongs to `userId` — otherwise (missing, deleted, or someone else's) a fresh
   * conversation is created, exactly like `ChatService.chat()` does. */
  conversationId?: string | null;
  actionType: 'create_expense' | 'create_income';
  resultData: RecordExternalWriteResultData;
}

/**
 * Makes a bot's own direct write (receipt confirm, `/expense`, `/income` — none of
 * which go through `ChatActionLifecycleService.confirmAction`) undoable via chat's
 * `undo_last_action`, by writing the exact `action_executed` ChatMessage row shape
 * `confirmAction` writes for a chat-confirmed create_expense/create_income (ABA-599).
 *
 * Root cause: `findLastUndoableAction` (chat-action-lifecycle.service.ts) only ever
 * looks at `role: 'action_executed'` ChatMessage rows, and only `confirmAction` wrote
 * them. The bots' quick-command and receipt-confirm handlers call
 * ExpensesService/IncomesService directly and never touched a ChatMessage at all, so
 * those writes were structurally invisible to "undo" — not merely stale/expired.
 *
 * Deliberately scoped to create_expense/create_income only: those are the only two
 * write types any bot performs outside the chat pipeline. Never throws to callers —
 * every 9 call sites (photo/expense/income handlers x3 bots) treat this as a
 * fire-and-forget side effect that must never turn a successful create into a
 * failure reply.
 */
@Injectable()
export class ChatActionRecorderService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolves the conversation to attach this write to, returning its id. */
  private async resolveConversationId(
    userId: string,
    accountId: string,
    conversationId: string | null | undefined,
    title: string,
  ): Promise<string> {
    if (conversationId) {
      // Scoped by account as well as user, like ChatService.chat()'s own lookup: a bot
      // link can point at a conversation the user opened for ANOTHER account (by naming
      // it mid-chat). Writing this account's action there would hide it from undo, because
      // the next chat for this account never reuses that conversation.
      const existing = await this.prisma.chatConversation.findFirst({
        where: { id: conversationId, userId, accountId },
        select: { id: true },
      });
      if (existing) return existing.id;
    }

    // Mirrors ChatService.chat()'s own conversation-creation call exactly
    // (same field set, same isShared:false default) — any account member may
    // start a conversation of their own.
    const created = await this.prisma.chatConversation.create({
      data: { userId, accountId: accountId ?? null, isShared: false, title },
    });
    return created.id;
  }

  private buildDisplaySummary(
    actionType: RecordExternalWriteParams['actionType'],
    resultData: RecordExternalWriteResultData,
  ): string {
    const kind = actionType === 'create_expense' ? 'expense' : 'income';
    const amountPart = `${resultData.amount} ${resultData.currencyCode}`;
    const descPart = resultData.description ? ` — ${resultData.description}` : '';
    const catPart = resultData.category ? ` [${resultData.category}]` : '';
    return `${kind} ${amountPart}${descPart}${catPart}`;
  }

  /**
   * Records a bot-made create_expense/create_income write as an `action_executed`
   * ChatMessage, so `undo_last_action` can find and revert it. Returns the id of the
   * conversation the row was written to — callers must persist this back onto the
   * bot link (`TelegramLinkService`/`WhatsAppLinkService`/`SlackLinkService`
   * `updateConversationId`) when it differs from what they already had, exactly like
   * the chat handlers already do for a chat-originated write.
   */
  async recordExternalWrite(params: RecordExternalWriteParams): Promise<string> {
    const { userId, accountId, conversationId, actionType, resultData } = params;

    const title = (resultData.description?.trim() || (actionType === 'create_expense' ? 'Expense' : 'Income')).slice(0, 100);
    const targetConversationId = await this.resolveConversationId(userId, accountId, conversationId, title);

    const displaySummary = this.buildDisplaySummary(actionType, resultData);
    // Cast, not `Record<string, unknown>`-compatible restructuring: `resultData` is a
    // named interface (not a fresh literal), so TS requires an explicit index
    // signature to assign it into ChatActionResult.data/ChatPendingAction.data —
    // exactly the `as any`-at-the-boundary pattern chat-action-lifecycle.service.ts
    // already uses for the same JSON-content shape (`data: args as any`).
    const asRecord = resultData as unknown as Record<string, unknown>;
    const result: ChatActionResult = { actionType, success: true, data: asRecord };
    const content: ChatPendingAction & { status: 'executed'; result: ChatActionResult } = {
      id: randomUUID(),
      actionType,
      data: resultData as unknown as ChatPendingAction['data'],
      displaySummary,
      status: 'executed',
      result,
    };

    await this.prisma.chatMessage.create({
      data: {
        conversationId: targetConversationId,
        role: 'action_executed',
        content: JSON.stringify(content),
        mentionedUserIds: [],
      },
    });

    return targetConversationId;
  }
}
