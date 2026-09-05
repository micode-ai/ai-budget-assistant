import { useMemo, useRef, useState } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useBudgetsScreenData } from '@/features/budgets/useBudgetsScreenData';
import { useFinancialMonth } from '@/hooks/useFinancialMonth';
import {
  classifyBudget,
  groupBudgets,
  shouldShowGroupHeaders,
  countCategoriesOverAllocation,
} from '@/features/budgets/budgetGrouping';
import { BudgetCard } from './BudgetCard';
import { BudgetDialog } from './BudgetDialog';
import { BudgetCreateDialog } from './BudgetCreateDialog';

/**
 * Desktop Budgets screen (`docs/design/2026-09-05-budgets-web.md`). Follows
 * the wireframe: a screen-local control row (the create action — no FAB, per
 * the Universal rule) above ONE page scroll holding a 4-tile summary strip
 * and two grouped card grids, "Needs attention" and "On track". Reuses
 * `useBudgetsScreenData()` unchanged (read-only for this task) — every
 * number here is computed exactly where it already was
 * (`getBudgetProgress`); this file only decides grouping and where each
 * number is PRINTED. `budgetGrouping.ts` (Task 5) is the one new pure
 * computation, and it's a VIEW over the existing data, not a new source of
 * truth.
 *
 * **Deliberately no page-level period control** — the design's own "Why
 * there is no period control": budgets carry heterogeneous periods (daily/
 * weekly/monthly/yearly/custom, the latter anchored per-account), so there
 * is no single shared clock a page control could meaningfully drive. Every
 * card always shows its own current period, exactly like the mobile list.
 *
 * **No FAB** — the create action lives in this screen's own control row,
 * direct application of the Universal rule against a FAB (task brief).
 */
