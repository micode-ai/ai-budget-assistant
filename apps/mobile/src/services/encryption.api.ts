import type {
  SetupEncryptionDto,
  EnableAccountEncryptionDto,
  GrantKeyDto,
  RotateAccountKeyDto,
  SetupRecoveryDto,
  EncryptionProfileResponse,
  AccountEncryptionKeyResponse,
  PendingKeyGrantsResponse,
  RecoverEncryptionResponse,
  AccountEncryptionStatusResponse,
  MemberPublicKeyResponse,
} from '@budget/shared-types';
import { httpClient } from './http-client';

export const encryptionApi = {
  setupEncryption(dto: SetupEncryptionDto) {
    return httpClient.request<{ success: boolean }>('/encryption/setup', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  getEncryptionProfile() {
    return httpClient.request<EncryptionProfileResponse>('/encryption/profile');
  },

  resetEncryptionProfile() {
    return httpClient.request<{ deleted: boolean }>('/encryption/profile', {
      method: 'DELETE',
    });
  },

  enableAccountEncryption(accountId: string, dto: EnableAccountEncryptionDto) {
    return httpClient.request<{ success: boolean }>(`/encryption/account/${accountId}/enable`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  getAccountEncryptionKey(accountId: string) {
    return httpClient.request<AccountEncryptionKeyResponse>(`/encryption/account/${accountId}/key`);
  },

  getAccountEncryptionStatus(accountId: string) {
    return httpClient.request<AccountEncryptionStatusResponse>(
      `/encryption/account/${accountId}/status`,
    );
  },

  grantEncryptionKey(accountId: string, dto: GrantKeyDto) {
    return httpClient.request<{ success: boolean }>(`/encryption/account/${accountId}/grant-key`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  getPendingKeyGrants(accountId: string) {
    return httpClient.request<PendingKeyGrantsResponse>(
      `/encryption/account/${accountId}/pending-grants`,
    );
  },

  rotateAccountKey(accountId: string, dto: RotateAccountKeyDto) {
    return httpClient.request<{ success: boolean }>(`/encryption/account/${accountId}/rotate-key`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  getMemberPublicKeys(accountId: string) {
    return httpClient.request<MemberPublicKeyResponse>(
      `/encryption/members/${accountId}/public-keys`,
    );
  },

  setupRecovery(dto: SetupRecoveryDto) {
    return httpClient.request<{ success: boolean }>('/encryption/recovery/setup', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  recoverEncryption(recoveryKey: string) {
    return httpClient.request<RecoverEncryptionResponse>('/encryption/recovery/recover', {
      method: 'POST',
      body: JSON.stringify({ recoveryKey }),
    });
  },
};
