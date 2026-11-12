import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { Child, ChildCostSummary } from '@budget/shared-types';
import { InteractiveBarChart } from '@/components/interactive-charts/InteractiveBarChart';
import { monthLabels } from '@/features/children/childCostsDisplay';
import { getIntlLocale } from '@/i18n';
import { useTheme, useStyles, type Theme } from '@/theme';

/**
 * Pieces both Child costs layouts (phone and desktop) draw identically. Copy
 * is neutral and factual everywhere: no ranking, no comparison with another
 * child, no month-on-month colour coding.
 */

/** The child's colour dot, name and an "Archived" chip when archived. */
export function ChildHeading({ child, large }: { child: Child; large?: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.heading}>
      <View style={[styles.dot, { backgroundColor: child.color || theme.colors.primary }]} />
      <Text style={large ? styles.nameLarge : styles.name} numberOfLines={1} accessibilityRole="header">
        {child.name || t('children.unnamed')}
      </Text>
      {!!child.archivedAt && (
        <View style={styles.chip}>
          <Text style={styles.chipText}>{t('childCosts.archived')}</Text>
        </View>
      )}
    </View>
  );
}

/** Shown only when some amounts were left out for want of an exchange rate. */
export function FxNotice() {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.notice} accessibilityRole="text">
      <Text style={styles.noticeText}>{t('childCosts.fxApproximate')}</Text>
    </View>
  );
}

/** Loading, failed or unknown child — each its own state, never a zero total. */
export function ChildCostsStatus({
  kind,
  onRetry,
}: {
  kind: 'loading' | 'error' | 'notFound';
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  if (kind === 'loading') {
    return (
      <View style={styles.status} accessibilityLabel={t('common.loading')}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }
  return (
    <View style={styles.status}>
      <Ionicons
        name={kind === 'error' ? 'alert-circle-outline' : 'person-outline'}
        size={40}
        color={theme.colors.textTertiary}
      />
      <Text style={styles.statusText}>
        {t(kind === 'error' ? 'childCosts.loadFailed' : 'childCosts.notFound')}
      </Text>
      {kind === 'error' && onRetry && (
        <TouchableOpacity style={styles.retry} onPress={onRetry} accessibilityRole="button">
          <Text style={styles.retryText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** A tile's value: the amount, or a dash when nothing is attributed yet. */
export function amountOrDash(amount: number, currency: string, empty: boolean): string {
  return empty ? '—' : formatCurrency(amount, currency);
}

/**
 * Share card and Statement PDF. The statement carries a Pro badge for a free
 * user; pressing it then opens the paywall (the caller decides). Both are
 * disabled while nothing is attributed — never a button that does nothing.
 */
export function ChildCostsActions({
  onShare,
  shareDisabled,
  onStatement,
  statementPro,
}: {
  onShare: () => void;
  shareDisabled: boolean;
  onStatement: () => void;
  /** The user is on Pro (or Business): no badge. */
  statementPro: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.actions}>
      <TouchableOpacity
        style={[styles.action, shareDisabled && styles.actionDisabled]}
        onPress={onShare}
        disabled={shareDisabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: shareDisabled }}
      >
        <Ionicons name="share-social-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.actionText}>{t('childCosts.shareCard')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.action, shareDisabled && styles.actionDisabled]}
        onPress={onStatement}
        disabled={shareDisabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: shareDisabled }}
        accessibilityLabel={
          statementPro ? t('childCosts.statementPdf') : `${t('childCosts.statementPdf')}, ${t('childCosts.statement.proBadgeA11y')}`
        }
      >
        <Ionicons name="document-text-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.actionText}>{t('childCosts.statementPdf')}</Text>
        {!statementPro && (
          <View style={styles.proBadge}>
            <Text style={styles.proBadgeText}>Pro</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

/** Last 12 months, the current one in the accent and the rest in a muted tint. */
export function MonthBars({ summary, currency, empty }: { summary: ChildCostSummary; currency: string; empty: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  if (empty) {
    return <Text style={styles.emptyNote}>{t('childCosts.noCosts')}</Text>;
  }
  const locale = getIntlLocale();
  const last = summary.months.length - 1;
  const data = summary.months.map((m, i) => ({
    id: m.month,
    label: monthLabels(m.month, locale).short,
    value: m.amount,
    color: i === last ? theme.colors.primary : theme.colors.primaryLight,
  }));
  // Gifted-charts bars take no accessible name of their own: the chart carries
  // every month's figure in one label instead.
  const a11y = t('childCosts.chartA11y', {
    list: summary.months
      .map((m) =>
        t('childCosts.monthBarA11y', {
          month: monthLabels(m.month, locale).long,
          amount: formatCurrency(m.amount, currency),
        }),
      )
      .join('; '),
  });
  return (
    <View accessible accessibilityLabel={a11y}>
      <InteractiveBarChart
        data={data}
        height={180}
        formatValue={(v) => formatCurrency(v, currency)}
        animate={false}
      />
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  heading: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    flexShrink: 1,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  name: { ...theme.textStyles.h3, color: theme.colors.textPrimary, flexShrink: 1 },
  nameLarge: { ...theme.textStyles.h2, color: theme.colors.textPrimary, flexShrink: 1 },
  chip: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[0.5],
  },
  chipText: { ...theme.textStyles.caption, color: theme.colors.textSecondary },
  notice: {
    backgroundColor: theme.colors.warningLight,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.warning,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  noticeText: { ...theme.textStyles.bodySm, color: theme.colors.textPrimary },
  status: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[10],
    gap: theme.spacing[3],
  },
  statusText: { ...theme.textStyles.body, color: theme.colors.textSecondary, textAlign: 'center' as const },
  retry: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[5],
    paddingVertical: theme.spacing[2.5],
  },
  retryText: { ...theme.textStyles.bodyMedium, color: theme.colors.textInverse },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing[2] },
  action: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  actionDisabled: { opacity: 0.6 },
  actionText: { ...theme.textStyles.bodySmMedium, color: theme.colors.primary },
  proBadge: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing[1.5],
  },
  proBadgeText: { ...theme.textStyles.caption, color: theme.colors.textSecondary },
  emptyNote: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[6],
  },
});
