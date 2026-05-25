import { create } from 'zustand';
import type { ChatConversation, ChatPendingAction, ChatActionResult } from '@budget/shared-types';
import { generateUUID } from '@budget/shared-utils';
import { api } from '@/services/api';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import i18n from '@/i18n';
import * as chatRepository from '@/db/chatRepository';

// Module-level polling timer handle
let pollTimer: ReturnType<typeof setInterval> | null = null;

// Re-export ChatMessage type for use in components
export interface ChatMessage {
  id: string;
  conversationId?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  senderUserId?: string;
  senderName?: string;
  mentionedUserIds?: string[];
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
  currentIsShared: boolean;
  lastSyncedAt: string | null;
  isPolling: boolean;

  // Actions
  sendMessage: (content: string, mentions?: { userId: string }[]) => Promise<void>;
  confirmAction: (actionId: string) => Promise<void>;
  rejectAction: (actionId: string, reason?: string) => Promise<void>;
  addMessage: (message: ChatMessage) => void;
  setConversationId: (id: string) => void;
  startNewConversation: () => void;
  loadConversations: () => Promise<void>;
  loadConversation: (conversationId: string) => Promise<void>;
  clearMessages: () => void;
  setConversationShared: (isShared: boolean) => Promise<void>;
  pollNewMessages: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  isLoading: false,
  isConfirming: false,
  error: null,
  currentIsShared: false,
  lastSyncedAt: null,
  isPolling: false,

  sendMessage: async (content: string, mentions?: { userId: string }[]) => {
    const { currentConversationId, currentIsShared } = get();

    const tempId = generateUUID();
    const userMessage: ChatMessage = {
      id: tempId,
      conversationId: currentConversationId || undefined,
      role: 'user',
      content,
      mentionedUserIds: mentions?.map((m) => m.userId) ?? [],
      createdAt: new Date(),
    };

    set((state) => ({ messages: [...state.messages, userMessage], isLoading: true, error: null }));

    try {
      const response = await api.chat(
        content,
        currentConversationId || undefined,
        mentions,
        currentConversationId ? undefined : currentIsShared || undefined,
      );

      if (!currentConversationId && response.conversationId) {
        set({ currentConversationId: response.conversationId });
      }

      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === tempId
            ? { ...m, id: response.userMessageId, conversationId: response.conversationId, createdAt: new Date(response.userMessageCreatedAt) }
            : m,
        ),
        lastSyncedAt: response.userMessageCreatedAt,
      }));

      if (response.aiResponded) {
        const assistantMessage: ChatMessage = {
          id: response.assistantMessageId ?? generateUUID(),
          conversationId: response.conversationId,
          role: 'assistant',
          content: response.message,
          createdAt: response.assistantCreatedAt ? new Date(response.assistantCreatedAt) : new Date(),
          pendingAction: response.pendingAction as ChatPendingAction | undefined,
          actionResult: response.actionResult as ChatActionResult | undefined,
        };
        set((state) => ({
          messages: [...state.messages, assistantMessage],
          isLoading: false,
          lastSyncedAt: response.assistantCreatedAt ?? state.lastSyncedAt,
        }));
      } else {
        set({ isLoading: false });
      }

      useSubscriptionStore.getState().loadUsage();
    } catch (error) {
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
      currentIsShared: false,
      lastSyncedAt: null,
    });
  },

  loadConversations: async () => {
    try {
      // Show cached conversations immediately
      const authStore = await import('@/stores/authStore');
      const userId = authStore.useAuthStore.getState().user?.id;
      if (!userId) return;

      const { useAccountStore } = await import('@/stores/accountStore');
      const accountId = useAccountStore.getState().currentAccountId ?? undefined;
      const cached = await chatRepository.getConversations(userId, accountId);
      if (cached.length > 0) {
        set({ conversations: cached });
      }

      // Refresh from API
      const remote = await api.getChatConversations();
      const conversations: import('@budget/shared-types').ChatConversation[] = remote.map((c) => ({
        id: c.id,
        userId,
        accountId: undefined,
        isShared: c.isShared,
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
            senderUserId: m.senderUserId,
            senderName: m.senderName,
            mentionedUserIds: m.mentionedUserIds,
            tokensUsed: m.tokensUsed,
            createdAt: m.createdAt,
          })),
        });
      }

      const conv = get().conversations.find((c) => c.id === conversationId);
      const isShared = conv?.isShared ?? false;

      // Fetch from API (up to 50 messages, pending_action filtered server-side)
      const remote = await api.getChatConversationMessages(conversationId);
      const messages: ChatMessage[] = remote.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        senderUserId: m.senderUserId ?? undefined,
        senderName: m.senderName ?? undefined,
        mentionedUserIds: m.mentionedUserIds,
        tokensUsed: m.tokensUsed ?? undefined,
        createdAt: new Date(m.createdAt),
      }));

      const lastSyncedAt = messages.length > 0 ? messages[messages.length - 1].createdAt.toISOString() : null;
      set({ messages, isLoading: false, currentIsShared: isShared, lastSyncedAt });

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
      currentIsShared: false,
      lastSyncedAt: null,
    });
  },

  setConversationShared: async (isShared: boolean) => {
    const { currentConversationId } = get();
    if (!currentConversationId) {
      set({ currentIsShared: isShared });
      return;
    }
    try {
      const res = await api.setChatConversationShared(currentConversationId, isShared);
      set((state) => ({
        currentIsShared: res.isShared,
        conversations: state.conversations.map((c) => (c.id === currentConversationId ? { ...c, isShared: res.isShared } : c)),
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : i18n.t('errors.chatError') });
    }
  },

  pollNewMessages: async () => {
    const { currentConversationId, lastSyncedAt, messages } = get();
    if (!currentConversationId) return;
    try {
      const remote = await api.pollChatMessages(currentConversationId, lastSyncedAt ?? undefined);
      if (remote.length === 0) return;
      const existingIds = new Set(messages.map((m) => m.id));
      const fresh = remote
        .filter((m) => !existingIds.has(m.id))
        .map((m) => ({
          id: m.id,
          conversationId: m.conversationId,
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          senderUserId: m.senderUserId ?? undefined,
          senderName: m.senderName ?? undefined,
          mentionedUserIds: m.mentionedUserIds,
          tokensUsed: m.tokensUsed ?? undefined,
          createdAt: new Date(m.createdAt),
        }));
      if (fresh.length === 0) return;
      const newest = remote[remote.length - 1].createdAt;
      set((state) => ({ messages: [...state.messages, ...fresh], lastSyncedAt: newest }));
      for (const msg of fresh) {
        if (msg.conversationId) await chatRepository.upsertMessage(msg as import('@budget/shared-types').ChatMessage);
      }
    } catch {
      // non-fatal
    }
  },

  startPolling: () => {
    const { isPolling } = get();
    if (isPolling || pollTimer) return;
    set({ isPolling: true });
    pollTimer = setInterval(() => { get().pollNewMessages(); }, 4000);
  },

  stopPolling: () => {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    set({ isPolling: false });
  },
}));
