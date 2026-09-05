import { useState } from 'react';
import type { ReactNode } from 'react';
import { View, Text, Pressable, TouchableOpacity, ScrollView, ActivityIndicator, Modal, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { AIInsightChart, Currency } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';
import { useHydrationStore } from '@/stores/hydrateTransactions';
import { useUpgradeStore } from '@/stores/upgradeStore';
import { AiUsageBadge } from '@/components/AiUsageBadge';
import { SpendingTrendChart, DayOfWeekSection, InflationIndexSection } from '@/components/analytics';
import { BreakdownCard, type BreakdownRow } from './BreakdownCard';
import { FACET_RAIL_MIN_WIDTH } from '@/components/webLayout.constants';
import { useAnalyticsScreenData } from '@/features/analytics/useAnalyticsScreenData';
import type {
  TimeRange,
  CategorySpending,
  MerchantSpending,
  TagSpending,
  ProjectSpending,
  IncomeCategorySpending,
  BudgetPredictionItem,
} from '@/features/analytics/useAnalytics';

/**
 * Desktop Analytics screen (ABA-501). Follows
 * `docs/design/2026-09-05-analytics-web.md`'s wireframe: a fixed control row
 * (period + currency + export — this screen has no facet rail, nothing here
 * is a row) above ONE page scroll holding a 4-tile summary strip, a trend+
 * weekday row, a breakdown grid, top items, a merged insights cluster, the
 * Personal Inflation Index, and a bottom discovery row.
 *
 * Reuses `useAnalyticsScreenData()` (Task 1) — every number here is computed
 * exactly where it already was; this file only decides where each number is
 * PRINTED. Three mobile blocks are dropped on desktop only, per the design's
 * "Where two blocks answer the same question" — `QuickInsights`' topCategory
 * sentence card (folded into a 4th summary-strip tile instead), its
 * highestSpendingDay sentence card (the trend chart already shows the same
 * date), and its Anomalies list (the per-category vsAverage chip in the
 * breakdown grid already shows the same signal). `AnalyticsMobile.tsx` is
 * untouched — this file duplicates LAYOUT, never behaviour.
 *
 * `InflationIndexSection` is passed `desktop` (ABA-501 Task 5): it reflows its
 * own headline / product-list / links-rail into three columns internally
 * (design's "Personal Inflation Index — reflowed, not rebuilt") and hosts its
 * per-product detail as a centred dialog instead of a bottom sheet (design's
 * Universal dialogs rule). `AnalyticsMobile.tsx`'s own call site passes no
 * prop and is unaffected.
 *
 * Deliberately NOT done here, and why:
 * - The donut↔row hover cross-highlight (Interactions, "Open questions") and
 *   the currency dropdown's arrow-key-between-options behaviour are both
 *   named as open/optional in the spec — skipped for v1, not forgotten.
 */
export function AnalyticsDesktop() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { width } = useWindowDimensions();
  const isWideGrid = width >= FACET_RAIL_MIN_WIDTH;
  const isHydrating = useHydrationStore((s) => s.isHydrating);

  const {
    selectedRange,
    setSelectedRange,
    selectedCurrency,
    setSelectedCurrency,
    selectedMonth,
    selectedYear,
    isCurrentPeriod,
    getPeriodLabel,
    goToPrevPeriod,
    goToNextPeriod,
    resetToCurrentPeriod,
    availableCurrencies,
    currency,
    dailySpending,
    categorySpending,
    merchantSpending,
    incomeByCategory,
    summary,
    itemBreakdown,
    dayOfWeekSpending,
    periodComparison,
    predictions,
    tagSpending,
    projectSpending,
    aiInsights,
    aiInsightsProGated,
    openDrillDown,
  } = useAnalyticsScreenData();

  // "Zero transactions in the selected period" (design's Empty state) means
  // BOTH streams are empty, not just expenses — an income-only period must
  // NOT collapse the grid, since `IncomeCategoryBreakdown`'s own tile still
  // has something to show; that narrower "this one breakdown has nothing"
  // case is already handled per-card by `BreakdownCard`'s own empty state
  // (see its own doc comment). `categorySpending`/`incomeByCategory` are both
  // `[]` exactly when their respective total is zero (see
  // `useCategoryAnalytics`/`useIncomeAnalytics`), so this is an exact signal,
  // not an approximation.
  const isEmptyPeriod = categorySpending.length === 0 && incomeByCategory.length === 0;

  return (
    <View style={styles.root}>
      <ControlRow
        selectedRange={selectedRange}
        onRangeChange={(range) => {
          setSelectedRange(range);
          if (range === 'week') resetToCurrentPeriod();
        }}
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        isCurrentPeriod={isCurrentPeriod}
        getPeriodLabel={getPeriodLabel}
        goToPrevPeriod={goToPrevPeriod}
        goToNextPeriod={goToNextPeriod}
        selectedCurrency={selectedCurrency}
        onCurrencyChange={setSelectedCurrency}
        availableCurrencies={availableCurrencies}
        onExport={() =>
          router.push({
            pathname: '/reports',
            params: { range: selectedRange, month: String(selectedMonth), year: String(selectedYear) },
          })
        }
      />

      {/* ONE page scroll — the control row above is the only fixed element,
          matching the reference screen's own search-box precedent (see the
          design's "Control row: what's fixed, what scrolls"). */}
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent}>
        <View style={styles.body}>
          <AnalyticsSummaryStrip
            summary={summary}
            periodComparison={periodComparison}
            selectedRange={selectedRange}
            currency={currency}
            topCategory={categorySpending[0] ?? null}
            onPress={openDrillDown}
          />

          {isHydrating ? (
            // Desktop web has no SQLite mirror (see the design's "Loading"
            // state) — the first load of a session has genuinely empty
            // stores until the API pull resolves. A neutral spinner here
            // avoids flashing "no transactions" before real numbers land.
            <View style={styles.loadingBlock}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : isEmptyPeriod ? (
            <View style={styles.emptyBlock}>
              <Ionicons name="pie-chart-outline" size={64} color={theme.colors.textDisabled} />
              <Text style={styles.emptyBlockText}>{t('analytics.noData')}</Text>
              <Text style={styles.emptyBlockSubtext}>{t('analytics.addExpensesHint')}</Text>
            </View>
          ) : (
            <>
              <TrendAndWeekdayRow
                dailySpending={dailySpending}
                selectedRange={selectedRange}
                onBarPress={openDrillDown}
                dayOfWeekSpending={dayOfWeekSpending}
              />

              <BreakdownGrid
                isWideGrid={isWideGrid}
                currency={currency}
                categorySpending={categorySpending}
                merchantSpending={merchantSpending}
                tagSpending={tagSpending}
                projectSpending={projectSpending}
                incomeByCategory={incomeByCategory}
              />

              {itemBreakdown.length > 0 && <TopItemsCard itemBreakdown={itemBreakdown} currency={currency} />}
            </>
          )}

          <InsightsCluster
            summary={summary}
            predictions={predictions}
            selectedRange={selectedRange}
            currency={currency}
            aiInsights={aiInsights}
            aiInsightsProGated={aiInsightsProGated}
            suppressDeterministicTiles={isEmptyPeriod}
          />

          {/* `desktop` triggers its own internal reflow + dialog chrome —
              see the doc comment above. */}
          <View style={styles.wideSection}>
            <InflationIndexSection desktop />
          </View>

          <DiscoveryRow selectedMonth={selectedMonth} selectedYear={selectedYear} />
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Control row ──────────────────────────────────────────────────────────

interface ControlRowProps {
  selectedRange: TimeRange;
  onRangeChange: (range: TimeRange) => void;
  selectedMonth: number;
  selectedYear: number;
  isCurrentPeriod: boolean;
  getPeriodLabel: () => string;
  goToPrevPeriod: () => void;
  goToNextPeriod: () => void;
  selectedCurrency: Currency | undefined;
  onCurrencyChange: (currency: Currency | undefined) => void;
  availableCurrencies: string[];
  onExport: () => void;
}

/**
 * Fixed row: segmented Week/Month/Year control (mirrors `ExpensesDesktop`'s
 * own List/Map view-toggle idiom, not mobile's full-width 3-button row) +
 * prev/next month arrows + a labelled currency dropdown (replacing mobile's
 * horizontal scrollable pill row — the exact "loudest phone tell" the
 * language doc calls out) + the Export button, promoted here from the bottom
 * of the mobile page.
 */
function ControlRow({
  selectedRange,
  onRangeChange,
  selectedMonth,
  selectedYear,
  isCurrentPeriod,
  getPeriodLabel,
  goToPrevPeriod,
  goToNextPeriod,
  selectedCurrency,
  onCurrencyChange,
  availableCurrencies,
  onExport,
}: ControlRowProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const RANGES: { key: TimeRange; label: string }[] = [
    { key: 'week', label: t('analytics.week') },
    { key: 'month', label: t('analytics.month') },
    { key: 'year', label: t('analytics.year') },
  ];

  return (
    <View style={styles.controlRow}>
      <View style={styles.controlRowLeft}>
        <View style={styles.rangeToggle}>
          {RANGES.map((r) => (
            <Pressable
              key={r.key}
              onPress={() => onRangeChange(r.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedRange === r.key }}
              style={[styles.rangeToggleButton, selectedRange === r.key && styles.rangeToggleButtonActive]}
            >
              <Text
                style={[styles.rangeToggleText, selectedRange === r.key && styles.rangeToggleTextActive]}
              >
                {r.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {selectedRange !== 'week' && (
          <View style={styles.periodNav}>
            <Pressable onPress={goToPrevPeriod} accessibilityRole="button" hitSlop={8}>
              <Ionicons name="chevron-back" size={20} color={theme.colors.primary} />
            </Pressable>
            <Text style={styles.periodNavLabel}>{getPeriodLabel()}</Text>
            <Pressable onPress={goToNextPeriod} accessibilityRole="button" hitSlop={8} disabled={isCurrentPeriod}>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={isCurrentPeriod ? theme.colors.textDisabled : theme.colors.primary}
              />
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.controlRowRight}>
        {availableCurrencies.length > 1 && (
          <CurrencyDropdown
            selectedCurrency={selectedCurrency}
            onCurrencyChange={onCurrencyChange}
            availableCurrencies={availableCurrencies}
          />
        )}

        <Pressable style={styles.exportButton} onPress={onExport} accessibilityRole="button">
          <Ionicons name="download-outline" size={16} color={theme.colors.primary} />
          <Text style={styles.exportButtonText}>{t('analytics.exportReport')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface CurrencyDropdownProps {
  selectedCurrency: Currency | undefined;
  onCurrencyChange: (currency: Currency | undefined) => void;
  availableCurrencies: string[];
}

/**
 * Labelled dropdown ("Currency: All ▾") replacing mobile's horizontal pill
 * row — same options (All + each currency actually held), same
 * `onCurrencyChange` contract. Built on RN's own `Modal` (Universal dialogs
 * rule — free Escape handling + focus trap) with a raw, tab-index-less
 * `<div>` scrim, same shape as `RowContextMenu.tsx`'s anchored popover.
 * Deliberately visually distinct from `WebTopBar`'s `CurrencyPill` (that one
 * sets the account's global display currency; this is a screen-local
 * filter) — a labelled button, not a bare pill.
 */
function CurrencyDropdown({ selectedCurrency, onCurrencyChange, availableCurrencies }: CurrencyDropdownProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });

  const label = selectedCurrency ?? t('analytics.allCurrencies');

  const openMenu = (event: unknown) => {
    let next = { x: 0, y: 0 };
    try {
      const e = event as { currentTarget?: { getBoundingClientRect?: () => { left: number; bottom: number } } } | null | undefined;
      const rect = e?.currentTarget?.getBoundingClientRect?.();
      if (rect) next = { x: rect.left, y: rect.bottom + 4 };
    } catch {
      // RowContextMenu's own precedent: never let anchor resolution crash a
      // click — the menu clamps to the viewport regardless.
    }
    setAnchor(next);
    setOpen(true);
  };

  const choose = (value: Currency | undefined) => {
    onCurrencyChange(value);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={(e) => openMenu(e)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.currencyTrigger}
      >
        <Text style={styles.currencyTriggerText}>
          {t('wallet.currency')}: {label}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={theme.colors.textSecondary} />
      </Pressable>

      {open && (
        <Modal visible transparent animationType="none" onRequestClose={() => setOpen(false)}>
          <div
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
            style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <View style={[styles.currencyMenu, { position: 'absolute', top: anchor.y, left: anchor.x }]}>
              <Pressable style={styles.currencyMenuItem} onPress={() => choose(undefined)} accessibilityRole="menuitem">
                <Text
                  style={[styles.currencyMenuItemText, !selectedCurrency && { color: theme.colors.primary }]}
                >
                  {t('analytics.allCurrencies')}
                </Text>
              </Pressable>
              {availableCurrencies.map((c) => (
                <Pressable
                  key={c}
                  style={styles.currencyMenuItem}
                  onPress={() => choose(c as Currency)}
                  accessibilityRole="menuitem"
                >
                  <Text
                    style={[styles.currencyMenuItemText, selectedCurrency === c && { color: theme.colors.primary }]}
                  >
                    {c}
                  </Text>
                </Pressable>
              ))}
            </View>
          </div>
        </Modal>
      )}
    </>
  );
}

// ─── Summary strip ────────────────────────────────────────────────────────

interface AnalyticsSummaryStripProps {
  summary: ReturnType<typeof useAnalyticsScreenData>['summary'];
  periodComparison: ReturnType<typeof useAnalyticsScreenData>['periodComparison'];
  selectedRange: TimeRange;
  currency: string;
  topCategory: CategorySpending | null;
  onPress: () => void;
}

/**
 * Four tiles: Total Spent, Avg/day (both tap → drill-down, hover-tinted —
 * `Pressable` already gets `cursor:pointer` for free on web from
 * react-native-web's own default styles), Top Category (folded from
 * `QuickInsights`' dropped sentence card — same figure `CategoryBreakdown`'s
 * own first row leads with, via `categorySpending[0]`, not the separately
 * computed `summary.mostExpensiveCategory` string, so this tile can never
 * disagree with the breakdown below it) and Transactions (folded from the
 * count `SummaryCards` used to show only as a fallback when there was no
 * previous period to compare to — now always visible).
 */
function AnalyticsSummaryStrip({
  summary,
  periodComparison,
  selectedRange,
  currency,
  topCategory,
  onPress,
}: AnalyticsSummaryStripProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.summaryStrip}>
      <SummaryTile label={t('analytics.totalSpent')} onPress={onPress}>
        <Text style={[styles.summaryValue, { fontVariant: ['tabular-nums'] as const }]}>
          {formatCurrency(summary.totalSpent, currency)}
        </Text>
        {periodComparison.previousTotal > 0 && (
          <View style={styles.summaryTrendRow}>
            <Ionicons
              name={periodComparison.changePercent > 0 ? 'arrow-up' : 'arrow-down'}
              size={13}
              color={periodComparison.changePercent > 0 ? theme.colors.danger : theme.colors.success}
            />
            <Text
              style={[
                styles.summaryTrendText,
                { color: periodComparison.changePercent > 0 ? theme.colors.danger : theme.colors.success },
              ]}
            >
              {Math.abs(periodComparison.changePercent).toFixed(0)}%{' '}
              {periodComparison.changePercent > 0
                ? t('analytics.periodUp', { period: t(`analytics.${selectedRange}`) })
                : t('analytics.periodDown', { period: t(`analytics.${selectedRange}`) })}
            </Text>
          </View>
        )}
        {summary.vsAverage !== 0 && (
          <View style={styles.summaryTrendRow}>
            <Ionicons
              name={summary.vsAverage > 0 ? 'trending-up' : 'trending-down'}
              size={13}
              color={summary.vsAverage > 0 ? theme.colors.danger : theme.colors.success}
            />
            <Text
              style={[
                styles.summaryTrendText,
                { color: summary.vsAverage > 0 ? theme.colors.danger : theme.colors.success },
              ]}
            >
              {summary.vsAverage > 0
                ? t('analytics.vsAvgUp', { pct: Math.abs(summary.vsAverage).toFixed(0) })
                : t('analytics.vsAvgDown', { pct: Math.abs(summary.vsAverage).toFixed(0) })}
            </Text>
          </View>
        )}
      </SummaryTile>

      <SummaryTile label={t('analytics.avgPerDay')} onPress={onPress}>
        <Text style={[styles.summaryValue, { fontVariant: ['tabular-nums'] as const }]}>
          {formatCurrency(summary.averagePerDay, currency)}
        </Text>
        <Text style={styles.summarySubtext}>{t(`analytics.this_${selectedRange}`)}</Text>
      </SummaryTile>

      <SummaryTile label={t('analytics.topCategory')}>
        {topCategory ? (
          <>
            <View style={styles.summaryCategoryRow}>
              <View style={[styles.summaryCategoryDot, { backgroundColor: topCategory.color }]} />
              <Text style={styles.summaryCategoryName} numberOfLines={1}>
                {topCategory.name}
              </Text>
            </View>
            <Text style={[styles.summaryValue, { fontVariant: ['tabular-nums'] as const }]}>
              {formatCurrency(topCategory.amount, currency)}
            </Text>
          </>
        ) : (
          <Text style={[styles.summaryValue, { color: theme.colors.textTertiary }]}>—</Text>
        )}
      </SummaryTile>

      {/* `analytics.transactions` is the lowercase noun ("N transactions"),
          written for use inside a sentence (`SummaryCards.tsx`) — wrong case
          for a tile label sitting beside three Title Case ones.
          `drillDown.transactions` is the same word, Title Case, in all nine
          locales, and already the heading `openDrillDown` navigates to. */}
      <SummaryTile label={t('drillDown.transactions')}>
        <Text style={[styles.summaryValue, { fontVariant: ['tabular-nums'] as const }]}>
          {summary.transactionCount}
        </Text>
      </SummaryTile>
    </View>
  );
}

/**
 * One tile. `onPress` present ⇒ clickable (Total Spent / Avg per day, both
 * open the drill-down) with a hover tint — the one mouse-only affordance
 * this screen adds (Interactions §Hover). `onPress` absent ⇒ a plain,
 * non-interactive tile (Top Category / Transactions carry no destination).
 */
function SummaryTile({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress?: () => void;
  children: ReactNode;
}) {
  const styles = useStyles(createStyles);
  const [hovered, setHovered] = useState(false);

  if (!onPress) {
    return (
      <View style={styles.summaryTile}>
        <Text style={styles.summaryLabel}>{label}</Text>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.summaryTile, hovered && styles.summaryTileHovered]}
    >
      <Text style={styles.summaryLabel}>{label}</Text>
      {children}
    </Pressable>
  );
}

// ─── Trend + day-of-week row ──────────────────────────────────────────────

function TrendAndWeekdayRow({
  dailySpending,
  selectedRange,
  onBarPress,
  dayOfWeekSpending,
}: {
  dailySpending: ReturnType<typeof useAnalyticsScreenData>['dailySpending'];
  selectedRange: TimeRange;
  onBarPress: () => void;
  dayOfWeekSpending: ReturnType<typeof useAnalyticsScreenData>['dayOfWeekSpending'];
}) {
  const styles = useStyles(createStyles);
  return (
    <View style={styles.trendRow}>
      <View style={[styles.trendRowItem, { flex: 2, minWidth: 0 }]}>
        <SpendingTrendChart dailySpending={dailySpending} selectedRange={selectedRange} onBarPress={onBarPress} />
      </View>
      <View style={[styles.trendRowItem, { flex: 1, minWidth: 0 }]}>
        <DayOfWeekSection dayOfWeekSpending={dayOfWeekSpending} />
      </View>
    </View>
  );
}

// ─── Breakdown grid ────────────────────────────────────────────────────────

function categoryToRows(categorySpending: CategorySpending[]): BreakdownRow[] {
  return categorySpending.map((c, index) => ({
    id: c.categoryId ?? `category-${index}`,
    name: c.name,
    amount: c.amount,
    percentage: c.percentage,
    color: c.color,
    delta: c.vsAverage,
  }));
}

function merchantToRows(merchantSpending: MerchantSpending[]): BreakdownRow[] {
  return merchantSpending.map((m) => ({
    id: m.merchant,
    name: m.merchant,
    amount: m.amount,
    percentage: m.percentage,
    color: m.color,
  }));
}

function tagToRows(tagSpending: TagSpending[]): BreakdownRow[] {
  return tagSpending.map((ts) => ({
    id: ts.tagId,
    name: ts.name,
    amount: ts.amount,
    percentage: ts.percentage,
    color: ts.color,
  }));
}

function projectToRows(projectSpending: ProjectSpending[]): BreakdownRow[] {
  return projectSpending.map((ps) => ({
    id: ps.projectId,
    name: ps.name,
    amount: ps.amount,
    percentage: ps.percentage,
    color: ps.color,
    budget: ps.budget,
  }));
}

function incomeToRows(incomeByCategory: IncomeCategorySpending[]): BreakdownRow[] {
  return incomeByCategory.map((c, index) => ({
    id: c.categoryId ?? `income-${index}`,
    name: c.name,
    amount: c.amount,
    percentage: c.percentage,
    color: c.color,
  }));
}

interface BreakdownGridProps {
  isWideGrid: boolean;
  currency: string;
  categorySpending: CategorySpending[];
  merchantSpending: MerchantSpending[];
  tagSpending: TagSpending[];
  projectSpending: ProjectSpending[];
  incomeByCategory: IncomeCategorySpending[];
}

/**
 * Two row-groups, each its own `flexWrap` container (kept separate rather
 * than one 5-item wrap so Category's row never silently absorbs a stray
 * secondary tile when Merchant happens to be absent — see the task report
 * for the reasoning). At >=1440 (`isWideGrid`): row A is Category (2 of 3
 * tracks, never collapses, full list) + Merchant (1 of 3, conditional); row B
 * is Tag/Project/Income (each 1 of 3, conditional). Below 1440: Category
 * takes its own row alone at full width, and Merchant joins Tag/Project/
 * Income as a "secondaries" group that pairs two-per-row instead of three —
 * this is the one thing that genuinely reflows between the two width bands
 * (design's "What changes at 1024-1439"). `flexShrink: 1` on every tile
 * wrapper is deliberate: React Native's `View` defaults `flexShrink` to 0
 * (unlike the web default of 1), so without it a `gap`-bearing row whose
 * percentage-based tracks sum to 100% would overflow its container instead
 * of yielding the gap's width back.
 */
function BreakdownGrid({
  isWideGrid,
  currency,
  categorySpending,
  merchantSpending,
  tagSpending,
  projectSpending,
  incomeByCategory,
}: BreakdownGridProps) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);

  const hasMerchant = merchantSpending.length > 0;
  const showMerchantInRowA = isWideGrid && hasMerchant;

  // At the narrow band Merchant moves down to join the secondaries group;
  // at the wide band it stays with Category in row A above.
  const secondaries: { key: string; title: string; rows: BreakdownRow[] }[] = [
    ...(!isWideGrid && hasMerchant ? [{ key: 'merchant', title: t('analytics.byMerchant'), rows: merchantToRows(merchantSpending) }] : []),
    ...(tagSpending.length > 0 ? [{ key: 'tag', title: t('analytics.byTag'), rows: tagToRows(tagSpending) }] : []),
    ...(projectSpending.length > 0 ? [{ key: 'project', title: t('analytics.byProject'), rows: projectToRows(projectSpending) }] : []),
    ...(incomeByCategory.length > 0 ? [{ key: 'income', title: t('analytics.byIncomeCategory'), rows: incomeToRows(incomeByCategory) }] : []),
  ];

  const secondaryBasis = isWideGrid ? '33%' : '50%';

  return (
    <View style={styles.breakdownGrid}>
      <View style={styles.breakdownRow}>
        <View style={[styles.breakdownTile, { flexBasis: isWideGrid ? '66%' : '100%', flexGrow: 1, flexShrink: 1, minWidth: 0 }]}>
          <BreakdownCard title={t('analytics.spendingByCategory')} rows={categoryToRows(categorySpending)} currency={currency} size="primary" />
        </View>
        {showMerchantInRowA && (
          <View style={[styles.breakdownTile, { flexBasis: '33%', flexGrow: 1, flexShrink: 1, minWidth: 0 }]}>
            <BreakdownCard title={t('analytics.byMerchant')} rows={merchantToRows(merchantSpending)} currency={currency} size="secondary" />
          </View>
        )}
      </View>

      {secondaries.length > 0 && (
        <View style={styles.breakdownRow}>
          {secondaries.map((s) => (
            <View key={s.key} style={[styles.breakdownTile, { flexBasis: secondaryBasis, flexGrow: 1, flexShrink: 1, minWidth: 0 }]}>
              <BreakdownCard title={s.title} rows={s.rows} currency={currency} size="secondary" />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Top receipt items ─────────────────────────────────────────────────────

/**
 * Own wide card, the same 10 ranked rows `TopReceiptItems` shows on mobile
 * laid out as two columns of 5 instead of one column of 10 — a phone has to
 * scroll a list of 10, a wide window can show all of it without scrolling
 * further. Built fresh (not a wrapped `TopReceiptItems`) since that component
 * has no two-column layout of its own to opt into — same "adapter, don't
 * touch the mobile component" precedent `BreakdownCard`'s adapters follow.
 */
function TopItemsCard({
  itemBreakdown,
  currency,
}: {
  itemBreakdown: ReturnType<typeof useAnalyticsScreenData>['itemBreakdown'];
  currency: string;
}) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const top10 = itemBreakdown.slice(0, 10);
  const columnA = top10.slice(0, 5);
  const columnB = top10.slice(5, 10);

  const renderColumn = (items: typeof top10, startIndex: number) => (
    <View style={styles.topItemsColumn}>
      {items.map((item, i) => (
        <View key={item.description} style={styles.topItemRow}>
          <View style={styles.topItemRank}>
            <Text style={styles.topItemRankText}>{startIndex + i + 1}</Text>
          </View>
          <View style={styles.topItemInfo}>
            <Text style={styles.topItemName} numberOfLines={1}>
              {item.description}
            </Text>
            <Text style={styles.topItemMeta}>
              {t('analytics.itemPurchaseCount')}: {item.count}
            </Text>
          </View>
          <Text style={styles.topItemAmount}>{formatCurrency(item.totalSpent, currency)}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.topItemsCard}>
      <Text style={styles.topItemsTitle}>{t('analytics.topItems')}</Text>
      <View style={styles.topItemsColumns}>
        {renderColumn(columnA, 0)}
        {columnB.length > 0 && renderColumn(columnB, 5)}
      </View>
    </View>
  );
}

// ─── Insights cluster ──────────────────────────────────────────────────────

interface InsightsClusterProps {
  summary: ReturnType<typeof useAnalyticsScreenData>['summary'];
  predictions: BudgetPredictionItem[];
  selectedRange: TimeRange;
  currency: string;
  aiInsights: AIInsightChart[];
  aiInsightsProGated: boolean;
  /** True when the selected period is genuinely empty (Empty state) — the
   *  deterministic tiles (daily budget tip, discount savings, predictions)
   *  are meaningless at zero data and are dropped; the AI tiles are NOT
   *  period-scoped (`useAnalyticsScreenData` loads them once on mount/
   *  language change, never on period change) so they stay regardless,
   *  matching the design's explicit carve-out for the gated upsell tile. */
  suppressDeterministicTiles: boolean;
}

/**
 * Merges `AiInsightsSection` and `QuickInsights` into ONE 2-up cluster
 * (design's "Where two blocks answer the same question" + "What each mobile
 * affordance becomes"). Built fresh rather than nesting the two mobile
 * components, because merging them means hoisting `AiUsageBadge` out to the
 * CLUSTER's own header and making every tile (AI or deterministic) the same
 * shape — something wrapping the two mobile section components as opaque
 * blocks cannot produce; both mobile components are left untouched. The
 * "topCategory"/"highestSpendingDay" sentence cards and the Anomalies list
 * are dropped per decision 1/2/3 in the design and are not reproduced here
 * in any form — their computations still run in `useAnalyticsScreenData`,
 * unread by this component.
 */
function InsightsCluster({
  summary,
  predictions,
  selectedRange,
  currency,
  aiInsights,
  aiInsightsProGated,
  suppressDeterministicTiles,
}: InsightsClusterProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const showUpgrade = useUpgradeStore((s) => s.show);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const exhaustingPredictions = predictions.filter((p) => p.estimatedExhaustionDate);

  const showAiUsageBadge = !aiInsightsProGated && aiInsights.length > 0;
  // The daily-budget-tip tile is unconditional whenever deterministic tiles
  // aren't suppressed (mirrors `QuickInsights`, which renders it with no
  // `if` guard at all) — so `!suppressDeterministicTiles` alone already
  // guarantees at least one deterministic tile exists.
  const hasAnyTile = aiInsightsProGated || aiInsights.length > 0 || !suppressDeterministicTiles;

  if (!hasAnyTile) return null;

  return (
    <View style={styles.section}>
      <View style={styles.clusterHeader}>
        <Text style={styles.sectionTitle}>{t('analytics.quickInsights')}</Text>
        {showAiUsageBadge && <AiUsageBadge />}
      </View>

      <View style={styles.insightsCluster}>
        {aiInsightsProGated && (
          <View style={[styles.insightTileWrap]}>
            <TouchableOpacity
              style={styles.gatedTile}
              activeOpacity={0.8}
              onPress={() => showUpgrade(t('insights.proRequired'), 'pro')}
            >
              <Ionicons name="lock-closed" size={18} color={theme.colors.warning} />
              <View style={styles.insightTileContent}>
                <Text style={styles.insightTileTitle} numberOfLines={1}>
                  {t('insights.aiSuggested')}
                </Text>
                <Text style={styles.insightTileSubtitle} numberOfLines={1}>
                  {t('insights.proRequired')}
                </Text>
              </View>
              <View style={styles.gatedChip}>
                <Text style={styles.gatedChipText}>{t('subscription.upgrade')}</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {!aiInsightsProGated &&
          aiInsights.slice(0, 5).map((insight) => {
            const isExpanded = expandedId === insight.id;
            const severityColor =
              insight.severity === 'critical'
                ? theme.colors.danger
                : insight.severity === 'warning'
                  ? theme.colors.warning
                  : theme.colors.info;
            const severityBg =
              insight.severity === 'critical'
                ? theme.colors.dangerLight
                : insight.severity === 'warning'
                  ? theme.colors.warningLight
                  : theme.colors.primaryLight;
            return (
              <View key={insight.id} style={styles.insightTileWrap}>
                <TouchableOpacity
                  style={styles.insightTile}
                  activeOpacity={0.7}
                  onPress={() => setExpandedId((prev) => (prev === insight.id ? null : insight.id))}
                >
                  <View style={styles.insightTileHeader}>
                    <View style={[styles.severityBadge, { backgroundColor: severityBg }]}>
                      <Ionicons
                        name={
                          insight.severity === 'critical'
                            ? 'alert-circle'
                            : insight.severity === 'warning'
                              ? 'warning'
                              : 'information-circle'
                        }
                        size={14}
                        color={severityColor}
                      />
                    </View>
                    <Text style={styles.insightTileTitle} numberOfLines={isExpanded ? undefined : 1}>
                      {insight.title}
                    </Text>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={theme.colors.textTertiary}
                    />
                  </View>
                  <Text style={styles.insightTileSubtitle} numberOfLines={isExpanded ? undefined : 2}>
                    {insight.description}
                  </Text>
                  {insight.actionSuggestion && (
                    <View style={styles.insightTileAction}>
                      <Ionicons name="bulb-outline" size={13} color={theme.colors.primary} />
                      <Text style={styles.insightTileActionText} numberOfLines={isExpanded ? undefined : 1}>
                        {insight.actionSuggestion}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}

        {!suppressDeterministicTiles && (
          <View style={styles.insightTileWrap}>
            <View style={styles.insightTile}>
              <View style={styles.insightTileHeader}>
                <View style={[styles.severityBadge, { backgroundColor: theme.colors.warningLight }]}>
                  <Ionicons name="bulb-outline" size={14} color={theme.colors.warning} />
                </View>
                <Text style={styles.insightTileTitle} numberOfLines={1}>
                  {t('analytics.dailyBudgetTip')}
                </Text>
              </View>
              <Text style={styles.insightTileSubtitle}>
                {t('analytics.dailyBudgetText', { amount: formatCurrency(summary.averagePerDay * 0.9, currency) })}
              </Text>
            </View>
          </View>
        )}

        {!suppressDeterministicTiles && summary.totalDiscountSavings > 0 && (
          <View style={styles.insightTileWrap}>
            <View style={styles.insightTile}>
              <View style={styles.insightTileHeader}>
                <View style={[styles.severityBadge, { backgroundColor: theme.colors.successLight }]}>
                  <Ionicons name="pricetag-outline" size={14} color={theme.colors.success} />
                </View>
                <Text style={styles.insightTileTitle} numberOfLines={1}>
                  {t('analytics.totalSavings')}
                </Text>
              </View>
              <Text style={styles.insightTileSubtitle}>
                {t('analytics.totalSavingsText', {
                  amount: formatCurrency(summary.totalDiscountSavings, currency),
                  range: t(`analytics.${selectedRange}`),
                })}
              </Text>
            </View>
          </View>
        )}

        {!suppressDeterministicTiles &&
          exhaustingPredictions.map((prediction) => (
            <View key={prediction.budgetId} style={styles.insightTileWrap}>
              <View style={styles.insightTile}>
                <View style={styles.insightTileHeader}>
                  <View style={[styles.severityBadge, { backgroundColor: theme.colors.dangerLight }]}>
                    <Ionicons name="time-outline" size={14} color={theme.colors.danger} />
                  </View>
                  <Text style={styles.insightTileTitle} numberOfLines={1}>
                    {prediction.budgetName}
                  </Text>
                </View>
                <Text style={styles.insightTileSubtitle}>
                  {t('insights.exhaustionText', {
                    date: new Date(prediction.estimatedExhaustionDate!).toLocaleDateString(getIntlLocale(), {
                      month: 'short',
                      day: 'numeric',
                    }),
                  })}
                </Text>
                <Text style={styles.insightTileSubtitle}>
                  {t('insights.projectedTotal', {
                    amount: formatCurrency(prediction.projectedTotal, prediction.currencyCode as any),
                  })}
                </Text>
              </View>
            </View>
          ))}
      </View>
    </View>
  );
}

// ─── Discovery row ─────────────────────────────────────────────────────────

/**
 * Story / Scenario Simulator / Wrapped, demoted from mid-scroll full-width
 * banners to a small bottom row of three (design's "What each mobile
 * affordance becomes") — same destinations/params, same i18n keys.
 */
function DiscoveryRow({ selectedMonth, selectedYear }: { selectedMonth: number; selectedYear: number }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.discoveryRow}>
      <Pressable
        style={styles.discoveryCard}
        onPress={() => router.push({ pathname: '/story', params: { month: String(selectedMonth), year: String(selectedYear) } })}
        accessibilityRole="button"
      >
        <Ionicons name="book-outline" size={20} color={theme.colors.primary} />
        <Text style={styles.discoveryTitle} numberOfLines={1}>{t('story.viewStory')}</Text>
        <Text style={styles.discoverySubtitle} numberOfLines={1}>{t('story.title')}</Text>
      </Pressable>

      <Pressable style={styles.discoveryCard} onPress={() => router.push('/scenario-simulator')} accessibilityRole="button">
        <Ionicons name="flask-outline" size={20} color={theme.colors.primary} />
        <Text style={styles.discoveryTitle} numberOfLines={1}>{t('scenarioSimulator.title')}</Text>
        <Text style={styles.discoverySubtitle} numberOfLines={1}>{t('scenarioSimulator.subtitle')}</Text>
      </Pressable>

      <Pressable
        style={styles.discoveryCard}
        onPress={() => router.push({ pathname: '/wrapped', params: { year: String(selectedYear) } })}
        accessibilityRole="button"
      >
        <Ionicons name="gift-outline" size={20} color={theme.colors.primary} />
        <Text style={styles.discoveryTitle} numberOfLines={1}>{t('wrapped.title')}</Text>
        <Text style={styles.discoverySubtitle} numberOfLines={1}>{t('wrapped.introSub')}</Text>
      </Pressable>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const createStyles = (theme: Theme) => ({
  root: {
    flex: 1,
    // Must paint its own ground — see `ExpensesDesktop`'s identical comment;
    // a transparent tree shows React Navigation's light default through it.
    backgroundColor: theme.colors.background,
  },
  controlRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  controlRowLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[4],
  },
  controlRowRight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  rangeToggle: {
    flexDirection: 'row' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: 3,
  },
  rangeToggleButton: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
  },
  rangeToggleButtonActive: {
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  rangeToggleText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  rangeToggleTextActive: {
    color: theme.colors.primary,
  },
  periodNav: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  periodNavLabel: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    minWidth: 120,
    textAlign: 'center' as const,
  },
  currencyTrigger: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  currencyTriggerText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  currencyMenu: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[1],
    minWidth: 140,
    ...theme.shadows.lg,
  },
  currencyMenuItem: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  currencyMenuItemText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
  exportButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    borderWidth: 1,
    borderColor: theme.colors.primary,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
  exportButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  pageScroll: {
    flex: 1,
  },
  pageContent: {
    flexGrow: 1,
  },
  body: {
    padding: theme.spacing[5],
    paddingBottom: theme.spacing[8],
    gap: theme.spacing[5],
  },
  loadingBlock: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[16],
  },
  emptyBlock: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing[16],
    ...theme.shadows.sm,
  },
  emptyBlockText: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[4],
  },
  emptyBlockSubtext: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  summaryStrip: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[3],
  },
  summaryTile: {
    flexBasis: '23%' as const,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 200,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  summaryTileHovered: {
    backgroundColor: theme.colors.surfaceSecondary,
  },
  summaryLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1.5],
  },
  summaryValue: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
  },
  summarySubtext: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  summaryTrendRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    marginTop: theme.spacing[1],
  },
  summaryTrendText: {
    ...theme.textStyles.caption,
    fontWeight: '600' as const,
  },
  summaryCategoryRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    marginBottom: theme.spacing[1],
  },
  summaryCategoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  summaryCategoryName: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  trendRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[4],
  },
  trendRowItem: {
    // width comes purely from the flex weight the caller passes inline
    // (flex: 2 / flex: 1) — nothing else to set here.
  },
  breakdownGrid: {
    gap: theme.spacing[4],
  },
  breakdownRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[4],
  },
  breakdownTile: {
    // flexBasis/flexGrow/flexShrink come from the caller (regime-dependent) —
    // this only carries what's common to every tile in the grid.
  },
  topItemsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  topItemsTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3],
  },
  topItemsColumns: {
    flexDirection: 'row' as const,
    gap: theme.spacing[4],
  },
  topItemsColumn: {
    flex: 1,
    minWidth: 0,
  },
  topItemRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  topItemRank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: theme.spacing[2.5],
    flexShrink: 0,
  },
  topItemRankText: {
    ...theme.textStyles.caption,
    fontWeight: '700' as const,
    color: theme.colors.textInverse,
  },
  topItemInfo: {
    flex: 1,
    minWidth: 0,
    marginRight: theme.spacing[2],
  },
  topItemName: {
    ...theme.textStyles.bodySm,
    fontWeight: '500' as const,
    color: theme.colors.textPrimary,
  },
  topItemMeta: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  topItemAmount: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  section: {
    // no marginBottom — the outer `body` container's own `gap` handles the
    // spacing between this and its siblings.
  },
  sectionTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  clusterHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: theme.spacing[3],
  },
  insightsCluster: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[3],
  },
  insightTileWrap: {
    flexBasis: '48%' as const,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 260,
  },
  insightTile: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    height: '100%' as const,
    ...theme.shadows.sm,
  },
  gatedTile: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    borderWidth: 1,
    borderColor: theme.colors.warningLight,
    height: '100%' as const,
    ...theme.shadows.sm,
  },
  gatedChip: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
  },
  gatedChipText: {
    ...theme.textStyles.caption,
    fontWeight: '700' as const,
    color: theme.colors.textInverse,
  },
  insightTileHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  insightTileContent: {
    flex: 1,
    minWidth: 0,
  },
  severityBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexShrink: 0,
  },
  insightTileTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  insightTileSubtitle: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  insightTileAction: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    marginTop: theme.spacing[2],
    paddingTop: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  insightTileActionText: {
    ...theme.textStyles.caption,
    color: theme.colors.primary,
    flex: 1,
  },
  wideSection: {
    // Plain pass-through — `InflationIndexSection` already paints its own
    // header + card; no extra chrome needed around it here.
  },
  discoveryRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[3],
  },
  discoveryCard: {
    flexBasis: '31%' as const,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 220,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    gap: theme.spacing[1],
  },
  discoveryTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.primary,
  },
  discoverySubtitle: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
});
