export type WiseImportRowKind = 'expense' | 'income' | 'fx';

export interface WiseImportRow {
  idx: number;
  kind: WiseImportRowKind;
  date: string;
  amount: number;
  currencyCode: string;
  description: string;
  merchant?: string;
  externalRef: string;
  suggestedCategoryName?: string;
  alreadyImported: boolean;
  fxFromCurrency?: string;
  fxFromAmount?: number;
  fxToCurrency?: string;
  fxToAmount?: number;
  fxRate?: number;
}

export interface WiseImportPreviewResponse {
  totalRows: number;
  importable: number;
  skipped: number;
  rows: WiseImportRow[];
}

export interface WiseImportCommitDto {
  rows: WiseImportRow[];
}

export interface WiseImportCommitResponse {
  createdExpenses: number;
  createdIncomes: number;
  createdExchanges: number;
  batchId: string;
}

// Bank Import — neutral type aliases reused by Wise + Polish parsers
export type ImportRowKind = WiseImportRowKind;
export type ImportRow = WiseImportRow;
export type ImportPreviewResponse = WiseImportPreviewResponse;

// Bank Import — new types
export interface BankParserDescriptor {
  id: 'mbank' | 'pko' | 'revolut' | 'ing' | 'millennium' | 'pekao' | 'erste' | 'alior' | 'universal';
  displayName: string;
}

export type AmountColumnMapping = string | { debit: string; credit: string };

export interface ColumnMapping {
  date: string;
  amount: AmountColumnMapping;
  description: string;
  currency?: string;
  counterparty?: string;
}

export type BankImportPreviewStatus = 'parsed' | 'needs_mapping' | 'needs_picker';

export interface BankImportPreviewResponse {
  status: BankImportPreviewStatus;
  detectedBankId?: BankParserDescriptor['id'];
  totalRows?: number;
  importable?: number;
  skipped?: number;
  parseErrors?: number;
  rows?: ImportRow[];
  headers?: string[];
  sampleRows?: string[][];
  headerFingerprint?: string;
  supportedBanks?: BankParserDescriptor[];
}

export interface BankImportCommitDto {
  rows: ImportRow[];
  saveMapping?: { name: string };
  bankId?: BankParserDescriptor['id'];
  headerFingerprint?: string;
  mapping?: ColumnMapping;
  delimiter?: string;
  encoding?: string;
  amountFormat?: 'polish' | 'standard';
  dateFormat?: 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD';
}

export interface BankImportCommitResponse {
  createdExpenses: number;
  createdIncomes: number;
  createdExchanges: number;
  skippedDuplicates: number;
  parseErrors: number;
  savedMappingId?: string;
  batchId: string;
}

export interface CsvImportMapping {
  id: string;
  accountId: string;
  name: string;
  headerFingerprint: string;
  bankId: string | null;
  mapping: ColumnMapping;
  delimiter: string;
  encoding: string;
  amountFormat: 'polish' | 'standard';
  dateFormat: 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD';
  createdAt: string;
  updatedAt: string;
}

export interface CreateCsvImportMappingDto {
  name: string;
  headerFingerprint: string;
  bankId?: string;
  mapping: ColumnMapping;
  delimiter?: string;
  encoding?: string;
  amountFormat?: 'polish' | 'standard';
  dateFormat?: 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD';
}

export interface ImportBatchDto {
  id: string;
  source: string;
  importedAt: string;
  rowCount: number;
  status: 'committed' | 'rolled_back';
  canRollback: boolean;
}

export interface ImportBatchListResponse {
  batches: ImportBatchDto[];
}

export interface RollbackImportBatchResponse {
  rolledBack: number;
}
