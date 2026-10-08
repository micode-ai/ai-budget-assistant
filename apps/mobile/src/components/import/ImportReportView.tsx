import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { Currency, ImportReportResponse } from '@budget/shared-types';
import { api } from '@/services/api';
import { trackAction } from '@/services/telemetry';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useAuthStore } from '@/stores/authStore';
import { useBudgetStore } from '@/stores/budgetStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useUserSubscriptionStore } from '@/stores/userSubscriptionStore';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';
import { getIntlLocale } from '@/i18n';
import { rollForwardRenewal, startOfMonth } from '@/features/import/importReport';
import { exitImportFlow } from '@/features/import/importExit';

/**
 * The instant report after a statement import (ABA-643): where the money went, the subscriptions
 * and possible duplicates in it, the biggest merchants, and suggested monthly budgets — then one
 * tap turns the checked suggestions into real budgets and tracked subscriptions.
 *
 * Server-computed (`GET /import/batches/:id/report`), so it reads the same on web, which has no
 * SQLite. Nothing is created until the user taps; a duplicate is only flagged, never removed.
 */
export function ImportReportView({ batchId }: { batchId: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const intlLocale = getIntlLocale();
  const user = useAuthStore((s) => s.user);
  const categories = useCategoryStore((s) => s.categories);

  const [report, setReport] = useState<ImportReportResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [pickedSubs, setPickedSubs] = useState<Set<number>>(new Set());
  const [pickedBudgets, setPickedBudgets] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<{ budgets: number; subs: number } | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getImportReport(batchId)
      .then((r) => {
        if (cancelled) return;
        setReport(r);
        // Everything suggested starts checked — the one tap applies them all unless unchecked.
        setPickedSubs(new Set(r.subscriptions.map((_, i) => i)));
        setPickedBudgets(new Set(r.budgetSuggestions.map((b) => b.categoryId)));
        if (r.hasEnoughData && !startedRef.current) {
          startedRef.current = true;
          trackAction('import_report', 'started');
        }
      })
      .catch((e) => {
        console.warn('Failed to load import report', e);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  const base = report?.baseCurrency ?? user?.currencyCode ?? 'USD';
  const money = useCallback((n: number, cur?: string) => formatCurrency(n, cur ?? base), [base]);

  // A category from an import carries the server id; after a pull the local store holds the same id.
  const categoryLabel = useCallback(
    (id: string | null, fallback: string) => {
      const local = id ? categories.find((c) => c.id === id || c.clientId === id) : undefined;
      if (local) return getCategoryDisplayName(local, t);
      return id ? fallback : t('common.uncategorized');
    },
    [categories, t],
  );

  const formatDay = useCallback(
    (day: string) =>
      new Date(`${day}T12:00:00`).toLocaleDateString(intlLocale, { day: 'numeric', month: 'short' }),
    [intlLocale],
  );

  const toggle = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const pickedCount = pickedSubs.size + pickedBudgets.size;

  const apply = useCallback(async () => {
    if (!report || pickedCount === 0) return;
    setApplying(true);
    const today = new Date();
    let budgets = 0;
    let subs = 0;
    for (const s of report.budgetSuggestions) {
      if (!pickedBudgets.has(s.categoryId)) continue;
      useBudgetStore.getState().addBudget({
        userId: user?.id || '',
        name: categoryLabel(s.categoryId, s.name),
        amount: s.monthlyAmount,
        currencyCode: base as Currency,
        period: 'monthly',
        startDate: startOfMonth(today),
        categoryAllocations: [
          {
            id: '',
            budgetId: '',
            categoryId: s.categoryId,
            amount: s.monthlyAmount,
            createdAt: today,
            updatedAt: today,
            isDeleted: false,
            syncVersion: 0,
          },
        ],
        alertThreshold: 80,
        isActive: true,
      });
      budgets++;
    }
    for (const [i, s] of report.subscriptions.entries()) {
      if (!pickedSubs.has(i)) continue;
      try {
        await useUserSubscriptionStore.getState().createSubscription({
          name: s.name,
          amount: s.amount,
          currencyCode: s.currencyCode,
          billingCycle: s.billingCycle,
          nextRenewalDate: rollForwardRenewal(s.nextRenewalDate, s.billingCycle, today),
          ...(s.categoryId ? { categoryId: s.categoryId } : {}),
          detectedFrom: s.name,
        });
        subs++;
      } catch (e) {
        console.warn('Failed to track subscription from import report', e);
      }
    }
    trackAction('import_report', 'completed');
    setApplied({ budgets, subs });
    setApplying(false);
  }, [report, pickedCount, pickedBudgets, pickedSubs, user?.id, base, categoryLabel]);

  const maxCategory = useMemo(() => Math.max(1, ...(report?.categories.map((c) => c.amount) ?? [1])), [report]);

  if (!report && !failed) {
    return (
      <SafeAreaView style={styles.centered} edges={[]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  if (failed || !report || !report.hasEnoughData) {
    return (
      <SafeAreaView style={styles.centered} edges={[]}>
        <Ionicons name="checkmark-circle-outline" size={48} color={theme.colors.success} />
        <Text style={styles.emptyTitle}>{t('importReport.importedTitle')}</Text>
        <Text style={styles.emptyText}>{t('importReport.noReport')}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={exitImportFlow}>
          <Text style={styles.primaryButtonText}>{t('common.done')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Summary */}
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>
            {report.periodStart && report.periodEnd
              ? `${formatDay(report.periodStart)} – ${formatDay(report.periodEnd)}`
              : ''}
          </Text>
          <Text style={styles.heroValue}>{money(report.monthlyAverageSpend)}</Text>
          <Text style={styles.heroSub}>{t('importReport.perMonth')}</Text>
          <Text style={styles.heroMeta}>
            {t('importReport.totals', { count: report.expenseCount, spent: money(report.totalSpent) })}
          </Text>
          {report.fxApproximate && <Text style={styles.note}>{t('importReport.fxApproximate')}</Text>}
        </View>

        {/* Where the money went */}
        {report.categories.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('importReport.whereItWent')}</Text>
            {report.categories.map((c, i) => (
              <View key={`${c.categoryId ?? 'none'}-${i}`} style={styles.catRow}>
                <View style={styles.catHead}>
                  <Text style={styles.catName} numberOfLines={1}>{categoryLabel(c.categoryId, c.name)}</Text>
                  <Text style={styles.catValue}>{`${money(c.amount)} · ${c.percentage}%`}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${(c.amount / maxCategory) * 100}%`, backgroundColor: c.color ?? theme.colors.primary },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Subscriptions found */}
        {report.subscriptions.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('importReport.subscriptionsFound')}</Text>
            <Text style={styles.cardHint}>{t('importReport.subscriptionsHint')}</Text>
            {report.subscriptions.map((s, i) => (
              <PickRow
                key={`${s.name}-${i}`}
                picked={pickedSubs.has(i)}
                disabled={!!applied}
                onToggle={() => setPickedSubs((p) => toggle(p, i))}
                title={s.name}
                subtitle={t(s.billingCycle === 'weekly' ? 'importReport.perWeekCharge' : 'importReport.perMonthCharge', {
                  value: money(s.amount, s.currencyCode),
                  count: s.charges,
                })}
                styles={styles}
                theme={theme}
              />
            ))}
          </View>
        )}

        {/* Suggested budgets */}
        {report.budgetSuggestions.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('importReport.suggestedBudgets')}</Text>
            <Text style={styles.cardHint}>{t('importReport.suggestedBudgetsHint')}</Text>
            {report.budgetSuggestions.map((b) => (
              <PickRow
                key={b.categoryId}
                picked={pickedBudgets.has(b.categoryId)}
                disabled={!!applied}
                onToggle={() => setPickedBudgets((p) => toggle(p, b.categoryId))}
                title={categoryLabel(b.categoryId, b.name)}
                subtitle={t('importReport.budgetPerMonth', { value: money(b.monthlyAmount) })}
                styles={styles}
                theme={theme}
              />
            ))}
          </View>
        )}

        {/* Possible duplicates — flagged only */}
        {report.duplicates.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('importReport.duplicates')}</Text>
            <Text style={styles.cardHint}>{t('importReport.duplicatesHint')}</Text>
            {report.duplicates.map((d) => (
              <View key={d.expenseIds.join('-')} style={styles.listRow}>
                <Ionicons name="copy-outline" size={18} color={theme.colors.warning} />
                <Text style={styles.listName} numberOfLines={1}>{d.payee}</Text>
                <Text style={styles.listValue}>{`${money(d.amount, d.currencyCode)} · ${formatDay(d.date)}`}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Biggest merchants */}
        {report.topMerchants.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('importReport.topMerchants')}</Text>
            {report.topMerchants.map((m, i) => (
              <View key={`${m.name}-${i}`} style={styles.listRow}>
                <Text style={styles.rank}>{i + 1}</Text>
                <Text style={styles.listName} numberOfLines={1}>{m.name}</Text>
                <Text style={styles.listValue}>
                  {`${money(m.amount)} · ${m.visits}×`}
                </Text>
              </View>
            ))}
          </View>
        )}

        {applied && (
          <View style={styles.appliedBox}>
            <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
            <Text style={styles.appliedText}>
              {t('importReport.applied', { budgets: applied.budgets, subscriptions: applied.subs })}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {!applied && pickedCount > 0 ? (
          <>
            <TouchableOpacity
              style={[styles.primaryButton, applying && styles.disabled]}
              onPress={apply}
              disabled={applying}
              accessibilityRole="button"
            >
              {applying ? (
                <ActivityIndicator color={theme.colors.textInverse} />
              ) : (
                <Text style={styles.primaryButtonText}>{t('importReport.apply', { count: pickedCount })}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={exitImportFlow} disabled={applying}>
              <Text style={styles.secondaryButtonText}>{t('importReport.skip')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.primaryButton} onPress={exitImportFlow} accessibilityRole="button">
            <Text style={styles.primaryButtonText}>{t('common.done')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

function PickRow({
  picked,
  disabled,
  onToggle,
  title,
  subtitle,
  styles,
  theme,
}: {
  picked: boolean;
  disabled: boolean;
  onToggle: () => void;
  title: string;
  subtitle: string;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}) {
  return (
    <TouchableOpacity
      style={styles.pickRow}
      onPress={onToggle}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: picked, disabled }}
    >
      <Ionicons
        name={picked ? 'checkbox' : 'square-outline'}
        size={22}
        color={picked ? theme.colors.primary : theme.colors.textTertiary}
      />
      <View style={styles.pickText}>
        <Text style={styles.listName} numberOfLines={1}>{title}</Text>
        <Text style={styles.cardHint}>{subtitle}</Text>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, paddingBottom: 24, gap: 12 },
  centered: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 32,
    gap: 12,
    backgroundColor: theme.colors.background,
  },
  emptyTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, textAlign: 'center' as const },
  emptyText: { ...theme.textStyles.body, color: theme.colors.textSecondary, textAlign: 'center' as const },
  hero: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 20,
    alignItems: 'center' as const,
  },
  heroLabel: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, textAlign: 'center' as const },
  heroValue: { fontSize: 32, fontFamily: theme.fonts.bold, color: theme.colors.textPrimary, marginTop: 8 },
  heroSub: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary },
  heroMeta: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, marginTop: 8, textAlign: 'center' as const },
  note: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginTop: 6, textAlign: 'center' as const },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, padding: 16, gap: 10 },
  cardTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary },
  cardHint: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary },
  catRow: { gap: 4 },
  catHead: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 8 },
  catName: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, flex: 1 },
  catValue: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: theme.colors.surfaceSecondary, overflow: 'hidden' as const },
  barFill: { height: 6, borderRadius: 3 },
  pickRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingVertical: 4 },
  pickText: { flex: 1 },
  listRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  rank: { width: 18, ...theme.textStyles.bodyMedium, color: theme.colors.textTertiary },
  listName: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, flex: 1 },
  listValue: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary },
  appliedBox: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
  },
  appliedText: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, flex: 1 },
  footer: {
    padding: 16,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    backgroundColor: theme.colors.background,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center' as const,
    alignSelf: 'stretch' as const,
  },
  primaryButtonText: { ...theme.textStyles.bodyMedium, color: theme.colors.textInverse, fontFamily: theme.fonts.bold },
  secondaryButton: { alignItems: 'center' as const, paddingVertical: 10 },
  secondaryButtonText: { ...theme.textStyles.bodyMedium, color: theme.colors.textSecondary },
  disabled: { opacity: 0.6 },
});
