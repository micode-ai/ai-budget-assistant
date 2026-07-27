import { httpClient } from './http-client';
import type {
  CreateSplitDto,
  RecentSplitParticipantsResponse,
  SplitStateResponse,
  SplitParticipantState,
} from '@budget/shared-types';

// Payer-facing `/expenses/:id/receipt-split*` routes. Named `receipt-split`,
// NOT `split` — `expenses.api.ts` already covers the unrelated category-splits
// `/splits` endpoints (allocating one expense across budget categories). See
// receipt-split.controller.ts for the full rationale.
export const receiptSplitApi = {
  createSplit(expenseId: string, dto: CreateSplitDto) {
    return httpClient.request<SplitStateResponse>(`/expenses/${expenseId}/receipt-split`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  getSplit(expenseId: string) {
    return httpClient.request<SplitStateResponse>(`/expenses/${expenseId}/receipt-split`);
  },

  confirmSplitParticipant(expenseId: string, participantId: string) {
    return httpClient.request<SplitParticipantState>(
      `/expenses/${expenseId}/receipt-split/${participantId}/confirm`,
      { method: 'PATCH' },
    );
  },

  cancelSplit(expenseId: string) {
    return httpClient.request<{ success: true }>(`/expenses/${expenseId}/receipt-split`, {
      method: 'DELETE',
    });
  },

  // Account-wide (not per-expense) — the "people you've split with before"
  // suggestion chips on the assignment screen. Static route
  // `/expenses/receipt-split/recent-participants`, not `/expenses/:id/...`.
  getRecentSplitParticipants(limit?: number) {
    const query = typeof limit === 'number' ? `?limit=${limit}` : '';
    return httpClient.request<RecentSplitParticipantsResponse>(
      `/expenses/receipt-split/recent-participants${query}`,
    );
  },
};
