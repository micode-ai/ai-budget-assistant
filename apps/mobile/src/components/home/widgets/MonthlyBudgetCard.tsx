import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency, formatFinancialMonth } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';
import { useFinancialMonth } from '@/hooks/useFinancialMonth';
import { SegmentedProgressBar } from '@/components/shared/SegmentedProgressBar';
import type { MonthlyBudgetSegments } from '@/features/dashboard/monthlyBudgetSegments';
import type { MonthlyBudgetProjection } from '@/features/dashboard/monthlyBudgetProjection';
import { PendingValue } from '../PendingValue';
import type { HomeWidgetContext } from '../HomeWidgetContext';

interface MonthlyBudgetCardProps {
  ctx: HomeWidgetContext;
  /**
   * Desktop web (`docs/design/2026-09-05-dashboard-web.md`'s "The monthly
   * budget card's segmented bar") — when the month reduces to exactly one
   * active, category-allocated monthly budget, this carries that budget's
   * own per-category breakdown (`resolveMonthlyBudgetSegments`), and the
   * plain fill below is replaced with a real segmented bar + legend, reusing
   * `SegmentedProgressBar` — the same component `BudgetCard` already draws
   * its own segmented bar with. Undefined/null on mobile — mobile's own call
   * site passes nothing, so it always renders today's plain fill, unchanged.
   */
  segments?: MonthlyBudgetSegments | null;
  /**
   * Desktop web (`docs/design/2026-09-05-dashboard-web.md`'s "The budget
   * projection line") — a SECOND line under the bar, from data already
   * computed: "340 zl of 500 zl · 68%" is a report, "at this rate you reach
   * 500 zl on the 24th" is a reason to behave differently today.
   *
   * Resolved by the CALLER (`FocusColumn`, via
   * `features/dashboard/budgetProjection.ts`) rather than derived here, for
   * the same reason the attention row carries its projection pre-resolved:
   * one resolver is what keeps "one sentence" true across the two places on
   * this screen that can say it. A `null`/absent value renders nothing, which
   * is also what the module returns when the budget is not heading over.
   *
   * Undefined on mobile — mobile's own call sites
   * (`HomeWidgetSwitch.tsx`'s `'monthlyBudget'` case) pass nothing, so the
   * card renders exactly as it does today and the extra `<Text>` is never
   * mounted.
   */
  projection?: MonthlyBudgetProjection | null;
}

