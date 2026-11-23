import type {
  AllAccountsAnalyticsResponse,
  AccountGroupDto,
  UpsertAccountGroupDto,
  ConsolidatedReportRequest,
  GenerateReportResponse,
} from '@budget/shared-types';
import { httpClient } from './http-client';

/** User-scoped (all accounts / account groups); the X-Account-Id header is ignored server-side. */
export const allAccountsApi = {
  getAllAccountsAnalytics(start: string, end: string, exclude: string[]) {
    const q = `start=${start}&end=${end}${exclude.length ? `&exclude=${encodeURIComponent(exclude.join(','))}` : ''}`;
    return httpClient.request<AllAccountsAnalyticsResponse>(`/all-accounts/analytics?${q}`);
  },

  getGroupAnalytics(groupId: string, start: string, end: string) {
    return httpClient.request<AllAccountsAnalyticsResponse>(
      `/account-groups/${encodeURIComponent(groupId)}/analytics?start=${start}&end=${end}`,
    );
  },

  listAccountGroups() {
    return httpClient.request<AccountGroupDto[]>('/account-groups');
  },

  createAccountGroup(dto: UpsertAccountGroupDto) {
    return httpClient.request<AccountGroupDto>('/account-groups', { method: 'POST', body: JSON.stringify(dto) });
  },

  updateAccountGroup(id: string, dto: UpsertAccountGroupDto) {
    return httpClient.request<AccountGroupDto>(`/account-groups/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  },

  deleteAccountGroup(id: string) {
    return httpClient.request<void>(`/account-groups/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  generateConsolidatedReport(req: ConsolidatedReportRequest) {
    return httpClient.request<GenerateReportResponse>('/all-accounts/reports', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },
};
