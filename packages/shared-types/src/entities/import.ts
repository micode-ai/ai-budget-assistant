import type { ImportBatchStatus } from './primitives';

export interface ImportBatch {
  id: string;
  accountId: string;
  userId: string;
  source: string;
  importedAt: string;
  rowCount: number;
  status: ImportBatchStatus;
}
