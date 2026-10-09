import { View, Text, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useImportReport } from '@/hooks/useImportReport';
import { exitImportFlow } from '@/features/import/importExit';
import { FACET_RAIL_MIN_WIDTH } from '@/components/webLayout.constants';
import { SummaryTile } from '@/components/analytics/desktop/SummaryTile';
import { ImportReportCategoryRows, PickRow, createImportReportStyles } from '../ImportReportView';

/** The report is a centred page, not a fill-the-area table: a two-column report across 1900px is a void. */
const FRAME_MAX_WIDTH = 1200;
const SIDE_WIDTH = 380;

/**
 * The desktop post-import report (ABA-646): the phone's cards laid out in two columns on a centred
 * page, with a sticky action bar so "Set up selected" stays reachable on one page scroll. All state
 * and actions come from `useImportReport`, the same hook the phone view reads.
 *
 * Unlike the phone, it tells a failed load from "not enough data": the import succeeded in both, but
 * only a failure can be retried. Below 1440 the side column drops under the main one.
 *
 * Departures from the design language (see the ABA-646 spec): the page is capped and centred, and
 * the action bar is a `position: sticky` bottom edge. No keyboard shortcuts: it is a short one-time
 * form whose Tab order is the checkboxes, then the bar.
 */
export function ImportReportDesktop({ batchId }: { batchId: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const shared = useStyles(createImportReportStyles);
  const styles = useStyles(createStyles);
  const { width } = useWindowDimensions();
  const sideBeside = width >= FACET_RAIL_MIN_WIDTH;

  const {
    status,
    report,
    retry,
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
      <View style={styles.root}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </View>
    );
  }

  if (status === 'failed') {
    return (
      <View style={styles.root}>
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={48} color={theme.colors.textTertiary} />
          <Text style={styles.stateTitle}>{t('importReport.importedTitle')}</Text>
          <Text style={styles.stateText}>{t('importReport.loadFailed')}</Text>
          <View style={styles.stateActions}>
            <Pressable onPress={retry} accessibilityRole="button" style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{t('common.retry')}</Text>
            </Pressable>
            <Pressable onPress={exitImportFlow} accessibilityRole="button" style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{t('common.done')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (status === 'insufficient' || !report) {
    return (
      <View style={styles.root}>
        <View style={styles.centered}>
          <Ionicons name="checkmark-circle-outline" size={48} color={theme.colors.success} />
          <Text style={styles.stateTitle}>{t('importReport.importedTitle')}</Text>
          <Text style={styles.stateText}>{t('importReport.noReport')}</Text>
          <View style={styles.stateActions}>
            <Pressable onPress={exitImportFlow} accessibilityRole="button" style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{t('common.done')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const hasSide =
    report.subscriptions.length > 0 || report.budgetSuggestions.length > 0 || report.duplicates.length > 0;
  const period =
    report.periodStart && report.periodEnd ? `${formatDay(report.periodStart)} – ${formatDay(report.periodEnd)}` : '—';

  return (
    <View style={styles.root}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.frame}>
          <Text style={styles.title}>{t('importReport.title')}</Text>

          <View style={styles.strip}>
            <SummaryTile label={t('expensesDesktop.facetPeriod')}>
              <Text style={styles.tileValue}>{period}</Text>
            </SummaryTile>
            <SummaryTile label={t('importReport.perMonth')}>
              <Text style={styles.tileValue}>{money(report.monthlyAverageSpend)}</Text>
            </SummaryTile>
            <SummaryTile label={t('analytics.totalSpent')}>
              <Text style={styles.tileValue}>{money(report.totalSpent)}</Text>
              <Text style={styles.tileSub}>{`${t('expensesDesktop.summaryCount')}: ${report.expenseCount}`}</Text>
            </SummaryTile>
          </View>
          {report.fxApproximate && <Text style={styles.footnote}>{t('importReport.fxApproximate')}</Text>}

          <View style={[styles.columns, !sideBeside && styles.columnsStacked]}>
            <View style={styles.main}>
              {report.categories.length > 0 && (
                <View style={shared.card}>
                  <Text style={shared.cardTitle}>{t('importReport.whereItWent')}</Text>
                  <ImportReportCategoryRows
                    categories={report.categories}
                    maxCategory={maxCategory}
                    money={money}
                    categoryLabel={categoryLabel}
                    styles={shared}
                    theme={theme}
                    desktop
                  />
                </View>
              )}

              {report.topMerchants.length > 0 && (
                <View style={shared.card}>
                  <Text style={shared.cardTitle}>{t('importReport.topMerchants')}</Text>
                  {report.topMerchants.map((m, i) => (
                    <View key={`${m.name}-${i}`} style={shared.listRow}>
                      <Text style={shared.rank}>{i + 1}</Text>
                      <Text style={shared.listName} numberOfLines={1}>
                        {m.name}
                      </Text>
                      <Text style={shared.listValue}>{`${money(m.amount)} · ${m.visits}×`}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {hasSide && (
              <View style={[styles.side, !sideBeside && styles.sideStacked]}>
                {report.subscriptions.length > 0 && (
                  <View style={shared.card}>
                    <Text style={shared.cardTitle}>{t('importReport.subscriptionsFound')}</Text>
                    <Text style={shared.cardHint}>{t('importReport.subscriptionsHint')}</Text>
                    {report.subscriptions.map((s, i) => (
                      <PickRow
                        key={`${s.name}-${i}`}
                        picked={pickedSubs.has(i)}
                        disabled={!!applied}
                        onToggle={() => toggleSub(i)}
                        title={s.name}
                        subtitle={t(
                          s.billingCycle === 'weekly' ? 'importReport.perWeekCharge' : 'importReport.perMonthCharge',
                          { value: money(s.amount, s.currencyCode), count: s.charges },
                        )}
                        styles={shared}
                        theme={theme}
                        desktop
                      />
                    ))}
                  </View>
                )}

                {report.budgetSuggestions.length > 0 && (
                  <View style={shared.card}>
                    <Text style={shared.cardTitle}>{t('importReport.suggestedBudgets')}</Text>
                    <Text style={shared.cardHint}>{t('importReport.suggestedBudgetsHint')}</Text>
                    {report.budgetSuggestions.map((b) => (
                      <PickRow
                        key={b.categoryId}
                        picked={pickedBudgets.has(b.categoryId)}
                        disabled={!!applied}
                        onToggle={() => toggleBudget(b.categoryId)}
                        title={categoryLabel(b.categoryId, b.name)}
                        subtitle={t('importReport.budgetPerMonth', { value: money(b.monthlyAmount) })}
                        styles={shared}
                        theme={theme}
                        desktop
                      />
                    ))}
                  </View>
                )}

                {/* Possible duplicates: flagged only, never removed. */}
                {report.duplicates.length > 0 && (
                  <View style={shared.card}>
                    <Text style={shared.cardTitle}>{t('importReport.duplicates')}</Text>
                    <Text style={shared.cardHint}>{t('importReport.duplicatesHint')}</Text>
                    {report.duplicates.map((d) => (
                      <View key={d.expenseIds.join('-')} style={shared.listRow}>
                        <Ionicons name="copy-outline" size={18} color={theme.colors.warning} />
                        <Text style={shared.listName} numberOfLines={1}>
                          {d.payee}
                        </Text>
                        <Text style={shared.listValue}>{`${money(d.amount, d.currencyCode)} · ${formatDay(d.date)}`}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Sticky to the bottom edge of the ONE page scroll, so the action never scrolls away. The
            same mechanism as the sticky table headers, on the other edge. */}
        <View style={styles.bar}>
          <View style={styles.barInner}>
            {applied && (
              <View style={styles.appliedRow}>
                <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
                <Text style={styles.appliedText}>
                  {t('importReport.applied', { budgets: applied.budgets, subscriptions: applied.subs })}
                </Text>
              </View>
            )}
            {!applied && pickedCount > 0 ? (
              <View style={styles.barActions}>
                <Pressable
                  onPress={apply}
                  disabled={applying}
                  accessibilityRole="button"
                  style={[styles.primaryButton, applying && styles.disabled]}
                >
                  {applying ? (
                    <ActivityIndicator color={theme.colors.textInverse} />
                  ) : (
                    <Text style={styles.primaryButtonText}>{t('importReport.apply', { count: pickedCount })}</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={exitImportFlow}
                  disabled={applying}
                  accessibilityRole="button"
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>{t('importReport.skip')}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.barActions}>
                <Pressable onPress={exitImportFlow} accessibilityRole="button" style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>{t('common.done')}</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  // Paints its own ground: a bare `flex: 1` is transparent and React Navigation's default
  // light grey would show through under dark-theme text.
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: theme.spacing[8],
    gap: theme.spacing[3],
  },
  stateTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
  },
  stateText: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    maxWidth: 480,
  },
  stateActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[2],
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  frame: {
    flexGrow: 1,
    width: '100%' as const,
    maxWidth: FRAME_MAX_WIDTH,
    alignSelf: 'center' as const,
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[6],
    gap: theme.spacing[3],
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  strip: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[3],
  },
  tileValue: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  tileSub: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  footnote: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  columns: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: theme.spacing[4],
  },
  columnsStacked: {
    flexDirection: 'column' as const,
    alignItems: 'stretch' as const,
  },
  main: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[3],
  },
  side: {
    width: SIDE_WIDTH,
    gap: theme.spacing[3],
  },
  sideStacked: {
    width: 'auto' as const,
  },
  bar: {
    // Sticky to the bottom edge of the page scroll. Opaque and above the content. Web-only.
    position: 'sticky' as unknown as 'absolute',
    bottom: 0,
    zIndex: 2,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  barInner: {
    width: '100%' as const,
    maxWidth: FRAME_MAX_WIDTH,
    alignSelf: 'center' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  barActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    marginLeft: 'auto' as const,
  },
  appliedRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    flexShrink: 1,
  },
  appliedText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  primaryButton: {
    minWidth: 160,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[2.5],
    paddingHorizontal: theme.spacing[5],
  },
  primaryButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
  },
  secondaryButton: {
    paddingVertical: theme.spacing[2.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
  },
  secondaryButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
  },
  disabled: {
    opacity: 0.6,
  },
});
