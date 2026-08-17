import { create } from 'zustand';
import { api } from '@/services/api';
import { saveFile, shareFile, type FileExportResult } from '@/services/fileExport';
import type {
  GenerateReportDto,
  ReportListItem,
  MonthlyDigestResponse,
  BackupHistoryItem,
  UpdateReportPreferencesDto,
  ReportPreferencesResponse,
} from '@budget/shared-types';

export type BackupExportResult =
  | { status: 'saved'; location: string }
  | { status: 'shared' }
  | { status: 'cancelled' }
  | { status: 'error'; error: string };

interface ReportState {
  reports: ReportListItem[];
  isGenerating: boolean;
  isLoading: boolean;
  error: string | null;

  // Monthly digest
  digest: MonthlyDigestResponse | null;
  isLoadingDigest: boolean;

  // Backup
  isExporting: boolean;
  isRestoring: boolean;
  backupHistory: BackupHistoryItem[];

  // Preferences
  preferences: ReportPreferencesResponse | null;

  // Actions
  generateReport: (dto: GenerateReportDto) => Promise<string | null>;
  loadReports: () => Promise<void>;
  deleteReport: (reportId: string) => Promise<void>;
  shareReport: (reportId: string, fileName: string) => Promise<FileExportResult>;
  downloadReport: (reportId: string, fileName: string) => Promise<FileExportResult>;
  loadMonthlyDigest: (month: string) => Promise<void>;
  exportBackup: () => Promise<BackupExportResult>;
  restoreBackup: (data: string, overwrite: boolean) => Promise<{ restoredCounts: Record<string, number>; errors: string[] }>;
  loadBackupHistory: () => Promise<void>;
  loadPreferences: () => Promise<void>;
  updatePreferences: (dto: UpdateReportPreferencesDto) => Promise<void>;
  reset: () => void;
}

export const useReportStore = create<ReportState>()((set, get) => ({
  reports: [],
  isGenerating: false,
  isLoading: false,
  error: null,
  digest: null,
  isLoadingDigest: false,
  isExporting: false,
  isRestoring: false,
  backupHistory: [],
  preferences: null,

  generateReport: async (dto: GenerateReportDto) => {
    set({ isGenerating: true, error: null });
    try {
      const response = await api.generateReport(dto);
      // Reload reports list
      await get().loadReports();
      set({ isGenerating: false });
      return response.reportId;
    } catch (err) {
      set({
        isGenerating: false,
        error: err instanceof Error ? err.message : 'Failed to generate report',
      });
      return null;
    }
  },

  loadReports: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.listReports();
      set({ reports: response.reports, isLoading: false });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load reports',
      });
    }
  },

  deleteReport: async (reportId: string) => {
    try {
      await api.deleteReport(reportId);
      set(state => ({ reports: state.reports.filter(r => r.id !== reportId) }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete report' });
    }
  },

  shareReport: async (reportId: string, fileName: string) => {
    try {
      const blob = await api.downloadReport(reportId);
      const result = await shareFile(blob, fileName);
      if (result.status === 'error') set({ error: result.error });
      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to share report';
      set({ error });
      return { status: 'error' as const, error };
    }
  },

  downloadReport: async (reportId: string, fileName: string) => {
    try {
      const blob = await api.downloadReport(reportId);
      const result = await saveFile(blob, fileName);
      if (result.status === 'error') set({ error: result.error });
      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to download report';
      set({ error });
      return { status: 'error' as const, error };
    }
  },

  loadMonthlyDigest: async (month: string) => {
    set({ isLoadingDigest: true, error: null });
    try {
      const response = await api.getMonthlyDigest(month);
      set({ digest: response, isLoadingDigest: false });
    } catch (err) {
      set({
        isLoadingDigest: false,
        error: err instanceof Error ? err.message : 'Failed to load digest',
      });
    }
  },

  exportBackup: async (): Promise<BackupExportResult> => {
    set({ isExporting: true, error: null });
    try {
      const { blob, fileName } = await api.downloadBackupData();

      // Android: folder picker; iOS: share sheet; web: browser download.
      // A cancelled picker comes back as 'cancelled' and the caller stays quiet.
      const result = await saveFile(blob, fileName);

      await get().loadBackupHistory();
      set({ isExporting: false, error: result.status === 'error' ? result.error : null });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to export backup';
      set({ isExporting: false, error: message });
      return { status: 'error', error: message };
    }
  },

  restoreBackup: async (data: string, overwrite: boolean) => {
    set({ isRestoring: true, error: null });
    try {
      const response = await api.restoreBackup(data, overwrite);
      set({ isRestoring: false });
      return { restoredCounts: response.restoredCounts, errors: response.errors };
    } catch (err) {
      set({
        isRestoring: false,
        error: err instanceof Error ? err.message : 'Failed to restore backup',
      });
      return { restoredCounts: {}, errors: [err instanceof Error ? err.message : 'Unknown error'] };
    }
  },

  loadBackupHistory: async () => {
    try {
      const history = await api.getBackupHistory();
      set({ backupHistory: history });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load backup history' });
    }
  },

  loadPreferences: async () => {
    try {
      const prefs = await api.getReportPreferences();
      set({ preferences: prefs });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load preferences' });
    }
  },

  updatePreferences: async (dto: UpdateReportPreferencesDto) => {
    try {
      const prefs = await api.updateReportPreferences(dto);
      set({ preferences: prefs });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update preferences' });
    }
  },

  reset: () => {
    set({
      reports: [],
      isGenerating: false,
      isLoading: false,
      error: null,
      digest: null,
      isLoadingDigest: false,
      isExporting: false,
      isRestoring: false,
      backupHistory: [],
      preferences: null,
    });
  },
}));
