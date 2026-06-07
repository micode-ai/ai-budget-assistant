import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useTranslation } from 'react-i18next';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useWalletStore } from '@/stores/walletStore';
import { useBudgetStore } from '@/stores/budgetStore';
import { useReportStore } from '@/stores/reportStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { getLastSyncTime } from '@/db/syncMetadataRepository';
import { useTheme, useStyles, type Theme } from '@/theme';

export default function DataSettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const { preferences: reportPrefs, loadPreferences: loadReportPrefs, updatePreferences: updateReportPrefs, exportBackup, isExporting, restoreBackup, isRestoring } = useReportStore();
  const isBusinessTier = useSubscriptionStore((s) => s.isBusiness());

  const [lastSyncTime, setLastSyncTimeState] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    getLastSyncTime().then(setLastSyncTimeState);
    loadReportPrefs();
  }, [loadReportPrefs]);

  const formatLastSyncTime = useCallback((timestamp: number | null): string => {
    if (!timestamp) return t('settings.neverSynced');
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t('settings.justNow');
    if (minutes < 60) return t('settings.minutesAgo', { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('settings.hoursAgo', { count: hours });
    return new Date(timestamp).toLocaleString();
  }, [t]);

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      await Promise.allSettled([
        useExpenseStore.getState().loadExpenses({ force: true }),
        useIncomeStore.getState().loadIncomes({ force: true }),
        useCategoryStore.getState().loadCategories(),
        useWalletStore.getState().loadWallet(),
        useBudgetStore.getState().loadBudgets(),
      ]);
      const time = await getLastSyncTime();
      setLastSyncTimeState(time);
      showAlert(t('common.success'), t('settings.syncComplete'));
    } catch {
      showAlert(t('common.error'), t('settings.syncFailed'));
    } finally {
      setIsSyncing(false);
    }
  };

  const WEEK_DAYS = [
    { value: 0, label: t('reports.sunday') },
    { value: 1, label: t('reports.monday') },
    { value: 2, label: t('reports.tuesday') },
    { value: 3, label: t('reports.wednesday') },
    { value: 4, label: t('reports.thursday') },
    { value: 5, label: t('reports.friday') },
    { value: 6, label: t('reports.saturday') },
  ];

  const handleToggleWeeklyEmail = async (value: boolean) => {
    try {
      await updateReportPrefs({ weeklyEmailEnabled: value });
    } catch (e) {
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleToggleMonthlyDigest = async (value: boolean) => {
    try {
      await updateReportPrefs({ monthlyDigestEnabled: value });
    } catch (e) {
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleWeeklyEmailDay = async (day: number) => {
    try {
      await updateReportPrefs({ weeklyEmailDay: day });
    } catch (e) {
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleExportBackup = async () => {
    try {
      const result = await exportBackup();
      if (result.status === 'saved') {
        showAlert(t('common.success'), t('reports.backupSavedTo', { location: result.location }));
      } else if (result.status === 'shared') {
        showAlert(t('common.success'), t('reports.backupShared'));
      } else {
        showAlert(t('common.error'), result.error || t('errors.unknown'));
      }
    } catch (e) {
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleImportBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (result.canceled) return;

      const asset = result.assets[0];
      const file = new File(asset.uri);
      const data = await file.text();

      try {
        const parsed = JSON.parse(data);
        if (!parsed.version || !parsed.data) {
          showAlert(t('common.error'), t('errors.unknown'));
          return;
        }
      } catch {
        showAlert(t('common.error'), t('errors.unknown'));
        return;
      }

      showAlert(
        t('reports.restoreConfirmTitle'),
        t('reports.restoreConfirmMerge'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('reports.overwrite'),
            style: 'destructive',
            onPress: async () => {
              showAlert(
                t('reports.restoreConfirmTitle'),
                t('reports.restoreConfirmOverwrite'),
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('reports.overwrite'),
                    style: 'destructive',
                    onPress: async () => {
                      const res = await restoreBackup(data, true);
                      if (res.errors.length === 0) {
                        showAlert(t('common.success'), t('reports.backupRestored'));
                      } else {
                        showAlert(t('common.error'), res.errors.join('\n'));
                      }
                    },
                  },
                ],
              );
            },
          },
          {
            text: t('reports.merge'),
            onPress: async () => {
              const res = await restoreBackup(data, false);
              if (res.errors.length === 0) {
                showAlert(t('common.success'), t('reports.backupRestored'));
              } else {
                showAlert(t('common.error'), res.errors.join('\n'));
              }
            },
          },
        ],
      );
    } catch (e) {
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Data & Sync */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.dataSync')}</Text>
          <View style={styles.card}>
            <View style={styles.fieldRow}>
              <View style={[styles.fieldValueRow, { flex: 1 }]}>
                <Ionicons name="sync-outline" size={18} color={theme.colors.textSecondary} />
                <Text style={styles.fieldLabel}>{t('settings.lastSynced')}</Text>
              </View>
              <Text style={[styles.fieldValue, { flexShrink: 0 }]}>
                {formatLastSyncTime(lastSyncTime)}
              </Text>
            </View>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.fieldRow}
              onPress={handleSyncNow}
              disabled={isSyncing}
            >
              <View style={styles.fieldValueRow}>
                <Ionicons name="refresh-outline" size={18} color={theme.colors.textSecondary} />
                <Text style={styles.fieldLabel}>
                  {isSyncing ? t('settings.syncing') : t('settings.syncNow')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Reports & Email */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('reports.settingsTitle')}</Text>
          <View style={styles.card}>
            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('reports.weeklyEmail')}</Text>
                <Text style={styles.fieldDesc}>{t('reports.weeklyEmailDesc')}</Text>
              </View>
              <Switch
                value={reportPrefs?.weeklyEmailEnabled ?? false}
                onValueChange={handleToggleWeeklyEmail}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              />
            </View>

            {reportPrefs?.weeklyEmailEnabled && (
              <>
                <View style={styles.divider} />
                <Text style={[styles.fieldLabel, { marginBottom: theme.spacing[2] }]}>{t('reports.sendOn')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipRow}>
                    {WEEK_DAYS.map((day) => (
                      <TouchableOpacity
                        key={day.value}
                        style={[styles.chip, reportPrefs?.weeklyEmailDay === day.value && styles.chipActive]}
                        onPress={() => handleWeeklyEmailDay(day.value)}
                      >
                        <Text style={[styles.chipText, reportPrefs?.weeklyEmailDay === day.value && styles.chipTextActive]}>
                          {day.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            <View style={styles.divider} />

            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('reports.monthlyDigest')}</Text>
                <Text style={styles.fieldDesc}>{t('reports.monthlyDigestDesc')}</Text>
              </View>
              <Switch
                value={reportPrefs?.monthlyDigestEnabled ?? false}
                onValueChange={handleToggleMonthlyDigest}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              />
            </View>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.fieldRow}
              onPress={() => router.push('/reports')}
            >
              <View style={styles.fieldValueRow}>
                <Ionicons name="document-text-outline" size={18} color={theme.colors.textSecondary} />
                <Text style={styles.fieldLabel}>{t('reports.generateReport')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.fieldRow}
              onPress={handleExportBackup}
              disabled={isExporting}
            >
              <View style={styles.fieldValueRow}>
                <Ionicons name="cloud-download-outline" size={18} color={theme.colors.textSecondary} />
                <Text style={styles.fieldLabel}>
                  {isExporting ? t('reports.exporting') : t('reports.exportBackup')}
                </Text>
              </View>
              {isExporting ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
              )}
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.fieldRow}
              onPress={handleImportBackup}
              disabled={isRestoring}
            >
              <View style={styles.fieldValueRow}>
                <Ionicons name="cloud-upload-outline" size={18} color={theme.colors.textSecondary} />
                <Text style={styles.fieldLabel}>
                  {isRestoring ? t('reports.restoring') : t('reports.restoreBackup')}
                </Text>
              </View>
              {isRestoring ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
  },
  section: {
    marginBottom: theme.spacing[6],
  },
  sectionTitle: {
    ...theme.textStyles.label,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[3],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
  },
  fieldRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    minHeight: 32,
  },
  fieldLabel: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
  },
  fieldValue: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  fieldDesc: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
  fieldValueRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginVertical: theme.spacing[3],
  },
  chipRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  chipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  chipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
  },
  chipTextActive: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },
});
