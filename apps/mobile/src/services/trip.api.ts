import type {
  Account,
  SettleUpResponse,
  SettleUpPayDto,
  SettleUpPayResponse,
  SettleUpTransaction,
  AccountMemberPaymentInfoDto,
} from '@budget/shared-types';
import { httpClient } from './http-client';

export const tripApi = {
  getSettleUp(accountId: string) {
    return httpClient.request<SettleUpResponse>(`/accounts/${accountId}/settle-up`);
  },

  payDebt(accountId: string, dto: SettleUpPayDto) {
    return httpClient.request<SettleUpPayResponse>(`/accounts/${accountId}/settle-up/pay`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  confirmPayment(accountId: string, txnId: string) {
    return httpClient.request<SettleUpTransaction>(
      `/accounts/${accountId}/settle-up/${txnId}/confirm`,
      { method: 'PATCH' },
    );
  },

  archiveTrip(accountId: string, force?: boolean) {
    return httpClient.request<Account>(`/accounts/${accountId}/archive-trip`, {
      method: 'PATCH',
      body: JSON.stringify({ force }),
    });
  },

  updatePaymentInfo(accountId: string, dto: AccountMemberPaymentInfoDto) {
    return httpClient.request<AccountMemberPaymentInfoDto>(
      `/accounts/${accountId}/members/me/payment-info`,
      { method: 'PATCH', body: JSON.stringify(dto) },
    );
  },
};
