import { httpClient } from './http-client';
import type {
  Child,
  ChildStatementRequest,
  ChildSuggestionsResponse,
  CreateChildRequest,
  ExpenseChildLink,
  SetExpenseChildrenRequest,
  UpdateChildRequest,
} from '@budget/shared-types';

/** A child as the server returns it: the ciphertext rides along for an E2EE device. */
export type ChildDto = Child & {
  encryptedPayload?: string | null;
  encryptionKeyVersion?: number | null;
};

/**
 * Child costs REST routes. The native app writes through the offline queue
 * (childSync.ts) and uses these for the pull, line attribution replay and web;
 * the web build has no SQLite and calls them directly.
 *
 * `POST /children` takes a plaintext name only — on an encrypted account the
 * caller must go through `/sync/push` with an encrypted payload instead.
 */
export const childrenApi = {
  getChildren(includeArchived = false): Promise<ChildDto[]> {
    return httpClient.request<ChildDto[]>(`/children${includeArchived ? '?includeArchived=true' : ''}`);
  },

  createChild(data: CreateChildRequest): Promise<ChildDto> {
    return httpClient.request<ChildDto>('/children', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateChild(id: string, data: UpdateChildRequest): Promise<ChildDto> {
    return httpClient.request<ChildDto>(`/children/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  getChildSuggestions(names: string[]): Promise<ChildSuggestionsResponse> {
    return httpClient.request<ChildSuggestionsResponse>('/children/suggestions', {
      method: 'POST',
      body: JSON.stringify({ names }),
    });
  },

  setExpenseChildren(expenseId: string, data: SetExpenseChildrenRequest): Promise<ExpenseChildLink[]> {
    return httpClient.request<ExpenseChildLink[]>(`/expenses/${encodeURIComponent(expenseId)}/children`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /** `options.accountId` pins `X-Account-Id` (the queue drain must; see `pushChanges`). */
  setItemChild(
    expenseId: string,
    itemId: string,
    childId: string | null,
    options?: { accountId?: string },
  ): Promise<void> {
    return httpClient.request<void>(
      `/expenses/${encodeURIComponent(expenseId)}/items/${encodeURIComponent(itemId)}/child`,
      {
        method: 'PATCH',
        body: JSON.stringify({ childId }),
        ...(options?.accountId ? { headers: { 'X-Account-Id': options.accountId } } : {}),
      },
    );
  },

  /**
   * The Pro statement PDF (`POST /children/:id/statement`) as a Blob, for the
   * report export path (`fileExport.saveFile`). A refusal throws an Error
   * carrying `status` and the server's `code` (`TIER_REQUIRED`,
   * `ENCRYPTED_ACCOUNT`), the `httpClient.request` error shape.
   */
  async downloadChildStatement(accountId: string, childId: string, data: ChildStatementRequest): Promise<Blob> {
    const token = await httpClient.getAuthToken();
    // The account the caller gated on (pending, encryption, role) — never the current-account getter,
    // which may have switched while the flush ran.
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Account-Id': accountId };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${httpClient.baseUrl}/children/${encodeURIComponent(childId)}/statement`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}) as Record<string, unknown>);
      const err = new Error(
        typeof body.message === 'string' ? body.message : `HTTP ${response.status}`,
      ) as Error & { status?: number; code?: string };
      err.status = response.status;
      err.code = typeof body.code === 'string' ? body.code : undefined;
      throw err;
    }
    return response.blob();
  },
};
