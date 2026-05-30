import type { ReportFormat, ReportStatus } from './primitives';

export interface ReportFilters {
  startDate: string;
  endDate: string;
  categoryIds?: string[];
  tagIds?: string[];
  projectIds?: string[];
  currencyCode?: string;
  includeIncomes: boolean;
  includeExpenses: boolean;
}

export interface GeneratedReport {
  id: string;
  accountId: string;
  userId: string;
  format: ReportFormat;
  status: ReportStatus;
  fileName: string;
  fileSize?: number;
  filters: ReportFilters;
  expiresAt: Date;
  createdAt: Date;
  completedAt?: Date;
}

export interface MonthlyDigest {
  id: string;
  accountId: string;
  periodStart: string;
  periodEnd: string;
  totalIncome: number;
  totalExpenses: number;
  savingsRate: number;
  topCategories: Array<{ name: string; amount: number; percentage: number }>;
  vsLastMonth: { incomeChange: number; expenseChange: number };
  generatedAt: string;
}

export interface BackupMetadata {
  id: string;
  userId: string;
  accountId: string;
  version: number;
  entityCounts: Record<string, number>;
  encrypted: boolean;
  encryptionKeyVersion?: number;
  createdAt: Date;
  fileSize: number;
}

export interface ReportPreferences {
  weeklyEmailEnabled: boolean;
  weeklyEmailDay: number;
  monthlyDigestEnabled: boolean;
}
