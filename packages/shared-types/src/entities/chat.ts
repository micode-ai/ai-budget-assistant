export interface ChatConversation {
  id: string;
  userId: string;
  accountId?: string;
  isShared: boolean;
  title?: string;
  /**
   * Per-VIEWER, not per-conversation (ABA-514) — mirrors
   * `ChatConversationSummary.isPinned` in `dto/ai.ts`. Optional because a row
   * read from a pre-ABA-514 SQLite cache (or built by a call site that never
   * learned pin state) carries no opinion; every call site must treat
   * `undefined` the same as `false`, never as "unknown, don't touch it".
   */
  isPinned?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  senderUserId?: string;
  senderName?: string;
  mentionedUserIds?: string[];
  tokensUsed?: number;
  createdAt: Date;
}

export interface Insight {
  id: string;
  userId: string;
  type: 'warning' | 'tip' | 'achievement' | 'anomaly';
  title: string;
  message: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  createdAt: Date;
}
