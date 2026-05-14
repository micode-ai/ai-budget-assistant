import { create } from 'zustand';
import type { ChatConversation, ChatPendingAction, ChatActionResult } from '@budget/shared-types';
import { generateUUID } from '@budget/shared-utils';
import { api } from '@/services/api';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import i18n from '@/i18n';
import * as chatRepository from '@/db/chatRepository';

// Re-export ChatMessage type for use in components
export interface ChatMessage {
  id: string;
  conversationId?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokensUsed?: number;
  createdAt: Date;
  pendingAction?: ChatPendingAction;
  actionResult?: ChatActionResult;
}

interface ChatState {
  conversations: ChatConversation[];
  currentConversationId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  isConfirming: boolean;
  error: string | null;

  // Actions
  sendMessage: (content: string) => Promise<void>;
  confirmAction: (actionId: string) => Promise<void>;
  rejectAction: (actionId: string, reason?: string) => Promise<void>;
  addMessage: (message: ChatMessage) => void;
  setConversationId: (id: string) => void;
  startNewConversation: () => void;
  loadConversations: () => Promise<void>;
  loadConversation: (conversationId: string) => Promise<void>;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  isLoading: false,
  isConfirming: false,
  error: null,

  sendMessage: async (content: string) => {
    const { currentConversationId } = get();

    // Create user message
    const userMessage: ChatMessage = {
      id: generateUUID(),
      conversationId: currentConversationId || undefined,
      role: 'user',
      content,
      createdAt: new Date(),
    };

    // Add user message immediately (optimistic UI)
    set((state) => ({
      messages: [...state.messages, userMessage],
      isLoading: true,
      error: null,
    }));

    try {
      // Call the real API
      const response = await api.chat(content, currentConversationId || undefined);

      // Update conversation ID if this is a new conversation
      if (!currentConversationId && response.conversationId) {
        set({ currentConversationId: response.conversationId });
      }

      const assistantMessage: ChatMessage = {
        id: generateUUID(),
        conversationId: response.conversationId,
        role: 'assistant',
        content: response.message,
        createdAt: new Date(),
        pendingAction: response.pendingAction as ChatPendingAction | undefined,
        actionResult: response.actionResult as ChatActionResult | undefined,
      };

      set((state) => ({
        messages: [...state.messages, assistantMessage],
        isLoading: false,
      }));

      // Refresh AI usage counter
      useSubscriptionStore.getState().loadUsage();
    } catch (error) {
      // Add error message to chat
      const errorMessage: ChatMessage = {
        id: generateUUID(),
        role: 'assistant',
        content: i18n.t('errors.chatError'),
        createdAt: new Date(),
      };

      set((state) => ({
        messages: [...state.messages, errorMessage],
        error: error instanceof Error ? error.message : i18n.t('errors.sendMessageFailed'),
        isLoading: false,
      }));
    }
  },

  confirmAction: async (actionId: string) => {
    const { currentConversationId } = get();
    if (!currentConversationId) return;

    set({ isConfirming: true });

    try {
      const response = await api.confirmChatAction(currentConversationId, actionId);

      // Mark the pending action message as confirmed
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg.pendingAction?.id === actionId
            ? { ...msg, pendingAction: undefined }
            : msg,
        ),
      }));

      // Add the result message
      const resultMessage: ChatMessage = {
        id: generateUUID(),
        conversationId: currentConversationId,
        role: 'assistant',
        content: response.message,
        createdAt: new Date(),
        actionResult: response.actionResult as ChatActionResult | undefined,
      };

      set((state) => ({
        messages: [...state.messages, resultMessage],
        isConfirming: false,
      }));
    } catch (error) {
      set({
        isConfirming: false,
        error: error instanceof Error ? error.message : i18n.t('errors.chatError'),
      });
    }
  },

  rejectAction: async (actionId: string, reason?: string) => {
    const { currentConversationId } = get();
    if (!currentConversationId) return;

    set({ isConfirming: true });

    try {
      const response = await api.rejectChatAction(currentConversationId, actionId, reason);

      // Remove the pending action from the message
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg.pendingAction?.id === actionId
            ? { ...msg, pendingAction: undefined }
            : msg,
        ),
      }));

      // Add the rejection message
      const rejectMessage: ChatMessage = {
        id: generateUUID(),
        conversationId: currentConversationId,
        role: 'assistant',
        content: response.message,
        createdAt: new Date(),
      };

      set((state) => ({
        messages: [...state.messages, rejectMessage],
        isConfirming: false,
      }));
    } catch (error) {
      set({ isConfirming: false });
    }
  },

  addMessage: (message: ChatMessage) => {
    set((state) => ({
      messages: [...state.messages, message],
    }));
  },

  setConversationId: (id: string) => {
    set({ currentConversationId: id });
  },

  startNewConversation: () => {
    set({
      currentConversationId: null,
      messages: [],
      error: null,
    });
  },

  loadConversations: async () => {
    try {
      // Show cached conversations immediately
      const authStore = await import('@/stores/authStore');
      const userId = authStore.useAuthStore.getState().user?.id;
      if (!userId) return;

      const cached = await chatRepository.getConversations(userId);
      if (cached.length > 0) {
        set({ conversations: cached });
      }

      // Refresh from API
      const remote = await api.getChatConversations();
      const conversations: import('@budget/shared-types').ChatConversation[] = remote.map((c) => ({
        id: c.id,
        userId,
        title: c.title ?? undefined,
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt),
      }));

      set({ conversations });

      // Upsert into SQLite
      for (const conv of conversations) {
        await chatRepository.upsertConversation(conv);
      }
    } catch {
      // Non-fatal: leave whatever is in state
    }
  },

  loadConversation: async (conversationId: string) => {
    set({ isLoading: true, error: null, currentConversationId: conversationId });

    try {
      // Paint from SQLite cache immediately
      const cached = await chatRepository.getMessages(conversationId);
      if (cached.length > 0) {
        set({
          messages: cached.map((m) => ({
            id: m.id,
            conversationId: m.conversationId,
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
            tokensUsed: m.tokensUsed,
            createdAt: m.createdAt,
          })),
        });
      }

      // Fetch from API (up to 50 messages, pending_action filtered server-side)
      const remote = await api.getChatConversationMessages(conversationId);
      const messages: ChatMessage[] = remote.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        tokensUsed: m.tokensUsed ?? undefined,
        createdAt: new Date(m.createdAt),
      }));

      set({ messages, isLoading: false });

      // Persist to SQLite (all API messages always have conversationId)
      for (const msg of messages) {
        if (msg.conversationId) {
          await chatRepository.upsertMessage(msg as import('@budget/shared-types').ChatMessage);
        }
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : i18n.t('errors.loadConversationFailed'),
        isLoading: false,
      });
    }
  },

  clearMessages: () => {
    set({
      messages: [],
      currentConversationId: null,
    });
  },
}));
