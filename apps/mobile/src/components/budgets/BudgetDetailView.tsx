import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useBudgetStore } from '@/stores/budgetStore';
import { useAccountStore } from '@/stores/accountStore';
import { formatCurrency, getStartOfWeek, financialMonth, formatFinancialMonth } from '@budget/shared-utils';
import { getIntlLocale } from '@/i18n';
import { useTheme, useStyles, type Theme } from '@/theme';
import { BudgetHistorySection } from '@/components/budget/BudgetHistorySection';
import { useFinancialMonth } from '@/hooks/useFinancialMonth';
import { isCurrentBudgetPeriod, stepBudgetPeriod } from '@/features/budgets/periodNav';
import type { Budget } from '@budget/shared-types';

export interface BudgetDetailViewProps {
  /** Resolved and guaranteed non-null by the route before this renders. */
  budget: Budget;
  /**
   * Owned by the route (`app/budget/[id].tsx`), not here: `BudgetEditForm`
   * replaces this whole view while editing, which unmounts and remounts it
   * on every `isEditing` toggle. If the period-navigation date lived in
   * this component's own state instead, cancelling out of an edit would
   * silently reset it back to "now" rather than wherever the user had
   * navigated — a real behaviour change, not a pure move. Passed down as a
   * controlled value instead, the same reason `ProductDetailSheet` keeps
   * `renameValue`/`isRenaming` in ITS parent rather than owning them itself.
   */
  referenceDate: Date;
  onReferenceDateChange: (date: Date) => void;
  /** The route's `setIsEditing(true)` today; swaps in `BudgetEditForm`. */
  onEdit: () => void;
  /** Called after a confirmed delete actually removes the budget — the
   *  route's `router.back()` today, a dialog's close tomorrow. */
  onDeleted: () => void;
  /**
   * Defaults to `false` so the mobile route (which passes nothing) keeps its
   * layout by construction (design language §5a) — reflows the category
   * breakdown card into two columns above 4 categories, mirroring the
   * reference/Analytics screens' own `TopReceiptItems`/`TopItemsCard`
   * precedent (one column of 10 -> two of 5). Does NOT touch the
   * `canEdit`-gated Edit/Delete row below it — `BudgetDialog` hosts that
   * row as-is rather than re-homing it into its own chrome (see that
   * component's file header for why).
   */
  desktop?: boolean;
}

/**
 * The view-mode body of `app/budget/[id].tsx` — header card, period
 * navigation, progress, optional category breakdown, details card, and
 * history — moved here unchanged so `BudgetDialog` (desktop) and the route
 * (mobile) share one definition. `budget` is guaranteed non-null and
 * `isEditing` is guaranteed false by the time this renders; both guards
 * stay in the route, which still switches between this component and
 * `BudgetEditForm` exactly as it did before this move, just across two
 * named components now instead of one inline branch.
 *
 * Edit and Delete stay inside this view for now, `canEdit`-gated exactly as
 * the route left them (commit 8e06e392, fixing a viewer being shown two
 * controls the API would 403). This task only moves JSX — it does not
 * relocate that gate into a future dialog header, which is Task 5's job per
 * the design doc's "Why Delete moves into the dialog header".
 *
 * Delete's confirmation already used `showAlert`, not `Alert.alert` — no
 * fix needed here, unlike a couple of other screens on this branch.
 */
