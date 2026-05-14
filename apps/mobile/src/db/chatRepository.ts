import { executeSql } from './client';
import type { ChatConversation, ChatMessage } from '@budget/shared-types';

interface ConversationRow {
  id: string;
  user_id: string;
  title: string | null;
  created_at: number;
  updated_at: number;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  tokens_used: number | null;
  created_at: number;
}

function rowToConversation(row: ConversationRow): ChatConversation {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title ?? undefined,
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
    tokensUsed: row.tokens_used ?? undefined,
    createdAt: new Date(row.created_at),
  };
}

export async function getConversations(userId: string): Promise<ChatConversation[]> {
  const rows = await executeSql<ConversationRow>(
    'SELECT * FROM chat_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20',
    [userId],
  );
  return rows.map(rowToConversation);
}

export async function upsertConversation(conversation: ChatConversation): Promise<void> {
  await executeSql(
    `INSERT INTO chat_conversations (id, user_id, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       updated_at = excluded.updated_at`,
    [
      conversation.id,
      conversation.userId,
      conversation.title ?? null,
      conversation.createdAt.getTime(),
      conversation.updatedAt.getTime(),
    ],
  );
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
    `INSERT INTO chat_messages (id, conversation_id, role, content, tokens_used, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       content = excluded.content,
       tokens_used = excluded.tokens_used`,
    [
      message.id,
      message.conversationId,
      message.role,
      message.content,
      message.tokensUsed ?? null,
      message.createdAt.getTime(),
    ],
  );
}
