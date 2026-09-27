import React, { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, Share, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useRealSalary } from '@/features/insights/useRealSalary';
import {
  formatSignedPct,
  toneOf,
  statusCopy,
  requiredRaiseKey,
  buildShareLines,
  briefErrorKind,
  type Tone,
} from '@/features/insights/realSalary';
import { RealSalaryShareCard, type RealSalaryShareCardHandle } from '@/components/real-salary/RealSalaryShareCard';
import { api } from '@/services/api';
import { saveFile } from '@/services/fileExport';
import { showAlert } from '@/utils/alert';
import i18n from '@/i18n';
import { useUpgradeStore } from '@/stores/upgradeStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useAccountStore } from '@/stores/accountStore';

export default function RealSalaryScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { data, loading, error, reload } = useRealSalary();
  const canEdit = useAccountStore((s) => s.canEdit());
  const isPro = useSubscriptionStore((s) => s.isPro());

  const shareRef = useRef<RealSalaryShareCardHandle>(null);
  const [briefBusy, setBriefBusy] = useState(false);

  const copy = data ? statusCopy(data.status) : null;
  const showReady = !!data && !copy;

  const toneColor = useCallback(
    (tone: Tone) => {
      if (tone === 'negative') return theme.colors.danger;
      if (tone === 'positive') return theme.colors.success;
      return theme.colors.textPrimary;
    },
    [theme],
  );

  const onShare = useCallback(async () => {
    if (!data) return;
    const lines = buildShareLines(data, t);
    const footer = t('realSalary.share.footer');
    try {
      const ok = await shareRef.current?.share({ title: t('realSalary.share.title'), lines, footer });
      if (ok) return;
    } catch {
      // fall through to text share
    }
    try {
      await Share.share({
        message: [t('realSalary.share.title'), ...lines.map((l) => `${l.emoji} ${l.label}: ${l.value}`)].join('\n'),
      });
    } catch {
      // user dismissed / unavailable — no-op
    }
  }, [data, t]);

  const onBrief = useCallback(async () => {
    setBriefBusy(true);
    try {
      const { blob, fileName } = await api.downloadRealSalaryBrief(i18n.language);
      await saveFile(blob, fileName);
    } catch (e) {
      const kind = briefErrorKind(e);
      if (kind === 'paywall') {
        useUpgradeStore.getState().show(t('realSalary.brief'), 'pro');
      } else {
        showAlert(t('common.error'), t(kind === 'not_ready' ? 'realSalary.briefNotReady' : 'realSalary.briefFailed'));
      }
    } finally {
      setBriefBusy(false);
    }
  }, [t]);

  const breakdown = data ? [...data.breakdown].sort((a, b) => b.weight - a.weight) : [];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/real-salary/settings')}
              style={styles.headerButton}
              accessibilityLabel={t('realSalary.settings')}
            >
              <Ionicons name="options-outline" size={24} color={theme.colors.textInverse} />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={theme.colors.primary} />}
      >
        {loading && !data ? (
          <ActivityIndicator style={styles.spinner} size="large" color={theme.colors.primary} />
        ) : error && !data ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={theme.colors.danger} />
            <Text style={styles.errorText}>{t('common.error')}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={reload}>
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {copy && (
              <View style={styles.statusCard}>
                <Text style={styles.statusTitle}>{t(copy.titleKey)}</Text>
                <Text style={styles.statusBody}>{t(copy.bodyKey)}</Text>
                {copy.action && (copy.action !== 'setup' || canEdit) && (
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() =>
                      router.push(copy.action === 'setup' ? '/real-salary/setup' : '/real-salary/settings')
                    }
                  >
                    <Text style={styles.primaryButtonText}>
                      {t(copy.action === 'setup' ? 'realSalary.setupAction' : 'realSalary.settingsAction')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {showReady && data && (
              <>
                <View style={styles.hero}>
                  <Text style={styles.heroLabel}>{t('realSalary.heroLabel')}</Text>
                  <Text style={[styles.heroValue, { color: toneColor(toneOf(data.realChangePct)) }]}>
                    {formatSignedPct(data.realChangePct)}
                  </Text>
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>{t('realSalary.pay')}</Text>
                    <Text style={styles.rowValue}>{formatSignedPct(data.nominalChangePct)}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>{t('realSalary.inflation')}</Text>
                    <Text style={styles.rowValue}>{formatSignedPct(data.personalInflationPct)}</Text>
                  </View>
                  <Text style={styles.requiredRaise}>
                    {t(requiredRaiseKey(data.requiredRaisePct), { value: formatSignedPct(data.requiredRaisePct) })}
                  </Text>
                </View>

                <View style={styles.card}>
                  <Text style={styles.cardTitle}>{t('realSalary.breakdownTitle')}</Text>
                  {breakdown.map((row) => (
                    <View key={row.division} style={styles.breakdownRow}>
                      <Text style={styles.breakdownDivision} numberOfLines={1}>
                        {t(`realSalary.division.${row.division}`)}
                      </Text>
                      <Text style={styles.breakdownWeight}>{Math.round(row.weight * 100)}%</Text>
                      <Text style={styles.breakdownRate}>{formatSignedPct(row.ratePct)}</Text>
                      <View style={styles.sourceTag}>
                        <Text style={styles.sourceTagText}>
                          {t(row.source === 'receipts' ? 'realSalary.sourceReceipts' : 'realSalary.sourceOfficial')}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={styles.footnotes}>
                  <Text style={styles.footnote}>
                    {data.dataMonth ? t('realSalary.dataMonth', { month: data.dataMonth }) : t('realSalary.receiptsOnly')}
                  </Text>
                  {data.fxApproximate && <Text style={styles.footnote}>{t('realSalary.fxApproximate')}</Text>}
                  <Text style={styles.disclaimer}>{t('realSalary.disclaimer')}</Text>
                </View>

                <View style={styles.actions}>
                  <TouchableOpacity style={styles.actionButton} onPress={onShare} disabled={briefBusy}>
                    <Ionicons name="share-outline" size={18} color={theme.colors.textInverse} />
                    <Text style={styles.actionButtonText}>{t('common.share')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.secondaryActionButton]}
                    onPress={onBrief}
                    disabled={briefBusy}
                  >
                    {briefBusy ? (
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                    ) : (
                      <Ionicons name="document-text-outline" size={18} color={theme.colors.primary} />
                    )}
                    <Text style={styles.secondaryActionButtonText}>{t('realSalary.brief')}</Text>
                    {!isPro && (
                      <View style={styles.proBadge}>
                        <Text style={styles.proBadgeText}>{t('realSalary.briefPro')}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
      <RealSalaryShareCard ref={shareRef} />
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing[4] },
  headerButton: { marginRight: theme.spacing[4] },

  spinner: { paddingVertical: theme.spacing[10] },

  errorContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[10],
  },
  errorText: { ...theme.textStyles.body, color: theme.colors.danger, textAlign: 'center' as const },
  retryButton: {
    paddingHorizontal: theme.spacing[5],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
  },
  retryText: { ...theme.textStyles.button, color: theme.colors.textInverse },

  statusCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  statusTitle: { ...theme.textStyles.h1, fontSize: 18, color: theme.colors.textPrimary, textAlign: 'center' as const },
  statusBody: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, textAlign: 'center' as const },
  primaryButton: {
    marginTop: theme.spacing[2],
    paddingHorizontal: theme.spacing[5],
    paddingVertical: theme.spacing[2.5],
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
  },
  primaryButtonText: { ...theme.textStyles.bodyMedium, color: theme.colors.textInverse },

  hero: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[6],
    gap: theme.spacing[1],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing[4],
  },
  heroLabel: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary },
  heroValue: { ...theme.textStyles.display, marginTop: theme.spacing[1] },
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    width: '100%' as const,
    paddingHorizontal: theme.spacing[6],
    marginTop: theme.spacing[3],
  },
  rowLabel: { ...theme.textStyles.body, color: theme.colors.textSecondary },
  rowValue: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary },
  requiredRaise: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[3],
    textAlign: 'center' as const,
    paddingHorizontal: theme.spacing[6],
  },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, marginBottom: theme.spacing[3] },
  breakdownRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  breakdownDivision: { ...theme.textStyles.bodySm, color: theme.colors.textPrimary, flex: 1 },
  breakdownWeight: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, width: 40, textAlign: 'right' as const },
  breakdownRate: { ...theme.textStyles.bodySmMedium, color: theme.colors.textPrimary, width: 60, textAlign: 'right' as const },
  sourceTag: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[0.5],
  },
  sourceTagText: { ...theme.textStyles.caption, color: theme.colors.textTertiary },

  footnotes: { gap: theme.spacing[1], marginBottom: theme.spacing[4] },
  footnote: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  disclaimer: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginTop: theme.spacing[1] },

  actions: { flexDirection: 'row' as const, gap: theme.spacing[3] },
  actionButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2.5],
    paddingHorizontal: theme.spacing[3],
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
  },
  actionButtonText: { ...theme.textStyles.bodyMedium, color: theme.colors.textInverse },
  secondaryActionButton: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  secondaryActionButtonText: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
  proBadge: {
    backgroundColor: theme.colors.warningLight,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[0.5],
  },
  proBadgeText: { ...theme.textStyles.caption, color: theme.colors.warning },
});
