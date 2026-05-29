import type {
  GenerateReportDto,
  GenerateReportResponse,
  ReportListResponse,
  MonthlyDigestResponse,
  UpdateReportPreferencesDto,
  ReportPreferencesResponse,
  RestoreBackupResponse,
  BackupHistoryItem,
} from '@budget/shared-types';
import { httpClient } from './http-client';

export const reportsApi = {
  generateReport(dto: GenerateReportDto) {
    return httpClient.request<GenerateReportResponse>('/reports/generate', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  listReports() {
    return httpClient.request<ReportListResponse>('/reports');
  },

  async downloadReport(reportId: string): Promise<Blob> {
    const token = await httpClient.getAuthToken();
    const accountId = httpClient.accountIdGetter?.();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (accountId) headers['X-Account-Id'] = accountId;

    const response = await fetch(`${httpClient.baseUrl}/reports/${reportId}/download`, { headers });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Download failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }
    return response.blob();
  },

  deleteReport(reportId: string) {
    return httpClient.request<{ success: boolean }>(`/reports/${reportId}`, {
      method: 'DELETE',
    });
  },

  getMonthlyDigest(month: string) {
    return httpClient.request<MonthlyDigestResponse>(`/reports/monthly-digest?month=${month}`);
  },

  getReportPreferences() {
    return httpClient.request<ReportPreferencesResponse>('/reports/preferences');
  },

  updateReportPreferences(dto: UpdateReportPreferencesDto) {
    return httpClient.request<ReportPreferencesResponse>('/reports/preferences', {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  },

  // Single call: the backup JSON streams in the body and the filename comes
  // back in the X-Backup-Filename header (the API no longer round-trips the
  // whole payload twice).
  async downloadBackupData(): Promise<{ blob: Blob; fileName: string }> {
    const token = await httpClient.getAuthToken();
    const accountId = httpClient.accountIdGetter?.();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (accountId) headers['X-Account-Id'] = accountId;

    const response = await fetch(`${httpClient.baseUrl}/backups/export`, {
      method: 'POST',
      headers,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Export failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }
    const fileName =
      response.headers.get('X-Backup-Filename') ||
      `backup_${new Date().toISOString().split('T')[0]}.json`;
    const blob = await response.blob();
    return { blob, fileName };
  },

  restoreBackup(data: string, overwrite: boolean) {
    return httpClient.request<RestoreBackupResponse>('/backups/restore', {
      method: 'POST',
      body: JSON.stringify({ data, overwrite }),
    });
  },

  getBackupHistory() {
    return httpClient.request<BackupHistoryItem[]>('/backups/history');
  },
};