export function BudgetDetailView({
  budget,
  referenceDate,
  onReferenceDateChange,
  onEdit,
  onDeleted,
  desktop = false,
}: BudgetDetailViewProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { deleteBudget, getBudgetProgress } = useBudgetStore();
  const canEdit = useAccountStore((s) => s.canEdit());
  const { anchorDay } = useFinancialMonth();
  const progress = getBudgetProgress(budget.id, referenceDate);

  // --- Period navigation helpers ---
  const isCurrentPeriod = isCurrentBudgetPeriod(budget.period, referenceDate, anchorDay);

  const stepPeriod = (delta: 1 | -1) => {
    onReferenceDateChange(stepBudgetPeriod(budget.period, referenceDate, delta, anchorDay));
  };

  const canGoBack = (() => {
    if (budget.period === 'custom') return false;
    const candidate = stepBudgetPeriod(budget.period, referenceDate, -1, anchorDay);
    const budgetStart = new Date(budget.startDate);
    return (
      candidate >= budgetStart ||
      isCurrentBudgetPeriod(budget.period, candidate, anchorDay, budgetStart)
    );
  })();

  const formatPeriodLabel = (): string => {
    const locale = getIntlLocale();
    switch (budget.period) {
      case 'daily':
        return referenceDate.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
      case 'weekly': {
        const start = getStartOfWeek(referenceDate);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        const from = start.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
        const to = end.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
        return `${from} – ${to}`;
      }
      case 'yearly':
        return String(referenceDate.getFullYear());
      default:
        return '';
    }
  };

  // Monthly budgets get a two-line heading (label + exact anchored span) via
  // formatFinancialMonth so an anchored period (e.g. 10 Aug - 9 Sep) reads
  // correctly instead of just showing the calendar month name. Every other
  // period keeps its existing single-line formatPeriodLabel() text.
  const monthlyHeading = (() => {
    if (budget.period !== 'monthly') return null;
    const { start, end } = financialMonth(referenceDate, anchorDay);
    return formatFinancialMonth(start, end, i18n.language);
  })();

  const handleDelete = () => {
    showAlert(t('budgetDetail.deleteTitle'), t('budgetDetail.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteBudget(budget.id);
          onDeleted();
        },
      },
    ]);
  };

  const percentUsed = progress?.percentageUsed || 0;
  const isOverBudget = progress?.isOverBudget || false;
  const progressColor = isOverBudget
    ? theme.colors.danger
    : percentUsed > 80
      ? theme.colors.warning
      : theme.colors.primary;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header Card */}
        <View style={styles.headerCard}>
          <Text style={styles.budgetName}>{budget.name}</Text>
          <View style={[styles.statusBadge, isOverBudget && styles.statusBadgeOver]}>
            <Text style={[styles.statusText, isOverBudget && styles.statusTextOver]}>
              {isOverBudget ? t('budgetDetail.overBudget') : t('budgetDetail.onTrack')}
            </Text>
          </View>
        </View>

        {budget.period !== 'custom' && (
          <View style={styles.periodNavRow}>
            <TouchableOpacity onPress={() => stepPeriod(-1)} disabled={!canGoBack} hitSlop={8}>
              <Ionicons
                name="chevron-back"
                size={22}
                color={canGoBack ? theme.colors.primary : theme.colors.textDisabled}
              />
            </TouchableOpacity>
            {monthlyHeading ? (
              <View style={styles.periodNavLabelContainer}>
                <Text style={styles.periodNavLabel}>{monthlyHeading.label}</Text>
                <Text style={styles.periodNavSubtitle}>{monthlyHeading.range}</Text>
              </View>
            ) : (
              <Text style={styles.periodNavLabel}>{formatPeriodLabel()}</Text>
            )}
            <TouchableOpacity onPress={() => stepPeriod(1)} disabled={isCurrentPeriod} hitSlop={8}>
              <Ionicons
                name="chevron-forward"
                size={22}
                color={isCurrentPeriod ? theme.colors.textDisabled : theme.colors.primary}
              />
            </TouchableOpacity>
          </View>
        )}

        {/* Progress Card */}
        <View style={styles.progressCard}>
          <View style={styles.progressAmountRow}>
            <Text style={styles.spentAmount}>
              {formatCurrency(progress?.spent || 0, budget.currencyCode)}
            </Text>
            <Text style={styles.totalAmount}>
              {t('common.of')} {formatCurrency(budget.amount, budget.currencyCode)}
            </Text>
          </View>

          <View style={styles.progressBarContainer}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(percentUsed, 100)}%`, backgroundColor: progressColor },
                ]}
              />
            </View>
            <Text style={styles.percentText}>{percentUsed.toFixed(0)}%</Text>
          </View>

          {progress && progress.remaining > 0 && (
            <Text style={styles.remainingText}>
              {formatCurrency(progress.remaining, budget.currencyCode)} {t('budgets.remaining')}
            </Text>
          )}
        </View>

        {/* Category Breakdown Card */}
        {progress?.categoryBreakdown && progress.categoryBreakdown.length > 0 && (() => {
          const breakdown = progress.categoryBreakdown!;
          const renderCategoryRow = (cat: (typeof breakdown)[number]) => {
            const catPercentUsed = cat.percentageUsed;
            const catColor = cat.isOverBudget
              ? theme.colors.danger
              : catPercentUsed > 80
                ? theme.colors.warning
                : cat.categoryColor || theme.colors.primary;
            return (
              <View key={cat.categoryId} style={styles.breakdownRow}>
                <View style={styles.breakdownHeader}>
                  <View style={[styles.catColorDot, { backgroundColor: cat.categoryColor || '#6B7280' }]} />
                  <Text style={styles.breakdownCatName} numberOfLines={1}>{cat.categoryName}</Text>
                  <Text style={styles.breakdownCatAmount}>
                    {formatCurrency(cat.spent, budget.currencyCode)} / {formatCurrency(cat.allocated, budget.currencyCode)}
                  </Text>
                </View>
                <View style={styles.breakdownProgressBar}>
                  <View
                    style={[
                      styles.breakdownProgressFill,
                      { width: `${Math.min(catPercentUsed, 100)}%`, backgroundColor: catColor },
                    ]}
                  />
                </View>
              </View>
            );
          };

          // Two columns above 4 categories, desktop only (design's "What
          // each mobile affordance becomes" — mirrors the reference/
          // Analytics screens' TopReceiptItems/TopItemsCard precedent).
          // `desktop` defaults false, so the mobile route (which passes
          // nothing) always takes the single-column branch, unchanged.
          const twoColumns = desktop && breakdown.length > 4;
          const splitAt = Math.ceil(breakdown.length / 2);

          return (
            <View style={styles.breakdownCard}>
              <Text style={styles.breakdownTitle}>{t('budgetDetail.categoryBreakdown')}</Text>
              {twoColumns ? (
                <View style={styles.breakdownColumns}>
                  <View style={styles.breakdownColumn}>
                    {breakdown.slice(0, splitAt).map(renderCategoryRow)}
                  </View>
                  <View style={styles.breakdownColumn}>
                    {breakdown.slice(splitAt).map(renderCategoryRow)}
                  </View>
                </View>
              ) : (
                breakdown.map(renderCategoryRow)
              )}
            </View>
          );
        })()}

        {/* Details Card */}
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('budgetDetail.period')}</Text>
            <Text style={styles.detailValue}>{t(`budgets.periods.${budget.period}`)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('budgetDetail.alertThreshold')}</Text>
            <Text style={styles.detailValue}>{budget.alertThreshold}%</Text>
          </View>
          {progress && (
            <>
              {isCurrentPeriod && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('budgetDetail.daysRemaining')}</Text>
                  <Text style={styles.detailValue}>{progress.daysRemaining}</Text>
                </View>
              )}
              {isCurrentPeriod && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('budgetDetail.projectedTotal')}</Text>
                  <Text
                    style={[
                      styles.detailValue,
                      progress.projectedTotal > budget.amount && { color: theme.colors.danger },
                    ]}
                  >
                    {formatCurrency(progress.projectedTotal, budget.currencyCode)}
                  </Text>
                </View>
              )}
            </>
          )}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('budgetDetail.status')}</Text>
            <Text style={[styles.detailValue, { color: budget.isActive ? theme.colors.primary : theme.colors.textTertiary }]}>
              {budget.isActive ? t('budgetDetail.active') : t('budgetDetail.inactive')}
            </Text>
          </View>
        </View>

        {/* History */}
        <BudgetHistorySection budget={budget} />

        {/* Actions */}
        {canEdit && (
          <View style={styles.actionsContainer}>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.editButton} onPress={onEdit}>
                <Ionicons name="pencil" size={22} color={theme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                <Ionicons name="trash" size={22} color={theme.colors.danger} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    padding: theme.spacing[4],
  },
  headerCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  budgetName: {
    fontSize: 22,
    fontWeight: 'bold' as const,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  statusBadge: {
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.lg,
  },
  statusBadgeOver: {
    backgroundColor: theme.colors.dangerLight,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: theme.colors.primary,
  },
  statusTextOver: {
    color: theme.colors.danger,
  },
  progressCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[6],
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  progressAmountRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  spentAmount: {
    fontSize: 28,
    fontWeight: 'bold' as const,
    color: theme.colors.textPrimary,
  },
  totalAmount: {
    fontSize: 16,
    color: theme.colors.textTertiary,
  },
  progressBarContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  progressBar: {
    flex: 1,
    height: 10,
    backgroundColor: theme.colors.progressTrack,
    borderRadius: 5,
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%' as const,
    borderRadius: 5,
  },
  percentText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textSecondary,
    width: 45,
    textAlign: 'right' as const,
  },
  remainingText: {
    fontSize: 15,
    color: theme.colors.primary,
    marginTop: theme.spacing[3],
    fontWeight: '500' as const,
  },
  breakdownCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  breakdownTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
  },
  breakdownRow: {
    marginBottom: theme.spacing[4],
  },
  breakdownColumns: {
    flexDirection: 'row' as const,
    gap: theme.spacing[5],
  },
  breakdownColumn: {
    flex: 1,
    minWidth: 0,
  },
  breakdownHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
    gap: theme.spacing[2],
  },
  catColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  breakdownCatName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500' as const,
    color: theme.colors.textPrimary,
  },
  breakdownCatAmount: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  breakdownProgressBar: {
    height: 6,
    backgroundColor: theme.colors.progressTrack,
    borderRadius: 3,
    overflow: 'hidden' as const,
  },
  breakdownProgressFill: {
    height: '100%' as const,
    borderRadius: 3,
  },
  detailsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  detailRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  detailLabel: {
    fontSize: 14,
    color: theme.colors.textTertiary,
  },
  detailValue: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
  },
  actionsContainer: {
    marginTop: theme.spacing[2],
  },
  actionRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
  },
  editButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.danger,
    gap: theme.spacing[2],
  },
  periodNavRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  periodNavLabel: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    minWidth: 160,
    textAlign: 'center' as const,
  },
  periodNavLabelContainer: {
    minWidth: 160,
    alignItems: 'center' as const,
  },
  periodNavSubtitle: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
    textAlign: 'center' as const,
  },
});
