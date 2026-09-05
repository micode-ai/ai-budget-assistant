import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useCategoryStore } from '@/stores/categoryStore';
import { countsForFacet, type ActiveFacets, type LedgerRow } from '@/features/expenses/desktopTable';
import type { ActiveTab } from '@/features/expenses/useExpensesScreenData';

/**
 * The facet rail (design spec decision 3): the mobile pill row's desktop
 * replacement. Four groups — period, kind (the mobile tab, now a facet: see
 * decision 8), category, merchant — each rendered here from data the parent
 * (`ExpensesDesktop`) has already narrowed to "everything else that's
 * currently active", so a count beside one value answers "what would I get
 * if I picked this too". `ActiveFacets` keeps its `accountId` member for
 * Task 1's module — it is never read here, on purpose (see task brief).
 */

export type PeriodFacet = 'week' | 'month' | 'year' | 'all' | 'custom';
export type KindFacet = ActiveTab | 'all';
/** The two `FacetGroup` members this rail actually renders. `accountId` is
 *  deliberately excluded — every row on this screen already belongs to one
 *  account, so a facet for it would offer exactly one, always-checked option. */
type DynamicFacetGroup = 'categoryId' | 'merchant';

const PERIODS: PeriodFacet[] = ['week', 'month', 'year', 'all', 'custom'];
const MONTH_KEYS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
] as const;
/** Past this many distinct values, a group collapses behind "Show N more" —
 *  see the task report for why this number and not another. An option the
 *  user already has active is always kept visible regardless of the cap;
 *  see `capOptions`. */
const FACET_OPTION_CAP = 8;

interface FacetOption {
  value: string;
  label: string;
  count: number;
  color?: string;
}

/**
 * One row per distinct value the counts map produced, PLUS any value the
 * caller has active but that no longer has a matching row (count 0) — an
 * active checkbox must never silently disappear just because the other
 * active facets narrowed its count to zero.
 */
