import { httpClient } from './http-client';
import type { ReceiptCheckFinding } from '@budget/shared-types';

export const aiApi = {
  transcribeAudio(audioBase64: string, language?: string) {
    return httpClient.request<{ text: string; language: string; duration: number }>(
      '/ai/transcribe',
      {
        method: 'POST',
        body: JSON.stringify({ audio: audioBase64, language }),
      },
    );
  },

  parseExpense(text: string) {
    return httpClient.request<{
      amount: number;
      currencyCode: string;
      description: string;
      categoryId?: string;
      categorySuggestion: string;
      confidence: number;
      merchant?: string;
    }>('/ai/parse-expense', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },

  parseIncome(text: string) {
    return httpClient.request<{
      amount: number;
      currencyCode: string;
      description: string;
      categoryId?: string;
      categorySuggestion: string;
      confidence: number;
    }>('/ai/parse-income', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },

  chat(message: string, conversationId?: string, mentions?: { userId: string }[], isShared?: boolean) {
    return httpClient.request<{
      message: string;
      conversationId: string;
      aiResponded: boolean;
      userMessageId: string;
      userMessageCreatedAt: string;
      assistantMessageId?: string;
      assistantCreatedAt?: string;
      pendingAction?: { id: string; actionType: string; data: Record<string, unknown>; displaySummary: string };
      actionResult?: { actionType: string; success: boolean; data?: Record<string, unknown>; errorMessage?: string };
    }>('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message, conversationId, mentions, isShared }),
    });
  },

  confirmChatAction(conversationId: string, actionId: string) {
    return httpClient.request<{
      message: string;
      conversationId: string;
      assistantMessageId?: string;
      assistantCreatedAt?: string;
      actionResult?: {
        actionType: string;
        success: boolean;
        data?: Record<string, unknown>;
        errorMessage?: string;
      };
    }>('/ai/chat/confirm', {
      method: 'POST',
      body: JSON.stringify({ conversationId, actionId }),
    });
  },

  rejectChatAction(conversationId: string, actionId: string, reason?: string) {
    return httpClient.request<{
      message: string;
      conversationId: string;
      assistantMessageId?: string;
      assistantCreatedAt?: string;
    }>('/ai/chat/reject', {
      method: 'POST',
      body: JSON.stringify({ conversationId, actionId, reason }),
    });
  },

  getChatConversations() {
    return httpClient.request<Array<{
      id: string;
      title: string | null;
      isShared: boolean;
      isOwner: boolean;
      createdAt: string;
      updatedAt: string;
    }>>('/ai/chat/conversations');
  },

  getChatConversationMessages(conversationId: string) {
    return httpClient.request<Array<{
      id: string;
      conversationId: string;
      role: string;
      content: string;
      senderUserId: string | null;
      senderName: string | null;
      mentionedUserIds: string[];
      tokensUsed: number | null;
      createdAt: string;
    }>>(`/ai/chat/conversations/${conversationId}/messages`);
  },

  pollChatMessages(conversationId: string, since?: string) {
    const qs = since ? `?since=${encodeURIComponent(since)}` : '';
    return httpClient.request<Array<{
      id: string;
      conversationId: string;
      role: string;
      content: string;
      senderUserId: string | null;
      senderName: string | null;
      mentionedUserIds: string[];
      tokensUsed: number | null;
      createdAt: string;
    }>>(`/ai/chat/conversations/${conversationId}/poll${qs}`);
  },

  setChatConversationShared(conversationId: string, isShared: boolean) {
    return httpClient.request<{ id: string; isShared: boolean }>(
      `/ai/chat/conversations/${conversationId}/shared`,
      { method: 'PATCH', body: JSON.stringify({ isShared }) },
    );
  },

  scanReceipt(imageBase64: string, userPrompt?: string, mimeType?: string) {
    return httpClient.request<{
      amount: number;
      discountAmount: number | null;
      depositAmount: number | null;
      currencyCode: string;
      description: string;
      categoryId: string | null;
      categorySuggestion: string | null;
      merchant: string | null;
      date: string | null;
      confidence: number;
      receiptItems: {
        description: string;
        canonicalName?: string;
        quantity?: number;
        unitPrice?: number;
        totalPrice: number;
        categoryId?: string | null;
        categoryName?: string | null;
      }[];
      location: { lat: number; lng: number; name: string } | null;
      priceFindings?: ReceiptCheckFinding[];
      categorySplits: {
        categoryId: string | null;
        categoryName: string;
        amount: number;
        percentage: number;
        itemIndexes: number[];
      }[];
    }>('/ai/scan-receipt', {
      method: 'POST',
      body: JSON.stringify({
        imageBase64,
        ...(userPrompt ? { userPrompt } : {}),
        ...(mimeType ? { mimeType } : {}),
      }),
    });
  },

  extractTextFromImage(imageBase64: string) {
    return httpClient.request<{ text: string }>('/ai/extract-text', {
      method: 'POST',
      body: JSON.stringify({ imageBase64 }),
    });
  },

  suggestCategory(description: string) {
    return httpClient.request<{
      categoryId?: string;
      categoryName: string;
      confidence: number;
      source: 'history' | 'ai';
    }>(`/ai/suggest-category?description=${encodeURIComponent(description)}`);
  },

  suggestTags(description: string, merchant?: string) {
    const params = new URLSearchParams({ description });
    if (merchant) params.append('merchant', merchant);
    return httpClient.request<any>(`/ai/suggest-tags?${params.toString()}`);
  },

  suggestProject(data: { description: string; date: string; locationName?: string }) {
    return httpClient.request<any>('/ai/suggest-project', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  createGoal(data: { name: string; targetAmount: number; currencyCode: string; deadline: string }) {
    return httpClient.request<any>('/ai/goals', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getGoals() {
    return httpClient.request<any[]>('/ai/goals');
  },

  getGoal(id: string) {
    return httpClient.request<any>(`/ai/goals/${id}`);
  },

  getGoalProgress(id: string) {
    return httpClient.request<any>(`/ai/goals/${id}/progress`);
  },

  updateGoal(
    id: string,
    data: { name?: string; targetAmount?: number; deadline?: string; currentAmount?: number; status?: string },
  ) {
    return httpClient.request<any>(`/ai/goals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteGoal(id: string) {
    return httpClient.request<{ success: boolean }>(`/ai/goals/${id}`, { method: 'DELETE' });
  },

  regenerateGoalPlan(id: string) {
    return httpClient.request<any>(`/ai/goals/${id}/regenerate-plan`, { method: 'POST' });
  },

  getGoalContributions(id: string) {
    return httpClient.request<any[]>(`/ai/goals/${id}/contributions`);
  },

  // Forward-geocode a typed query into candidate places for the location picker.
  // Passing the user's position biases + sorts the results by proximity.
  geocodeSearch(q: string, origin?: { lat: number; lng: number }) {
    let url = `/ai/geocode/search?q=${encodeURIComponent(q)}`;
    if (
      origin &&
      Number.isFinite(origin.lat) &&
      Number.isFinite(origin.lng) &&
      !(origin.lat === 0 && origin.lng === 0)
    ) {
      url += `&lat=${origin.lat}&lng=${origin.lng}`;
    }
    return httpClient.request<{ results: { lat: number; lng: number; name: string }[] }>(url);
  },
};
