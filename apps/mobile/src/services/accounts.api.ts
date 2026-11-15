import type { Account, AccountMember, AccountInvitation, AccountTransfer } from '@budget/shared-types';
import type {
  CreateAccountDto,
  UpdateAccountDto,
  CreateInvitationDto,
  CreateAccountTransferDto,
  UpdateAccountTransferDto,
  AccountTransferResponse,
} from '@budget/shared-types';
import { httpClient } from './http-client';

export interface MyInvitation {
  id: string;
  accountId: string;
  accountName: string;
  accountType: string;
  inviterName: string;
  role: string;
  createdAt: string;
}

export const accountsApi = {
  getAccounts() {
    return httpClient.request<Account[]>('/accounts');
  },

  createAccount(dto: CreateAccountDto) {
    return httpClient.request<Account>('/accounts', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  /**
   * Marks or unmarks one expense category as a fixed cost (ABA-777). The server
   * resolves a device id or a server id and returns the whole new list.
   */
  setCategoryFixed(accountId: string, categoryId: string, fixed: boolean) {
    return httpClient.request<{ fixedCategoryIds: string[] }>(`/accounts/${accountId}/fixed-categories`, {
      method: 'PUT',
      body: JSON.stringify({ categoryId, fixed }),
    });
  },

  updateAccount(id: string, dto: UpdateAccountDto) {
    return httpClient.request<Account>(`/accounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  },

  deleteAccount(id: string) {
    return httpClient.request<void>(`/accounts/${id}`, { method: 'DELETE' });
  },

  getMembers(accountId: string) {
    return httpClient.request<AccountMember[]>(`/accounts/${accountId}/members`);
  },

  updateMemberRole(accountId: string, memberId: string, role: string) {
    return httpClient.request<AccountMember>(`/accounts/${accountId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  },

  removeMember(accountId: string, memberId: string) {
    return httpClient.request<void>(`/accounts/${accountId}/members/${memberId}`, {
      method: 'DELETE',
    });
  },

  leaveAccount(accountId: string) {
    return httpClient.request<void>(`/accounts/${accountId}/leave`, { method: 'POST' });
  },

  createInvitation(accountId: string, dto: CreateInvitationDto) {
    return httpClient.request<AccountInvitation>(`/accounts/${accountId}/invitations`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  getInvitations(accountId: string) {
    return httpClient.request<AccountInvitation[]>(`/accounts/${accountId}/invitations`);
  },

  cancelInvitation(accountId: string, invitationId: string) {
    return httpClient.request<void>(`/accounts/${accountId}/invitations/${invitationId}`, {
      method: 'DELETE',
    });
  },

  acceptInvitation(inviteCode: string) {
    return httpClient.request<{ member: AccountMember; account: Account }>('/accounts/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
  },

  declineInvitation(inviteCode: string) {
    return httpClient.request<AccountInvitation>('/accounts/invitations/decline', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
  },

  getMyInvitations() {
    return httpClient.request<MyInvitation[]>('/accounts/invitations/mine');
  },

  respondToInvitation(id: string, action: 'accept' | 'decline') {
    return httpClient.request<{ member: AccountMember; account: Account } | AccountInvitation>(
      `/accounts/invitations/${id}/respond`,
      { method: 'PATCH', body: JSON.stringify({ action }) },
    );
  },

  getAccountTransfers() {
    return httpClient.request<AccountTransferResponse[]>('/account-transfers');
  },

  createAccountTransfer(data: CreateAccountTransferDto) {
    return httpClient.request<AccountTransferResponse>('/account-transfers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateAccountTransfer(id: string, data: UpdateAccountTransferDto) {
    return httpClient.request<AccountTransferResponse>(`/account-transfers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteAccountTransfer(id: string) {
    return httpClient.request<void>(`/account-transfers/${id}`, { method: 'DELETE' });
  },
};
