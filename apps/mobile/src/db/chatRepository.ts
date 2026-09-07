import { executeSql, withTransaction } from './client';
import type { ChatConversation, ChatMessage } from '@budget/shared-types';

interface ConversationRow {
  id: string;
  user_id: string;
  account_id: string | null;
  is_shared: number | null;
  title: string | null;
  created_at: number;
  updated_at: number;
  // NULL for any row synced before ABA-514's migration — never coalesced to a
  // JS boolean at the SQL layer, only in `rowToConversation` below, so the
  // ORDER BY (which sees the raw column) can still tell "never touched" (NULL)
  // apart from "explicitly unpinned" (0). See client.native.ts's migration
  // comment for why that distinction matters to the sort.
  is_pinned: number | null;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  sender_user_id: string | null;
  sender_name: string | null;
  mentioned_user_ids: string | null;
  tokens_used: number | null;
  created_at: number;
}

function rowToConversation(row: ConversationRow): ChatConversation {
  return {
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id ?? undefined,
    isShared: row.is_shared === 1,
    title: row.title ?? undefined,
    isPinned: row.is_pinned === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as 'user' | 'assistant' | 'system',
    content: row.content,
    senderUserId: row.sender_user_id ?? undefined,
    senderName: row.sender_name ?? undefined,
    mentionedUserIds: row.mentioned_user_ids ? JSON.parse(row.mentioned_user_ids) : [],
    tokensUsed: row.tokens_used ?? undefined,
    createdAt: new Date(row.created_at),
  };
}

export async function getConversations(userId: string, accountId?: string): Promise<ChatConversation[]> {
  // COALESCE is load-bearing (ABA-514, see client.native.ts's migration
  // comment): SQLite sorts NULL BELOW 0, so a legacy row with no opinion on
  // is_pinned would otherwise sort after every explicitly-unpinned (0) row,
  // splitting the unpinned block in two instead of joining it.
  const rows = await executeSql<ConversationRow>(
    'SELECT * FROM chat_conversations WHERE user_id = ? OR (is_shared = 1 AND account_id = ?) ORDER BY COALESCE(is_pinned, 0) DESC, updated_at DESC LIMIT 20',
    [userId, accountId ?? ''],
  );
  return rows.map(rowToConversation);
}

export async function upsertConversation(conversation: ChatConversation): Promise<void> {
  await executeSql(
    `INSERT INTO chat_conversations (id, user_id, account_id, is_shared, title, created_at, updated_at, is_pinned)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       account_id = excluded.account_id,
       is_shared = excluded.is_shared,
       title = excluded.title,
       updated_at = excluded.updated_at,
       is_pinned = excluded.is_pinned`,
    [
      conversation.id,
      conversation.userId,
      conversation.accountId ?? null,
      conversation.isShared ? 1 : 0,
      conversation.title ?? null,
      conversation.createdAt.getTime(),
      conversation.updatedAt.getTime(),
      conversation.isPinned ? 1 : 0,
    ],
  );
}

// Hard delete, mirroring the API's cascade (ABA-514: no soft delete, no undo —
// see chat.service.ts's deleteConversation comment for why). Also removes the
// conversation's cached messages: unlike the server's `ChatMessage.conversation`
// relation, this SQLite schema declares no FK/cascade on chat_messages, so a
// bare `DELETE FROM chat_conversations` alone would leave its messages as
// permanent orphaned rows. Both statements run in one transaction so a crash
// between them can't leave one half deleted.
export async function deleteConversation(conversationId: string): Promise<void> {
  await withTransaction(async () => {
    await executeSql('DELETE FROM chat_messages WHERE conversation_id = ?', [conversationId]);
    await executeSql('DELETE FROM chat_conversations WHERE id = ?', [conversationId]);
  });
}

export async function getMessages(conversationId: string): Promise<ChatMessage[]> {
  const rows = await executeSql<MessageRow>(
    'SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC',
    [conversationId],
  );
  return rows.map(rowToMessage);
}

export async function upsertMessage(message: ChatMessage): Promise<void> {
  await executeSql(
    `INSERT INTO chat_messages (id, conversation_id, role, content, sender_user_id, sender_name, mentioned_user_ids, tokens_used, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       content = excluded.content,
       sender_name = excluded.sender_name,
       tokens_used = excluded.tokens_used`,
    [
      message.id,
      message.conversationId,
      message.role,
      message.content,
      message.senderUserId ?? null,
      message.senderName ?? null,
      JSON.stringify(message.mentionedUserIds ?? []),
      message.tokensUsed ?? null,
      message.createdAt.getTime(),
    ],
  );
}
