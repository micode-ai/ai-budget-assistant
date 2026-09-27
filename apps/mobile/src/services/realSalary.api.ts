import type {
  RealSalaryCategoryRow, RealSalaryProfileResponse, RealSalaryResponse, SalaryProfileDto,
} from '@budget/shared-types';
import { httpClient } from './http-client';

export const realSalaryApi = {
  getRealSalary() {
    return httpClient.request<RealSalaryResponse>('/insights/real-salary');
  },
  getRealSalaryProfile() {
    return httpClient.request<RealSalaryProfileResponse>('/insights/real-salary/profile');
  },
  saveRealSalaryProfile(dto: SalaryProfileDto) {
    return httpClient.request<SalaryProfileDto>('/insights/real-salary/profile', {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  },
  getRealSalaryCategories() {
    return httpClient.request<RealSalaryCategoryRow[]>('/insights/real-salary/categories');
  },
  /**
   * The Pro raise brief. Raw fetch like `downloadBackupData` — httpClient.request
   * parses JSON, and this body is a PDF. On failure throws an Error carrying the
   * HTTP `status` and the API's `code` (e.g. TIER_REQUIRED) so the screen can
   * route a 403 to the paywall instead of an error alert.
   */
  async downloadRealSalaryBrief(lang: string): Promise<{ blob: Blob; fileName: string }> {
    const token = await httpClient.getAuthToken();
    const accountId = httpClient.accountIdGetter?.();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (accountId) headers['X-Account-Id'] = accountId;
    const response = await fetch(
      `${httpClient.baseUrl}/insights/real-salary/brief?lang=${encodeURIComponent(lang)}`,
      { method: 'POST', headers },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({} as { message?: string; code?: string }));
      const err = new Error(body.message || `HTTP ${response.status}`) as Error & { status?: number; code?: string };
      err.status = response.status;
      err.code = body.code;
      throw err;
    }
    const fileName =
      response.headers.get('X-Report-Filename') || `real-salary-${new Date().toISOString().slice(0, 10)}.pdf`;
    return { blob: await response.blob(), fileName };
  },
};
