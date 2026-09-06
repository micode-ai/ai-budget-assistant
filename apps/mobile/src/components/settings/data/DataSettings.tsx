import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useTranslation } from 'react-i18next';
import { useExpenseStore } from '@/stores/expenseStore';
import { useAccountStore } from '@/stores/accountStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useWalletStore } from '@/stores/walletStore';
import { useBudgetStore } from '@/stores/budgetStore';
import { useReportStore } from '@/stores/reportStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useLocationSettingsStore } from '@/stores/locationSettingsStore';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/services/api';
import { requestLocationPermission } from '@/services/locationCapture';
import { getLastSyncTime } from '@/db/syncMetadataRepository';
import { useTheme, useStyles, type Theme } from '@/theme';
import { SettingsScreenScroll } from '../SettingsScreenScroll';

/**
 * The data & sync settings body: last-sync time and a manual sync, the
 * location-capture and community-price consent toggles, the weekly/monthly
 * report e-mail preferences, and backup export/restore.
 *
 * Lifted out of `app/settings/data.tsx` unchanged so the desktop settings shell
 * can host it - `src/` may not import from `app/`, so a route file is not
 * somewhere a pane can render from. The route is now a thin wrapper around
 * `SettingsRoute`, which is the one file that decides mobile vs desktop.
 *
 * Two mechanical differences from the original body, both required by that
 * hosting: the outer `SafeAreaView` is gone (`SettingsScreenFrame` supplies it
 * on the full-page path, with the same `edges={[]}` and the same background),
 * and the *root* `ScrollView` is `SettingsScreenScroll` - the same
 * `ScrollView` full-page, a plain `View` in a pane, because the shell owns the
 * page scroll. It carried only `style` and `contentContainerStyle`, so no prop
 * here becomes inert in a pane. **The nested horizontal `ScrollView` around the
 * weekday chips stays a real `ScrollView`** - it scrolls the other axis, so it
 * is not the second page scroll the design language forbids.
 *
 * ## An export or a restore in flight survives a pane switch, and nothing leaks
 *
 * This is the screen the wave was worried about: a pane keeps its component
 * mounted while the left nav sits beside it, so an action that assumed "the
 * screen goes away when the user leaves" needed checking. Every asynchronous
 * path here is safe, and for one structural reason:
 *
 * - **The in-flight flags live in the store, not in this component.**
 *   `isExporting` and `isRestoring` are `reportStore` fields, so the promise
 *   resolves into `set(...)` on a store that outlives any mount. Come back to
 *   the pane mid-export and the row still reads "Exporting..." with its
 *   spinner, because the truth was never component state.
 * - **Completion feedback is global.** `showAlert` hands the web dialog to
 *   `alertDialogStore`, rendered by `AlertDialogHost` at the root of
 *   `app/_layout.tsx` - outside `WebShell` and outside the `Stack`. So the
 *   "backup saved" / "restore failed" answer appears whichever pane is showing.
 * - **The restore confirmation is likewise independent of this component.** The
 *   backup text is captured in the alert buttons' own closures and the
 *   `onPress` calls a store action, so answering the dialog still restores even
 *   if the user moved on while it was open.
 * - **The only component state is self-healing.** `lastSyncTime` and
 *   `isSyncing` are `useState`; a resolution after unmount is a no-op under
 *   React 18, and a remount re-reads `getLastSyncTime()` and starts from
 *   `isSyncing: false`.
 *
 * Nothing here holds a resource that must be explicitly released - no
 * listener, timer, recorder or watch. The document picker and the file write
 * are one-shot calls that own their own lifetime.
 *
 * ## Not keyed on `currentAccountId`, and checked rather than assumed
 *
 * A pane stays mounted while the account switcher in `WebTopBar` stays
 * reachable above it, so a screen that snapshots account-scoped data on mount
 * would go on showing the previous account's. Nothing here does:
 *
 * - `getLastSyncTime()` reads one `sync_metadata` row keyed `'lastSyncTime'`,
 *   with no account column - device-level.
 * - Report preferences are per-user: the client sends no account parameter,
 *   `ReportsController.getPreferences`/`updatePreferences` pass `req.user.id`
 *   and never `req.accountId` (the class does carry `AccountContextGuard`, so
 *   the field is populated - the handlers simply do not read it), and the
 *   service reads three `User` columns.
 * - The community-price consent is `User.contributeCommunityPrices`, and the
 *   location toggle and tier are device/user settings. All three are read
 *   through live store selectors, so they track without a remount anyway.
 */
export function DataSettings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const { preferences: reportPrefs, loadPreferences: loadReportPrefs, updatePreferences: updateReportPrefs, exportBackup, isExporting, restoreBackup, isRestoring } = useReportStore();
  const isBusinessTier = useSubscriptionStore((s) => s.isBusiness());
  const captureEnabled = useLocationSettingsStore((s) => s.captureEnabled);
  const setCaptureEnabled = useLocationSettingsStore((s) => s.setCaptureEnabled);
  const contributeCommunityPrices = useAuthStore((s) => s.user?.contributeCommunityPrices ?? false);
  const updateUser = useAuthStore((s) => s.updateUser);

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
        // Refresh the account list from the server too — otherwise an account
        // joined server-side (e.g. accepting an invitation) has no manual way to
        // appear on the current build (the list is otherwise local-first).
        useAccountStore.getState().loadAccountsFromServer(),
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

  const handleToggleLocation = async (value: boolean) => {
    if (!value) {
      setCaptureEnabled(false);
      return;
    }
    const granted = await requestLocationPermission();
    if (!granted) {
      showAlert(t('location.sectionTitle'), t('location.permissionDenied'));
      return;
    }
    setCaptureEnabled(true);
  };

  // Community price contribution is a server-stored consent flag (not a device
  // setting), so it round-trips through the profile API. Optimistic + revert.
  const handleToggleCommunityPrices = useCallback((value: boolean) => {
    updateUser({ contributeCommunityPrices: value });
    api.updateProfile({ contributeCommunityPrices: value }).catch((e) => {
      console.warn('Failed to update community-price consent', e);
      updateUser({ contributeCommunityPrices: !value });
    });
  }, [updateUser]);

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
      } else if (result.status === 'error') {
        showAlert(t('common.error'), result.error || t('errors.unknown'));
      }
      // 'cancelled' — the user backed out of the folder picker, so say nothing.
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
    <SettingsScreenScroll style={styles.scrollView} contentContainerStyle={styles.content}>
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

      {/* Location */}
      {Platform.OS !== 'web' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('location.sectionTitle')}</Text>
          <View style={styles.card}>
            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('location.attachToggle')}</Text>
                <Text style={styles.fieldDesc}>{t('location.attachToggleDesc')}</Text>
              </View>
              <Switch
                value={captureEnabled}
                onValueChange={handleToggleLocation}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              />
            </View>
          </View>
        </View>
      )}

      {/* Community prices (ABA-335) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('communityPrices.sectionTitle')}</Text>
        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('communityPrices.contributeToggle')}</Text>
              <Text style={styles.fieldDesc}>{t('communityPrices.contributeToggleDesc')}</Text>
            </View>
            <Switch
              value={contributeCommunityPrices}
              onValueChange={handleToggleCommunityPrices}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
            />
          </View>
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
    </SettingsScreenScroll>
  );
}

const createStyles = (theme: Theme) => ({
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
