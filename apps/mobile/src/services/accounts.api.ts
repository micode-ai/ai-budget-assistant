import type { Account, AccountMember, AccountInvitation } from '@budget/shared-types';
import type { CreateAccountDto, UpdateAccountDto, CreateInvitationDto } from '@budget/shared-types';
import { httpClient } from './http-client';

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
    return httpClient.request<any>('/accounts/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
  },

  declineInvitation(inviteCode: string) {
    return httpClient.request<any>('/accounts/invitations/decline', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
  },

  getAccountTransfers() {
    return httpClient.request<any[]>('/account-transfers');
  },

  createAccountTransfer(data: any) {
    return httpClient.request<any>('/account-transfers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateAccountTransfer(id: string, data: any) {
    return httpClient.request<any>(`/account-transfers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteAccountTransfer(id: string) {
    return httpClient.request<void>(`/account-transfers/${id}`, { method: 'DELETE' });
  },
};