export function BudgetsDesktop() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const { visibleBudgets, getBudgetProgress, budgetsLoading, canEdit } = useBudgetsScreenData();
  const { anchorDay } = useFinancialMonth();

  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const needsAttentionY = useRef<number | null>(null);
  const onTrackY = useRef<number | null>(null);

  // "This list always shows now" (design) — one Date shared by every card in
  // this render pass, rather than each card computing its own.
  const now = new Date();

  const classified = useMemo(
    () => visibleBudgets.map((b) => classifyBudget(b, getBudgetProgress(b.id))),
    [visibleBudgets, getBudgetProgress],
  );
  const groups = useMemo(() => groupBudgets(classified), [classified]);
  const showHeaders = shouldShowGroupHeaders(groups);
  const categoriesOverCount = useMemo(() => countCategoriesOverAllocation(classified), [classified]);

  const selectedBudget = visibleBudgets.find((b) => b.id === selectedBudgetId) ?? null;

  const scrollToRef = (ref: MutableRefObject<number | null>) => {
    if (ref.current == null) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, ref.current - 16), animated: true });
  };

  // Widened loading signal (design's "States" — a required store-level
  // change landed in an earlier task on this branch): `budgetsLoading` now
  // spans BOTH the local-SQLite phase AND the server pull, so desktop web
  // (no SQLite mirror, an instant-empty local read) doesn't flash the empty
  // state before the real numbers land.
  const isLoading = budgetsLoading && visibleBudgets.length === 0;
  const isEmpty = !isLoading && visibleBudgets.length === 0;

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <View style={styles.topBarLeft} />
        {canEdit && (
          <Pressable style={styles.addButton} onPress={() => setCreateOpen(true)} accessibilityRole="button">
            <Ionicons name="add" size={18} color={theme.colors.textInverse} />
            <Text style={styles.addButtonText}>{t('budgets.createBudget')}</Text>
          </Pressable>
        )}
      </View>

      <ScrollView ref={scrollRef} style={styles.pageScroll} contentContainerStyle={styles.pageContent}>
        <View style={styles.body}>
          {isLoading ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : isEmpty ? (
            <View style={styles.emptyOuter}>
              <View style={styles.emptyCard}>
                <Ionicons name="wallet-outline" size={64} color={theme.colors.textDisabled} />
                <Text style={styles.emptyTitle}>{t('budgets.noBudgets')}</Text>
                <Text style={styles.emptySubtitle}>{t('budgets.createHint')}</Text>
                <Text style={styles.emptyHint}>{t('budgetsDesktop.emptyHint')}</Text>
                {canEdit && (
                  <Pressable style={styles.emptyButton} onPress={() => setCreateOpen(true)} accessibilityRole="button">
                    <Text style={styles.emptyButtonText}>{t('budgets.createBudget')}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ) : (
            <>
              <BudgetsSummaryStrip
                total={visibleBudgets.length}
                needsAttention={groups.needsAttention.length}
                onTrack={groups.onTrack.length}
                categoriesOver={categoriesOverCount}
                onPressNeedsAttention={() => scrollToRef(needsAttentionY)}
                onPressOnTrack={() => scrollToRef(onTrackY)}
              />

              {groups.needsAttention.length > 0 && (
                <View onLayout={(e: LayoutChangeEvent) => { needsAttentionY.current = e.nativeEvent.layout.y; }}>
                  {showHeaders && (
                    <Text style={styles.sectionHeading}>
                      {t('budgetsDesktop.needsAttentionHeading', { count: groups.needsAttention.length })}
                    </Text>
                  )}
                  <View style={styles.grid}>
                    {groups.needsAttention.map((c) => (
                      <BudgetCard
                        key={c.budget.id}
                        classified={c}
                        now={now}
                        anchorDay={anchorDay}
                        onPress={() => setSelectedBudgetId(c.budget.id)}
                      />
                    ))}
                  </View>
                </View>
              )}

              {groups.onTrack.length > 0 && (
                <View onLayout={(e: LayoutChangeEvent) => { onTrackY.current = e.nativeEvent.layout.y; }}>
                  {showHeaders && (
                    <Text style={styles.sectionHeading}>
                      {t('budgetsDesktop.onTrackHeading', { count: groups.onTrack.length })}
                    </Text>
                  )}
                  <View style={styles.grid}>
                    {groups.onTrack.map((c) => (
                      <BudgetCard
                        key={c.budget.id}
                        classified={c}
                        now={now}
                        anchorDay={anchorDay}
                        onPress={() => setSelectedBudgetId(c.budget.id)}
                      />
                    ))}
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {selectedBudget && <BudgetDialog budget={selectedBudget} onClose={() => setSelectedBudgetId(null)} />}
      {createOpen && <BudgetCreateDialog onClose={() => setCreateOpen(false)} />}
    </View>
  );
}

// ─── Summary strip ──────────────────────────────────────────────────────

interface SummaryStripProps {
  total: number;
  needsAttention: number;
  onTrack: number;
  categoriesOver: number;
  onPressNeedsAttention: () => void;
  onPressOnTrack: () => void;
}

/**
 * Four tiles (design's "Summary strip") — NOT a restatement of the grouped
 * cards beneath: a tile is a number reachable without scrolling, the
 * section below is the underlying cards, the same relationship the
 * reference screen's `SummaryStrip`/`TransactionTable` and Analytics'
 * summary strip/breakdown grid already have. Deliberately no blended
 * "total budgeted" tile — budgets of different periods can't be summed
 * without inventing a meaning for the result (design's "Deliberately no
 * blended-total tile").
 */
function BudgetsSummaryStrip({
  total,
  needsAttention,
  onTrack,
  categoriesOver,
  onPressNeedsAttention,
  onPressOnTrack,
}: SummaryStripProps) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.summaryStrip}>
      <SummaryTile label={t('budgetsDesktop.summaryTotal')}>
        <Text style={styles.summaryValue}>{total}</Text>
      </SummaryTile>

      <SummaryTile label={t('budgetsDesktop.needsAttention')} onPress={onPressNeedsAttention}>
        <Text style={styles.summaryValue}>{needsAttention}</Text>
      </SummaryTile>

      <SummaryTile label={t('budgets.onTrack')} onPress={onPressOnTrack}>
        <Text style={styles.summaryValue}>{onTrack}</Text>
      </SummaryTile>

      <SummaryTile label={t('budgetsDesktop.categoriesOverAllocation')}>
        <Text style={styles.summaryValue}>{categoriesOver}</Text>
      </SummaryTile>
    </View>
  );
}

/**
 * One tile. `onPress` present ⇒ clickable, hover-tinted (mirrors Analytics'
 * own `SummaryTile`) — Total Budgets and Categories Over Allocation have
 * nothing distinct to scroll to (design's "Summary strip"), so they render
 * as plain, non-interactive tiles.
 */
function SummaryTile({ label, onPress, children }: { label: string; onPress?: () => void; children: ReactNode }) {
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

// ─── Styles ──────────────────────────────────────────────────────────────

const createStyles = (theme: Theme) => ({
  root: {
    flex: 1,
    // Must paint its own ground — see `ExpensesDesktop`'s identical comment;
    // a transparent tree shows React Navigation's light default through it.
    backgroundColor: theme.colors.background,
  },
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  topBarLeft: {
    flex: 1,
  },
  addButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2.5],
    borderRadius: theme.borderRadius.lg,
  },
  addButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
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
  emptyOuter: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[8],
  },
  emptyCard: {
    width: '100%' as const,
    maxWidth: 480,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing[10],
    paddingHorizontal: theme.spacing[6],
    ...theme.shadows.sm,
  },
  emptyTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing[4],
    textAlign: 'center' as const,
  },
  emptySubtitle: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: theme.spacing[2],
  },
  emptyHint: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[6],
  },
  emptyButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing[6],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius['3xl'],
  },
  emptyButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
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
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[1],
  },
  summaryValue: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  sectionHeading: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3],
  },
  grid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[4],
  },
});
