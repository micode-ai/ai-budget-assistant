import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { useChatStore, ChatMessage } from '@/stores/chatStore';

export interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  conversationId: string | null;
  sendMessage: (text: string) => Promise<void>;
  clearChat: () => void;
  loadConversation: (conversationId: string) => void;
}

export function useChat(): UseChatReturn {
  const {
    messages,
    currentConversationId,
    addMessage,
    setConversationId,
    clearMessages,
  } = useChatStore();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      setIsLoading(true);
      setError(null);

      // Add user message to store immediately for optimistic UI
      const userMessage: ChatMessage = {
        id: `local-${Date.now()}`,
        role: 'user',
        content: text,
        createdAt: new Date(),
      };
      addMessage(userMessage);

      try {
        // Send to API
        const response = await api.chat(text, currentConversationId || undefined);

        // Update conversation ID if this is a new conversation
        if (!currentConversationId && response.conversationId) {
          setConversationId(response.conversationId);
        }

        // Add assistant response
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.message,
          createdAt: new Date(),
        };
        addMessage(assistantMessage);
      } catch (err) {
        console.error('Chat error:', err);
        setError(err instanceof Error ? err.message : 'Failed to send message');

        // Add error message
        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          createdAt: new Date(),
        };
        addMessage(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [currentConversationId, addMessage, setConversationId],
  );

  const clearChat = useCallback(() => {
    clearMessages();
    setError(null);
  }, [clearMessages]);

  const loadConversation = useCallback(
    (conversationId: string) => {
      setConversationId(conversationId);
      // In a full implementation, you'd fetch the conversation history here
    },
    [setConversationId],
  );

  return {
    messages,
    isLoading,
    error,
    conversationId: currentConversationId,
    sendMessage,
    clearChat,
    loadConversation,
  };
}
