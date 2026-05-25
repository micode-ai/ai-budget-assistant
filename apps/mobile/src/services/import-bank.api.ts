import { httpClient } from './http-client';
import type {
  BankImportPreviewResponse,
  BankImportCommitDto,
  BankImportCommitResponse,
  CsvImportMapping,
  CreateCsvImportMappingDto,
  ImportBatchListResponse,
  RollbackImportBatchResponse,
} from '@budget/shared-types';

export const importBankApi = {
  async importBankPreview(
    file: { uri: string; name: string; type: string },
    opts: {
      bankId?: string;
      mappingId?: string;
      encoding?: string;
      mapping?: string;
      delimiter?: string;
      amountFormat?: string;
      dateFormat?: string;
    } = {},
  ): Promise<BankImportPreviewResponse> {
    const form = new FormData();
    form.append('file', { uri: file.uri, name: file.name, type: file.type } as any);
    if (opts.mapping) form.append('mapping', opts.mapping);
    if (opts.delimiter) form.append('delimiter', opts.delimiter);
    if (opts.amountFormat) form.append('amountFormat', opts.amountFormat);
    if (opts.dateFormat) form.append('dateFormat', opts.dateFormat);

    const token = await httpClient.getAuthToken();
    const accountId = httpClient.accountIdGetter?.();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (accountId) headers['X-Account-Id'] = accountId;

    const qs = new URLSearchParams();
    if (opts.bankId) qs.set('bankId', opts.bankId);
    if (opts.mappingId) qs.set('mappingId', opts.mappingId);
    if (opts.encoding) qs.set('encoding', opts.encoding);
    const url = `${httpClient.baseUrl}/import/bank/preview${qs.toString() ? `?${qs}` : ''}`;

    let response = await fetch(url, { method: 'POST', headers, body: form });
    if (response.status === 401) {
      const refreshed = await httpClient.refreshToken();
      if (refreshed) {
        const newToken = await httpClient.getAuthToken();
        if (newToken) headers['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(url, { method: 'POST', headers, body: form });
      }
    }
    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'Request failed' }));
      const message = Array.isArray(err.message) ? err.message.join('\n') : err.message || `HTTP ${response.status}`;
      throw new Error(message);
    }
    return response.json();
  },

  importBankCommit(payload: BankImportCommitDto): Promise<BankImportCommitResponse> {
    return httpClient.request<BankImportCommitResponse>('/import/bank/commit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  listCsvImportMappings(): Promise<CsvImportMapping[]> {
    return httpClient.request<CsvImportMapping[]>('/import/bank/mappings');
  },

  createCsvImportMapping(dto: CreateCsvImportMappingDto): Promise<CsvImportMapping> {
    return httpClient.request<CsvImportMapping>('/import/bank/mappings', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  deleteCsvImportMapping(id: string): Promise<void> {
    return httpClient.request<void>(`/import/bank/mappings/${id}`, { method: 'DELETE' });
  },

  listImportBatches(): Promise<ImportBatchListResponse> {
    return httpClient.request<ImportBatchListResponse>('/import/batches');
  },

  rollbackImportBatch(batchId: string): Promise<RollbackImportBatchResponse> {
    return httpClient.request<RollbackImportBatchResponse>(`/import/batches/${batchId}`, {
      method: 'DELETE',
    });
  },

  async requestBank(payload: {
    bankName: string;
    notes?: string;
    file?: { uri: string; name: string; type: string };
  }): Promise<{ ok: boolean }> {
    const form = new FormData();
    form.append('bankName', payload.bankName);
    if (payload.notes) form.append('notes', payload.notes);
    if (payload.file) {
      form.append('file', {
        uri: payload.file.uri,
        name: payload.file.name,
        type: payload.file.type,
      } as any);
    }

    const token = await httpClient.getAuthToken();
    const accountId = httpClient.accountIdGetter?.();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (accountId) headers['X-Account-Id'] = accountId;

    const url = `${httpClient.baseUrl}/import/bank/request-bank`;
    let response = await fetch(url, { method: 'POST', headers, body: form });
    if (response.status === 401) {
      const refreshed = await httpClient.refreshToken();
      if (refreshed) {
        const newToken = await httpClient.getAuthToken();
        if (newToken) headers['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(url, { method: 'POST', headers, body: form });
      }
    }
    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'Request failed' }));
      const message = Array.isArray(err.message) ? err.message.join('\n') : err.message || `HTTP ${response.status}`;
      throw new Error(message);
    }
    return response.json();
  },
};
