export interface GenerateReportDto {
  format: 'csv' | 'pdf' | 'excel';
  startDate: string;
  endDate: string;
  categoryIds?: string[];
  tagIds?: string[];
  projectIds?: string[];
  currencyCode?: string;
  includeIncomes?: boolean;
  includeExpenses?: boolean;
  locale?: string;
}

export interface GenerateReportResponse {
  reportId: string;
  status: 'completed';
  downloadUrl: string;
  fileName: string;
  fileSize: number;
}

export interface ReportListItem {
  id: string;
  format: string;
  status: string;
  fileName: string;
  fileSize?: number;
  createdAt: string;
  expiresAt: string;
}

export interface ReportListResponse {
  reports: ReportListItem[];
}

export interface MonthlyDigestResponse {
  digest: {
    periodLabel: string;
    currencyCode: string;
    totalIncome: number;
    totalExpenses: number;
    savingsRate: number;
    topCategories: Array<{ categoryId: string | null; name: string; amount: number; percentage: number }>;
    incomeChange: number;
    expenseChange: number;
  };
  generatedAt: string;
}

export interface CreateBackupResponse {
  backupId: string;
  fileName: string;
  fileSize: number;
  entityCounts: Record<string, number>;
  encrypted: boolean;
}

export interface RestoreBackupDto {
  data: string;
  overwrite: boolean;
}

export interface RestoreBackupResponse {
  restoredCounts: Record<string, number>;
  skippedCounts: Record<string, number>;
  errors: string[];
}

export interface BackupHistoryItem {
  id: string;
  version: number;
  entityCounts: Record<string, number>;
  encrypted: boolean;
  fileSize: number;
  createdAt: string;
}

export interface UpdateReportPreferencesDto {
  weeklyEmailEnabled?: boolean;
  weeklyEmailDay?: number;
  monthlyDigestEnabled?: boolean;
}

export interface ReportPreferencesResponse {
  weeklyEmailEnabled: boolean;
  weeklyEmailDay: number;
  monthlyDigestEnabled: boolean;
}
