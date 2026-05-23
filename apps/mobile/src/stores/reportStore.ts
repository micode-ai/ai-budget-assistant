import { create } from 'zustand';
import { Platform } from 'react-native';
import { api } from '@/services/api';
import { File, Directory, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type {
  GenerateReportDto,
  ReportListItem,
  MonthlyDigestResponse,
  BackupHistoryItem,
  UpdateReportPreferencesDto,
  ReportPreferencesResponse,
} from '@budget/shared-types';

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
  shareReport: (reportId: string, fileName: string) => Promise<void>;
  downloadReport: (reportId: string, fileName: string) => Promise<void>;
  loadMonthlyDigest: (month: string) => Promise<void>;
  exportBackup: () => Promise<void>;
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
      const ext = fileName.split('.').pop()?.toLowerCase();
      const mimeTypes: Record<string, string> = {
        pdf: 'application/pdf',
        csv: 'text/csv',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
      const mimeType = mimeTypes[ext || ''] || 'application/octet-stream';

      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          resolve(dataUrl.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const file = new File(Paths.cache, fileName);
      file.write(base64, { encoding: 'base64' });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType,
          dialogTitle: fileName,
        });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to share report' });
    }
  },

  downloadReport: async (reportId: string, fileName: string) => {
    try {
      const blob = await api.downloadReport(reportId);
      const ext = fileName.split('.').pop()?.toLowerCase();
      const mimeTypes: Record<string, string> = {
        pdf: 'application/pdf',
        csv: 'text/csv',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
      const mimeType = mimeTypes[ext || ''] || 'application/octet-stream';

      let saved = false;

      // Android: save directly to user-chosen directory via SAF
      if (Platform.OS === 'android') {
        try {
          const dir = await Directory.pickDirectoryAsync();
          const destFile = dir.createFile(fileName, mimeType);
          if (ext === 'csv') {
            const text = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsText(blob);
            });
            destFile.write(text);
          } else {
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const dataUrl = reader.result as string;
                resolve(dataUrl.split(',')[1]);
              };
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            destFile.write(bytes);
          }
          saved = true;
        } catch {
          // SAF picker cancelled or failed, fall through to sharing
        }
      }

      // iOS / fallback: open share sheet so user can save to Files
      if (!saved) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            resolve(dataUrl.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        const file = new File(Paths.cache, fileName);
        file.write(base64, { encoding: 'base64' });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, {
            mimeType,
            dialogTitle: fileName,
          });
        }
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to download report' });
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

  exportBackup: async () => {
    set({ isExporting: true, error: null });
    try {
      const response = await api.exportBackup();
      const blob = await api.downloadBackupData();
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(blob);
      });

      let saved = false;

      // Android: save directly to user-chosen directory via SAF
      if (Platform.OS === 'android') {
        try {
          const dir = await Directory.pickDirectoryAsync();
          const destFile = dir.createFile(response.fileName, 'application/json');
          destFile.write(content);
          saved = true;
        } catch {
          // SAF picker cancelled or failed, fall through to sharing
        }
      }

      // Fallback: share via system sheet (iOS or if SAF was cancelled)
      if (!saved) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader2 = new FileReader();
          reader2.onloadend = () => {
            const dataUrl = reader2.result as string;
            resolve(dataUrl.split(',')[1]);
          };
          reader2.onerror = reject;
          reader2.readAsDataURL(blob);
        });

        const file = new File(Paths.cache, response.fileName);
        file.write(base64, { encoding: 'base64' });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, {
            mimeType: 'application/json',
            dialogTitle: response.fileName,
          });
        }
      }

      await get().loadBackupHistory();
      set({ isExporting: false });
    } catch (err) {
      set({
        isExporting: false,
        error: err instanceof Error ? err.message : 'Failed to export backup',
      });
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
