export interface ChatConversation {
  id: string;
  userId: string;
  accountId?: string;
  isShared: boolean;
  title?: string;
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