export function MonthlyBudgetCard({ ctx, segments, projection }: MonthlyBudgetCardProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { remaining, currency, totalBudget, budgetUsedPercent, readiness } = ctx;
  /**
   * `remaining` and the percentage are both derived from SPENDING, so they are
   * unknown until the transaction pull answers — with no expenses loaded they
   * read as a full, untouched budget ("8000 of 8000", 0%), which is the most
   * flattering possible lie. `totalBudget` comes from the budget list and is
   * fine once that has landed, so it keeps rendering.
   *
   * Absent readiness means ready: the phone passes none and its SQLite mirror
   * is authoritative offline (`HomeWidgetContext.readiness`).
   */
  const spentKnown = readiness?.transactions !== false;

  // This card's figures already follow the account's financial month, but
  // nothing said so — on an anchored account "monthly budget" silently meant
  // something other than the calendar month. Label it, and only when the
  // account actually departs from the calendar, so the common case gains no
  // extra chrome.
  const { anchorDay, current } = useFinancialMonth();
  const periodRange =
    anchorDay === null
      ? null
      : formatFinancialMonth(current.start, current.end, getIntlLocale()).range;

  // When `segments` is present, the bar's own percentage drives both the
  // fill/legend colour and (via `SegmentedProgressBar`) the category slices.
  // `ctx.budgetUsedPercent` happens to equal `segments.percentageUsed` in the
  // single-contributing-budget case the util covers, but only by
  // coincidence (see `resolveMonthlyBudgetSegments`'s own doc comment) — so
  // the segmented branch reads its own number instead of assuming the two
  // always agree. Mobile never passes `segments`, so this is unchanged there.
  const barPercent = segments ? segments.percentageUsed : budgetUsedPercent;
  const progressColor = barPercent > 90
    ? theme.colors.danger
    : barPercent > 70
      ? theme.colors.warning
      : theme.colors.primary;

  return (
    <TouchableOpacity key="monthlyBudget" style={styles.card} activeOpacity={0.7} onPress={() => router.push('/(tabs)/budgets')}>
      <View style={styles.chevronHint}>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
      </View>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardTitle}>{t('dashboard.monthlyBudget')}</Text>
          {periodRange && <Text style={styles.cardSubtitle}>{periodRange}</Text>}
        </View>
      </View>
      <View style={styles.budgetOverview}>
        <View style={styles.budgetAmount}>
          {spentKnown ? (
            <Text style={[styles.remainingAmount, remaining < 0 && { color: theme.colors.danger }]}>
              {formatCurrency(remaining, currency)}
            </Text>
          ) : (
            <PendingValue style={styles.remainingAmount} />
          )}
          <Text style={styles.budgetTotal}>{t('common.of')} {formatCurrency(totalBudget, currency)}</Text>
        </View>
        {segments && spentKnown ? (
          <View style={styles.progressContainer}>
            <SegmentedProgressBar
              categories={segments.categories}
              totalAmount={segments.totalAmount}
              percentageUsed={segments.percentageUsed}
              barColor={progressColor}
              currencyCode={segments.currencyCode}
            />
          </View>
        ) : (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: spentKnown ? `${Math.min(budgetUsedPercent, 100)}%` : 0, backgroundColor: progressColor },
                ]}
              />
            </View>
            {spentKnown ? (
              <Text style={styles.progressText}>{t('dashboard.used', { percent: budgetUsedPercent.toFixed(0) })}</Text>
            ) : (
              <PendingValue style={styles.progressText} />
            )}
          </View>
        )}
        {projection && (
          <Text
            style={
              projection.projection.status === 'exceeded'
                ? styles.projectionExceeded
                : styles.projectionText
            }
          >
            {/* One sentence, one key, chosen by `resolveBudgetProjection` —
                never a date line AND a total line, which is what mobile's
                budgets list prints and what this whole module exists to
                collapse. The amount is in the BUDGET's currency, carried
                alongside the projection, not `ctx.currency`. */}
            {t(projection.projection.i18nKey, {
              amount: formatCurrency(projection.projection.amount, projection.currencyCode),
              date: projection.projection.date
                ? projection.projection.date.toLocaleDateString(getIntlLocale(), {
                    month: 'short',
                    day: 'numeric',
                  })
                : '',
            })}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
  },
  chevronHint: {
    position: 'absolute' as const,
    top: theme.spacing[3],
    right: theme.spacing[3],
    zIndex: 1,
  },
  cardHeader: {
    alignSelf: 'center' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[5],
    marginBottom: theme.spacing[4],
  },
  cardTitle: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  cardSubtitle: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  remainingAmount: {
    fontSize: 28,
    fontFamily: theme.fonts.bold,
    color: theme.colors.textPrimary,
    fontWeight: '900' as const,
  },
  budgetOverview: {
    gap: theme.spacing[4],
  },
  budgetAmount: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: theme.spacing[2],
    justifyContent: 'center' as const,
  },
  budgetTotal: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textTertiary,
  },
  progressContainer: {
    gap: theme.spacing[2],
  },
  progressBar: {
    height: 8,
    backgroundColor: theme.colors.progressTrack,
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%' as const,
    borderRadius: theme.borderRadius.sm,
  },
  progressText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  // Same two treatments `BudgetCard.tsx` (the budgets grid) gives the same two
  // states, so one budget never looks more or less urgent depending on which
  // screen is showing it. `warning`/`danger` are semantic tokens and are
  // deliberately NOT accent-derived.
  projectionText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.warning,
    textAlign: 'center' as const,
  },
  projectionExceeded: {
    ...theme.textStyles.bodySm,
    color: theme.colors.danger,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
  },
});
