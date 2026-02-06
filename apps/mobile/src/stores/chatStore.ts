import { create } from 'zustand';
import type { ChatConversation } from '@budget/shared-types';
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
}

interface ChatState {
  conversations: ChatConversation[];
  currentConversationId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;

  // Actions
  sendMessage: (content: string) => Promise<void>;
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