function buildOptions(
  counts: Map<string, number>,
  active: string[],
  labelFor: (key: string) => string,
  colorFor?: (key: string) => string | undefined
): FacetOption[] {
  const keys = new Set(counts.keys());
  for (const value of active) keys.add(value);
  return [...keys]
    .map((value) => ({
      value,
      count: counts.get(value) ?? 0,
      label: labelFor(value),
      color: colorFor?.(value),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Caps the visible list at `FACET_OPTION_CAP`, but never hides a value the
 *  user already selected — see the task report's judgment call on this. */
function capOptions(options: FacetOption[], active: string[], expanded: boolean): FacetOption[] {
  if (expanded || options.length <= FACET_OPTION_CAP) return options;
  const activeSet = new Set(active);
  return options.filter((o, i) => i < FACET_OPTION_CAP || activeSet.has(o.value));
}

interface FacetRailProps {
  /** 'stack': the persistent side rail (>=1440). 'row': the collapsed band's
   *  dropdown panel (1024-1439) — same groups, laid out as columns so it
   *  doesn't read as one very tall list under the top bar. */
  layout: 'stack' | 'row';
  /** Rows already narrowed by period AND kind (but NOT yet by category/
   *  merchant) — the baseline every category/merchant count is computed
   *  against. */
  rows: LedgerRow[];
  active: ActiveFacets;
  onToggleCategory: (categoryId: string) => void;
  onToggleMerchant: (merchant: string) => void;
  onClearGroup: (group: DynamicFacetGroup) => void;
  onClearAll: () => void;
  activeFacetCount: number;
  period: PeriodFacet;
  onPeriodChange: (period: PeriodFacet) => void;
  customMonth: number;
  customYear: number;
  onCustomMonthChange: (month: number, year: number) => void;
  kind: KindFacet;
  onKindChange: (kind: KindFacet) => void;
}

export function FacetRail({
  layout,
  rows,
  active,
  onToggleCategory,
  onToggleMerchant,
  onClearGroup,
  onClearAll,
  activeFacetCount,
  period,
  onPeriodChange,
  customMonth,
  customYear,
  onCustomMonthChange,
  kind,
  onKindChange,
}: FacetRailProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const categories = useCategoryStore((s) => s.categories);
  const [categoryExpanded, setCategoryExpanded] = useState(false);
  const [merchantExpanded, setMerchantExpanded] = useState(false);

  // No `type === 'expense'` filter here on purpose — mirrors `TransactionTable`'s
  // own `categoryById`, which reads the whole store the same way. A stray
  // categoryId that resolves to nothing (a soft-deleted category) still needs
  // *some* label, handled by the `?? uncategorized` fallback below.
  const categoryById = useMemo(() => {
    const map = new Map<string, { name: string; color?: string }>();
    for (const c of categories) map.set(c.id, { name: c.name, color: c.color });
    return map;
  }, [categories]);

  const categoryCounts = useMemo(() => countsForFacet(rows, active, 'categoryId'), [rows, active]);
  const merchantCounts = useMemo(() => countsForFacet(rows, active, 'merchant'), [rows, active]);

  const categoryOptions = useMemo(
    () =>
      buildOptions(
        categoryCounts,
        active.categoryId,
        (key) => (key === '' ? t('common.uncategorized') : categoryById.get(key)?.name ?? t('common.uncategorized')),
        (key) => (key === '' ? undefined : categoryById.get(key)?.color)
      ),
    [categoryCounts, active.categoryId, categoryById, t]
  );
  const merchantOptions = useMemo(
    () => buildOptions(merchantCounts, active.merchant, (key) => (key === '' ? t('expensesDesktop.noMerchant') : key)),
    [merchantCounts, active.merchant, t]
  );

  const visibleCategoryOptions = capOptions(categoryOptions, active.categoryId, categoryExpanded);
  const visibleMerchantOptions = capOptions(merchantOptions, active.merchant, merchantExpanded);

  const goPrevMonth = () => {
    const prevMonth = customMonth === 0 ? 11 : customMonth - 1;
    const prevYear = customMonth === 0 ? customYear - 1 : customYear;
    onCustomMonthChange(prevMonth, prevYear);
  };
  const goNextMonth = () => {
    const nextMonth = customMonth === 11 ? 0 : customMonth + 1;
    const nextYear = customMonth === 11 ? customYear + 1 : customYear;
    onCustomMonthChange(nextMonth, nextYear);
  };

  return (
    <View style={layout === 'row' ? styles.panel : styles.sidebar}>
      {/* A plain View, not a ScrollView: the desktop screen owns ONE page
          scroll, so the rail moves with the rows and the window's scrollbar is
          the only one on screen. Nesting a scroller here would trap the wheel
          whenever the pointer happened to be over the filters. */}
      <View style={layout === 'row' ? styles.groupsRow : styles.groupsStack}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('expensesDesktop.facetsHeading')}</Text>
          {activeFacetCount > 0 && (
            <Pressable onPress={onClearAll} accessibilityRole="button">
              <Text style={styles.clearAllText}>{t('expensesDesktop.clearAllFilters')}</Text>
            </Pressable>
          )}
        </View>

        <FacetGroupSection title={t('expensesDesktop.facetPeriod')}>
          {PERIODS.map((p) => (
            <RadioRow
              key={p}
              label={t(`expenses.period${p.charAt(0).toUpperCase()}${p.slice(1)}` as any)}
              selected={period === p}
              onPress={() => onPeriodChange(p)}
            />
          ))}
          {period === 'custom' && (
            <View style={styles.monthNav}>
              <Pressable onPress={goPrevMonth} accessibilityRole="button" style={styles.monthNavBtn}>
                <Ionicons name="chevron-back" size={16} color={theme.colors.primary} />
              </Pressable>
              <Text style={styles.monthNavLabel}>
                {t(`analytics.months.${MONTH_KEYS[customMonth]}` as any)} {customYear}
              </Text>
              <Pressable onPress={goNextMonth} accessibilityRole="button" style={styles.monthNavBtn}>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
              </Pressable>
            </View>
          )}
        </FacetGroupSection>

        <FacetGroupSection title={t('expensesDesktop.facetKind')}>
          <RadioRow label={t('expenses.tabExpenses')} selected={kind === 'expenses'} onPress={() => onKindChange('expenses')} />
          <RadioRow label={t('expenses.tabIncome')} selected={kind === 'income'} onPress={() => onKindChange('income')} />
          <RadioRow label={t('expensesDesktop.kindAll')} selected={kind === 'all'} onPress={() => onKindChange('all')} />
        </FacetGroupSection>

        <FacetGroupSection
          title={t('expensesDesktop.facetCategory')}
          onClear={active.categoryId.length > 0 ? () => onClearGroup('categoryId') : undefined}
        >
          {categoryOptions.length === 0 ? (
            <Text style={styles.emptyGroupText}>{t('expensesDesktop.noOptions')}</Text>
          ) : (
            <>
              {visibleCategoryOptions.map((o) => (
                <CheckboxRow
                  key={o.value}
                  label={o.label}
                  count={o.count}
                  color={o.color}
                  selected={active.categoryId.includes(o.value)}
                  onPress={() => onToggleCategory(o.value)}
                />
              ))}
              <ShowMoreToggle
                total={categoryOptions.length}
                visibleCount={visibleCategoryOptions.length}
                expanded={categoryExpanded}
                onToggle={() => setCategoryExpanded((v) => !v)}
              />
            </>
          )}
        </FacetGroupSection>

        <FacetGroupSection
          title={t('expensesDesktop.facetMerchant')}
          onClear={active.merchant.length > 0 ? () => onClearGroup('merchant') : undefined}
        >
          {merchantOptions.length === 0 ? (
            <Text style={styles.emptyGroupText}>{t('expensesDesktop.noOptions')}</Text>
          ) : (
            <>
              {visibleMerchantOptions.map((o) => (
                <CheckboxRow
                  key={o.value}
                  label={o.label}
                  count={o.count}
                  selected={active.merchant.includes(o.value)}
                  onPress={() => onToggleMerchant(o.value)}
                />
              ))}
              <ShowMoreToggle
                total={merchantOptions.length}
                visibleCount={visibleMerchantOptions.length}
                expanded={merchantExpanded}
                onToggle={() => setMerchantExpanded((v) => !v)}
              />
            </>
          )}
        </FacetGroupSection>
      </View>
    </View>
  );
}

/** The trigger the 1024-1439 band shows in the top bar instead of the rail —
 *  its own label states how many facet GROUPS currently narrow the view, so
 *  collapsing the rail never means collapsing the fact that it's filtering. */
export function FacetRailTrigger({
  activeCount,
  open,
  onPress,
}: {
  activeCount: number;
  open: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createTriggerStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      style={[styles.trigger, activeCount > 0 && styles.triggerActive]}
    >
      <Ionicons
        name="options-outline"
        size={16}
        color={activeCount > 0 ? theme.colors.primary : theme.colors.textSecondary}
      />
      <Text style={[styles.triggerText, activeCount > 0 && styles.triggerTextActive]}>
        {t('expensesDesktop.filtersLabel', { count: activeCount })}
      </Text>
      <Ionicons
        name={open ? 'chevron-up' : 'chevron-down'}
        size={14}
        color={activeCount > 0 ? theme.colors.primary : theme.colors.textSecondary}
      />
    </Pressable>
  );
}

function ShowMoreToggle({
  total,
  visibleCount,
  expanded,
  onToggle,
}: {
  total: number;
  visibleCount: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles(createOptionStyles);
  if (total <= visibleCount && !expanded) return null;
  if (!expanded && total > visibleCount) {
    return (
      <Pressable onPress={onToggle} accessibilityRole="button" style={styles.showMoreRow}>
        <Text style={styles.showMoreText}>{t('expensesDesktop.showMore', { count: total - visibleCount })}</Text>
      </Pressable>
    );
  }
  if (expanded && total > FACET_OPTION_CAP) {
    return (
      <Pressable onPress={onToggle} accessibilityRole="button" style={styles.showMoreRow}>
        <Text style={styles.showMoreText}>{t('expensesDesktop.showLess')}</Text>
      </Pressable>
    );
  }
  return null;
}

function FacetGroupSection({
  title,
  onClear,
  children,
}: {
  title: string;
  onClear?: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const styles = useStyles(createGroupStyles);
  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupTitle}>{title}</Text>
        {onClear && (
          <Pressable onPress={onClear} accessibilityRole="button">
            <Text style={styles.groupClearText}>{t('expensesDesktop.clearFacet')}</Text>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

function RadioRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  const styles = useStyles(createOptionStyles);
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.row, hovered && styles.rowHovered]}
    >
      <View style={[styles.radioOuter, { borderColor: selected ? theme.colors.primary : theme.colors.border }]}>
        {selected && <View style={[styles.radioInner, { backgroundColor: theme.colors.primary }]} />}
      </View>
      <Text
        style={[styles.optionLabel, selected && { color: theme.colors.primary }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function CheckboxRow({
  label,
  count,
  color,
  selected,
  onPress,
}: {
  label: string;
  count: number;
  color?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles(createOptionStyles);
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      style={[styles.row, hovered && styles.rowHovered]}
    >
      <View
        style={[
          styles.checkbox,
          { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
          selected && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
        ]}
      >
        {selected && <Ionicons name="checkmark" size={12} color={theme.colors.textInverse} />}
      </View>
      {color && <View style={[styles.colorDot, { backgroundColor: color }]} />}
      <Text style={styles.optionLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.optionCount, { fontVariant: ['tabular-nums'] }]}>{count}</Text>
    </Pressable>
  );
}

const RAIL_WIDTH = 224;

const createStyles = (theme: Theme) => ({
  sidebar: {
    width: RAIL_WIDTH,
    flexShrink: 0,
    borderRightWidth: 1,
    borderRightColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  groupsStack: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
  },
  panel: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  groupsRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: theme.spacing[2],
    // In the row layout this heading sits above the wrapped groups, spanning
    // the full width rather than living inside one column.
    width: '100%' as const,
  },
  headerTitle: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
  },
  clearAllText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  emptyGroupText: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    paddingVertical: theme.spacing[1],
  },
  monthNav: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    marginTop: theme.spacing[1],
  },
  monthNavBtn: {
    padding: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  monthNavLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
    minWidth: 88,
    textAlign: 'center' as const,
  },
});

const createGroupStyles = (theme: Theme) => ({
  group: {
    // In 'row' layout each group is one wrapped column; in 'stack' it is a
    // full-width block. `RAIL_WIDTH - padding` keeps a column readable
    // without depending on the parent's own layout mode.
    width: 200,
    marginBottom: theme.spacing[3],
  },
  groupHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: theme.spacing[1],
  },
  groupTitle: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  groupClearText: {
    ...theme.textStyles.caption,
    color: theme.colors.primary,
  },
});

const createOptionStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  rowHovered: {
    backgroundColor: theme.colors.surfaceSecondary,
  },
  radioOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  optionLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    flex: 1,
    flexShrink: 1,
  },
  optionCount: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  showMoreRow: {
    paddingVertical: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[1],
  },
  showMoreText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.primary,
  },
});

const createTriggerStyles = (theme: Theme) => ({
  trigger: {
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
  triggerActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  triggerText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  triggerTextActive: {
    color: theme.colors.primary,
  },
});
