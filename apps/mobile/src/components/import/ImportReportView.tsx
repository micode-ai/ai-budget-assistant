import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ImportReportResponse } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useImportReport } from '@/hooks/useImportReport';
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
  const styles = useStyles(createImportReportStyles);
  const {
    status,
    report,
    pickedSubs,
    pickedBudgets,
    toggleSub,
    toggleBudget,
    pickedCount,
    apply,
    applying,
    applied,
    money,
    categoryLabel,
    formatDay,
    maxCategory,
  } = useImportReport(batchId);

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.centered} edges={[]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  // The phone shows the same screen for a failed load and for "not enough data"; the desktop page
  // tells them apart (see `ImportReportDesktop`).
  if (status !== 'ready' || !report) {
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
            <ImportReportCategoryRows
              categories={report.categories}
              maxCategory={maxCategory}
              money={money}
              categoryLabel={categoryLabel}
              styles={styles}
              theme={theme}
            />
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
                onToggle={() => toggleSub(i)}
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
                onToggle={() => toggleBudget(b.categoryId)}
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

type ReportStyles = ReturnType<typeof createImportReportStyles>;

/**
 * "Where it went": one row per category with a share bar. Shared by the phone view and the desktop
 * page so the rows are defined once. `desktop` (default false) only makes the bar track a little
 * taller; everything else is identical.
 */
export function ImportReportCategoryRows({
  categories,
  maxCategory,
  money,
  categoryLabel,
  styles,
  theme,
  desktop = false,
}: {
  categories: ImportReportResponse['categories'];
  maxCategory: number;
  money: (n: number, cur?: string) => string;
  categoryLabel: (id: string | null, fallback: string) => string;
  styles: ReportStyles;
  theme: Theme;
  desktop?: boolean;
}) {
  return (
    <>
      {categories.map((c, i) => (
        <View key={`${c.categoryId ?? 'none'}-${i}`} style={styles.catRow}>
          <View style={styles.catHead}>
            <Text style={styles.catName} numberOfLines={1}>{categoryLabel(c.categoryId, c.name)}</Text>
            <Text style={styles.catValue}>{`${money(c.amount)} · ${c.percentage}%`}</Text>
          </View>
          <View style={[styles.barTrack, desktop && styles.barTrackDesktop]}>
            <View
              style={[
                styles.barFill,
                desktop && styles.barTrackDesktop,
                { width: `${(c.amount / maxCategory) * 100}%`, backgroundColor: c.color ?? theme.colors.primary },
              ]}
            />
          </View>
        </View>
      ))}
    </>
  );
}

/**
 * One checkbox row (a suggested subscription or budget). `desktop` (default false, so the phone
 * keeps its `TouchableOpacity` row) draws a hover wash and a keyboard-focus ring.
 */
export function PickRow({
  picked,
  disabled,
  onToggle,
  title,
  subtitle,
  styles,
  theme,
  desktop = false,
}: {
  picked: boolean;
  disabled: boolean;
  onToggle: () => void;
  title: string;
  subtitle: string;
  styles: ReportStyles;
  theme: Theme;
  desktop?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const content = (
    <>
      <Ionicons
        name={picked ? 'checkbox' : 'square-outline'}
        size={22}
        color={picked ? theme.colors.primary : theme.colors.textTertiary}
      />
      <View style={styles.pickText}>
        <Text style={styles.listName} numberOfLines={1}>{title}</Text>
        <Text style={styles.cardHint}>{subtitle}</Text>
      </View>
    </>
  );

  if (desktop) {
    return (
      <Pressable
        style={[
          styles.pickRow,
          styles.pickRowDesktop,
          hovered && !disabled && { backgroundColor: theme.colors.surfaceSecondary },
          focused && { borderColor: theme.colors.primary },
        ]}
        onPress={onToggle}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: picked, disabled }}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <TouchableOpacity
      style={styles.pickRow}
      onPress={onToggle}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: picked, disabled }}
    >
      {content}
    </TouchableOpacity>
  );
}

export const createImportReportStyles = (theme: Theme) => ({  container: { flex: 1, backgroundColor: theme.colors.background },
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
  // Desktop only (`desktop` on the shared rows): a slightly taller track.
  barTrackDesktop: { height: 8, borderRadius: 4 },
  pickRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingVertical: 4 },
  // Desktop only: room for the hover wash and the focus ring, which the phone row has no use for.
  pickRowDesktop: { paddingHorizontal: 8, borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: 'transparent' },
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
