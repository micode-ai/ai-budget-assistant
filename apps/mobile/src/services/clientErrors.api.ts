import { httpClient } from './http-client';
import type { ReportClientErrorRequest } from '@budget/shared-types';

/** Client error reporting (ABA-832). Use `reportClientError` in `clientErrors.ts`, which never throws. */
export const clientErrorsApi = {
  reportClientError(body: ReportClientErrorRequest): Promise<void> {
    return httpClient.request<void>('/telemetry/client-errors', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};
