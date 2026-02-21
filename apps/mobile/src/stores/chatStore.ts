import { create } from 'zustand';
import type { ChatConversation, ChatPendingAction, ChatActionResult } from '@budget/shared-types';
import { generateUUID } from '@budget/shared-utils';
import { api } from '@/services/api';
import i18n from '@/i18n';

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

  loadConversation: async (conversationId: string) => {
    set({ isLoading: true, error: null });

    try {
      // TODO: Load conversation history from API
      set({
        currentConversationId: conversationId,
        isLoading: false,
      });
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
