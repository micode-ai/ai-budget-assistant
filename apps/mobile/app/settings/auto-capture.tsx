/**
 * Auto-Capture Settings screen.
 * Android only — shows an "Android only" note on iOS/web (Platform guard).
 * Linked from apps/mobile/app/settings/import/index.tsx.
 *
 * UX flow:
 *  1. Explains what auto-capture does and the on-device privacy guarantee.
 *  2. Permission status + one-tap grant button (opens OS settings).
 *  3. Feature toggle (only meaningful once permission is granted).
 *  4. Bank allow-list (informational; shows which banks are supported).
 *  5. "Last captured" review list (from local expenseStore, source='notification').
 *
 * canEdit-gated — viewers see the list but cannot toggle the feature.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Switch,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useAccountStore } from '@/stores/accountStore';
import { useExpenseStore } from '@/stores/expenseStore';
import {
  isPermissionGranted,
  openPermissionSettings,
  setEnabled,
  isEnabled,
  BANK_PACKAGES_DISPLAY,
} from '@/services/notificationCapture';
import {
  subscribeToCapture,
  unsubscribeFromCapture,
} from '@/services/notificationCapture/captureService';

export default function AutoCaptureScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const canEdit = useAccountStore((s) => s.canEdit());

  const [permissionGranted, setPermissionGranted] = useState(false);
  const [captureEnabled, setCaptureEnabled] = useState(false);
  const [checkingPermission, setCheckingPermission] = useState(true);

  // The user tapped "enable" before granting the OS permission, so we opened the
  // system settings screen and bailed. When they return with permission granted,
  // finish turning the feature on automatically instead of making them tap again.
  const pendingEnable = useRef(false);

  // Expenses captured via notification (for the review list)
  const expenses = useExpenseStore((s) => s.expenses);
  const capturedExpenses = expenses
    .filter((e) => e.source === 'notification' && !e.isDeleted)
    .slice(0, 10);

  const checkPermission = useCallback(async () => {
    setCheckingPermission(true);
    try {
      const granted = await isPermissionGranted();
      setPermissionGranted(granted);
      if (granted && pendingEnable.current) {
        // Returned from the OS settings screen with permission now granted and a
        // pending intent to enable — complete it (write the flag + start capture).
        pendingEnable.current = false;
        await setEnabled(true);
        subscribeToCapture();
        setCaptureEnabled(true);
      } else {
        const enabled = await isEnabled();
        setCaptureEnabled(granted && enabled);
      }
    } catch {
      setPermissionGranted(false);
      setCaptureEnabled(false);
    } finally {
      setCheckingPermission(false);
    }
  }, []);

  // Re-check on focus (user may have returned from OS settings screen)
  useFocusEffect(
    useCallback(() => {
      checkPermission();
    }, [checkPermission]),
  );

  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  const handleToggle = async (value: boolean) => {
    if (!canEdit) return;
    if (value && !permissionGranted) {
      // Redirect to OS settings first; remember the intent so we auto-enable on return.
      pendingEnable.current = true;
      await openPermissionSettings();
      return;
    }
    try {
      await setEnabled(value);
      setCaptureEnabled(value);
      // Start or stop the live subscription immediately so capture takes effect
      // in the current session without requiring an app restart.
      if (value) {
        subscribeToCapture();
      } else {
        unsubscribeFromCapture();
      }
    } catch {
      // Silently ignore — the user can retry
    }
  };

  const handleGrantPermission = async () => {
    // Granting permission implies intent to use the feature — auto-enable on return.
    pendingEnable.current = true;
    await openPermissionSettings();
    // Permission check happens on focus return via useFocusEffect
  };

  // iOS / web guard
  if (Platform.OS !== 'android') {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <View style={styles.androidOnlyBanner}>
              <Ionicons name="logo-android" size={24} color={theme.colors.textSecondary} />
              <Text style={styles.androidOnlyText}>{t('autoCapture.androidOnly')}</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Description */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('autoCapture.title')}</Text>
          <Text style={styles.sectionSubtitle}>{t('autoCapture.subtitle')}</Text>
          <View style={styles.privacyRow}>
            <Ionicons name="lock-closed-outline" size={16} color={theme.colors.success} />
            <Text style={styles.privacyText}>{t('autoCapture.privacy')}</Text>
          </View>
        </View>

        {/* Permission status */}
        <Text style={styles.sectionHeader}>{t('autoCapture.grantPermission')}</Text>
        <View style={styles.card}>
          {checkingPermission ? (
            <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
          ) : permissionGranted ? (
            <View style={styles.permissionRow}>
              <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
              <Text style={styles.permissionGrantedText}>{t('autoCapture.permissionGranted')}</Text>
            </View>
          ) : (
            <View>
              <Text style={styles.permissionHint}>{t('autoCapture.grantPermission')}</Text>
              <TouchableOpacity
                style={[styles.button, !canEdit && styles.buttonDisabled]}
                onPress={handleGrantPermission}
                disabled={!canEdit}
                activeOpacity={0.7}
              >
                <Text style={styles.buttonText}>{t('autoCapture.grantPermission')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Enable toggle */}
        <Text style={styles.sectionHeader}>{t('autoCapture.enable')}</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t('autoCapture.enable')}</Text>
            <Switch
              value={captureEnabled}
              onValueChange={handleToggle}
              disabled={!canEdit || checkingPermission}
              trackColor={{ false: theme.colors.divider, true: theme.colors.primary }}
              thumbColor={theme.colors.textInverse}
            />
          </View>
          {!permissionGranted && (
            <Text style={styles.toggleHint}>{t('autoCapture.grantPermission')}</Text>
          )}
        </View>

        {/* Bank allow-list — grouped by country */}
        <Text style={styles.sectionHeader}>{t('autoCapture.banks')}</Text>
        {(() => {
          // Group banks by country preserving first-seen order
          const groups: { country: string; banks: typeof BANK_PACKAGES_DISPLAY[number][] }[] = [];
          const countryIndex: Record<string, number> = {};
          for (const bank of BANK_PACKAGES_DISPLAY) {
            if (countryIndex[bank.country] === undefined) {
              countryIndex[bank.country] = groups.length;
              groups.push({ country: bank.country, banks: [] });
            }
            groups[countryIndex[bank.country]].banks.push(bank);
          }
          const COUNTRY_LABELS: Record<string, string> = {
            PL: 'Poland', EU: 'Europe', DE: 'Germany / Austria', FR: 'France',
            ES: 'Spain', NL: 'Netherlands', UA: 'Ukraine', RU: 'Russia', BY: 'Belarus',
          };
          return groups.map((group) => (
            <View key={group.country} style={styles.card}>
              <Text style={styles.bankGroupHeader}>
                {COUNTRY_LABELS[group.country] ?? group.country}
              </Text>
              {group.banks.map((bank, index) => (
                <View
                  key={bank.packageName}
                  style={[
                    styles.bankRow,
                    index < group.banks.length - 1 && styles.bankRowDivider,
                  ]}
                >
                  <Ionicons name="business-outline" size={18} color={theme.colors.primary} />
                  <Text style={styles.bankLabel}>{bank.label}</Text>
                  <Ionicons name="checkmark" size={16} color={theme.colors.success} />
                </View>
              ))}
            </View>
          ));
        })()}

        {/* Last captured review */}
        <Text style={styles.sectionHeader}>{t('autoCapture.reviewLast')}</Text>
        <View style={styles.card}>
          {capturedExpenses.length === 0 ? (
            <Text style={styles.emptyText}>{t('autoCapture.testTitle')}</Text>
          ) : (
            capturedExpenses.map((expense, index) => (
              <TouchableOpacity
                key={expense.id}
                style={[
                  styles.capturedRow,
                  index < capturedExpenses.length - 1 && styles.capturedRowDivider,
                ]}
                onPress={() => router.push(`/expense/${expense.id}` as any)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.capturedMerchant}>
                    {expense.merchant || expense.description}
                  </Text>
                  <Text style={styles.capturedMeta}>
                    {expense.amount.toFixed(2)} {expense.currencyCode}
                    {' · '}
                    {new Date(expense.date).toLocaleDateString()}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            ))
          )}
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
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
  },
  sectionHeader: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textTransform: 'uppercase' as const,
    marginTop: theme.spacing[4],
    marginBottom: theme.spacing[2],
    marginHorizontal: theme.spacing[1],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[2],
  },
  sectionTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[2],
  },
  sectionSubtitle: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[3],
  },
  privacyRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.successLight ?? theme.colors.background,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
  },
  privacyText: {
    ...theme.textStyles.caption,
    color: theme.colors.success,
    flex: 1,
  },
  loader: {
    paddingVertical: theme.spacing[2],
  },
  permissionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  permissionGrantedText: {
    ...theme.textStyles.body,
    color: theme.colors.success,
    fontFamily: theme.fonts.semiBold,
  },
  permissionHint: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[3],
  },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing[3],
    alignItems: 'center' as const,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    ...theme.textStyles.body,
    color: theme.colors.textInverse,
    fontFamily: theme.fonts.semiBold,
  },
  toggleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  toggleLabel: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  toggleHint: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[2],
  },
  bankGroupHeader: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textTransform: 'uppercase' as const,
    fontFamily: theme.fonts.semiBold,
    marginBottom: theme.spacing[2],
  },
  bankRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
    gap: theme.spacing[3],
  },
  bankRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  bankLabel: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  capturedRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
  },
  capturedRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  capturedMerchant: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    fontFamily: theme.fonts.medium,
  },
  capturedMeta: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  emptyText: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[2],
  },
  androidOnlyBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  androidOnlyText: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    flex: 1,
  },
});
