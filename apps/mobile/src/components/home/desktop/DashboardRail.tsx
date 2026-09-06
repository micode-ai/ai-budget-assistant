import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { InvestmentCard, renderHomeWidget } from '@/components/home/HomeWidgetSwitch';
import { SetupChecklist } from '@/components/home/SetupChecklist';
import type { HomeWidgetContext } from '@/components/home/HomeWidgetContext';
import type { SetupStep } from '@/features/onboarding/resolveSetupSteps';
import type { FirstRunView } from '@/features/onboarding/webFirstRunView';
import type { WidgetKey } from '@/stores/widgetVisibilityStore';

/** Fixed rail COLUMN width (`docs/design/2026-09-05-dashboard-web.md`'s
 *  wireframe: "~300px, fixed") — each physical column is this wide,
 *  whether one or two columns are shown (round 6's second rail). Moved
 *  here from `DashboardDesktop.tsx` because this component now owns
 *  deciding how many physical columns to render, not just their contents. */
const RAIL_WIDTH = 300;

/** The five keys `FocusColumn` owns — excluded from the rail regardless of
 *  where the user has dragged them in `widgetOrder`. Round 6 added
 *  `wallets`, moved into the focus column as a fifth fixed slot (see
 *  `FocusColumn`'s own doc comment) — it is no longer ever a rail card,
 *  in either the one-rail or two-rail regime. */
const FOCUS_COLUMN_KEYS = new Set<WidgetKey>([
  'safeToSpend',
  'netProfit',
  'incomeExpenses',
  'monthlyBudget',
  'wallets',
]);

interface DashboardRailProps {
  ctx: HomeWidgetContext;
  widgetOrder: WidgetKey[];
  /** True at >= `SECOND_RAIL_MIN_WIDTH` (round 6, `webLayout.constants.ts`)
   *  — splits the widgetOrder-driven list across two 300px columns instead
   *  of one. Owns its own root element's width either way, so
   *  `DashboardDesktop` no longer wraps this component in a sizing `View`. */
  secondRailVisible: boolean;
  /** Which dashboard state to draw — see `FocusColumn`'s matching prop. */
  firstRunView: FirstRunView;
  /** All three, from `resolveSetupSteps`, ticks included. */
  setupSteps: SetupStep[];
  /**
   * Whether to render the checklist in the ORDINARY rail. Decided by
   * `DashboardDesktop` (outstanding steps, not dismissed, and built on an
   * answered pull) rather than here, so this component holds no opinion
   * about what "done" means. The FIRST-RUN rail renders it regardless — in
   * that state every step is outstanding by definition.
   */
  showChecklist: boolean;
  /** Persists the dismissal. Only ever wired in the ordinary rail. */
  onDismissChecklist: () => void;
}

/**
 * Desktop web's fixed-width standing rail (`docs/design/2026-09-05-
 * dashboard-web.md`'s "The rail"; round 6 added a second physical column):
 * the fixed quick-action list (below), then `InvestmentCard` (investment
 * accounts only — its pre-existing "always first, outside `widgetOrder`"
 * special case, unchanged), then every remaining `WIDGET_KEYS` entry —
 * everything except the five now living in `FocusColumn` — in the user's
 * own stored order, filtered. Nothing else about that order changes.
 *
 * **Below `SECOND_RAIL_MIN_WIDTH`**: one 300px column, exactly as before
 * round 6 — quick actions, then `InvestmentCard`, then every rail widget in
 * order, single-file.
 *
 * **At/above `SECOND_RAIL_MIN_WIDTH`**: two 300px columns. Quick actions and
 * `InvestmentCard` stay fixed at the top of the LEFT column only — quick
 * actions is an action, not information, and per the product owner it must
 * not be pushed below the fold by whatever the user has stacked into
 * `widgetOrder`; `InvestmentCard` was already "always first" before round 6
 * and this keeps it that way. The `widgetOrder`-driven list is then split
 * ROW-MAJOR, alternating left/right (item 0 left, item 1 right, item 2
 * left, ...) over only the widgets that actually render something (a
 * currently-hidden widget consumes no column slot) — never column-major
 * (fill the whole left column, then the right). Column-major would bury the
 * user's own items 1-5 in one rail and 6-10 in the other, and their own
 * priority order — the entire point of a user-orderable list — would stop
 * being readable across the two columns.
 *
 * Reads the same whatever is in it: nearly empty just ends (no minimum
 * height, no filler content — the user's own choice to turn most widgets
 * off, same as a short sidebar); much longer than the focus column just
 * keeps going, because both columns live inside the SAME single `ScrollView`
 * (`DashboardDesktop`) — the shorter column simply ends and the page's one
 * scrollbar keeps moving. With two rail columns this can now be true of
 * either rail column independently — neither is padded to match the other.
 */
export function DashboardRail({
  ctx,
  widgetOrder,
  secondRailVisible,
  firstRunView,
  setupSteps,
  showChecklist,
  onDismissChecklist,
}: DashboardRailProps) {
  const { canEdit, currentAccountType, investmentSummary } = ctx;
  const styles = useStyles(createStyles);

  // Loading: the rail is empty, but its column(s) are still rendered, so the
  // focus column beside them is exactly as wide as it will be a moment later
  // and the spinner does not jump sideways when the answer arrives.
  if (firstRunView === 'wait') {
    return secondRailVisible ? (
      <View style={styles.twoRailWrapper}>
        <View style={styles.rail} />
        <View style={styles.rail} />
      </View>
    ) : (
      <View style={styles.rail} />
    );
  }

  // First run: one card, and the fixed quick-action list is HIDDEN. A
  // "+ Expense" button beside a 2x2 grid whose third card is "Type it
  // manually" is the same action offered twice, two hundred pixels apart.
  // No dismiss control either — this state ends on its own the moment a
  // transaction lands, so there is nothing to dismiss.
  if (firstRunView === 'first-run') {
    return secondRailVisible ? (
      <View style={styles.twoRailWrapper}>
        <View style={styles.rail}>
          <SetupChecklist steps={setupSteps} />
        </View>
        {/* Empty on purpose (the spec's own wireframe): there are no widgets
            to put here yet, and keeping the column preserves the focus
            column's width across the transition out of this state. */}
        <View style={styles.rail} />
      </View>
    ) : (
      <View style={styles.rail}>
        <SetupChecklist steps={setupSteps} />
      </View>
    );
  }

  // De-dupe exactly like `DashboardMobile` — a duplicate key in the stored
  // order would render the same widget twice (doubled card + broken modal).
  const railKeys = [...new Set(widgetOrder)].filter((key) => !FOCUS_COLUMN_KEYS.has(key));

  const investmentEl =
    currentAccountType === 'investment' && investmentSummary ? <InvestmentCard key="investment" ctx={ctx} /> : null;

  // `{ desktop: true }` only changes `financialHealth`'s own breakdown panel
  // (a centred dialog instead of a bottom sheet) — every other case ignores
  // the option and renders exactly as it does for `DashboardMobile`. Filter
  // out the `null`s (hidden widgets) BEFORE any two-column split below — a
  // hidden widget must not consume a left/right slot, or a mix of
  // hidden/visible widgets could lopside the split (e.g. every visible one
  // landing in the same column) and defeat the reason for splitting at all.
  const railWidgets = railKeys
    .map((key) => renderHomeWidget(key, ctx, { desktop: true }))
    .filter((el): el is NonNullable<typeof el> => el !== null);

  const fixedTop = (
    <>
      {/* The checklist outlives the first-run state: once that ends it sits at
          the TOP of the ordinary rail — above the quick actions — and stays
          while any step is outstanding, then disappears on its own. It takes
          no `WidgetKey` and no slot, exactly as `InvestmentCard` already
          does. This is what covers the user who adds one expense and never
          sets a wallet balance: their Safe to Spend reads 0,00 for ever and
          nothing else on the screen says why. */}
      {showChecklist && <SetupChecklist steps={setupSteps} onDismiss={onDismissChecklist} />}
      {canEdit && <RailQuickActions />}
      {investmentEl}
    </>
  );

  if (!secondRailVisible) {
    return (
      <View style={styles.rail}>
        {fixedTop}
        {railWidgets}
      </View>
    );
  }

  // Row-major alternate: even index -> left column, odd index -> right
  // column (see the doc comment above for why never column-major).
  const leftWidgets = railWidgets.filter((_, i) => i % 2 === 0);
  const rightWidgets = railWidgets.filter((_, i) => i % 2 === 1);

  return (
    <View style={styles.twoRailWrapper}>
      <View style={styles.rail}>
        {fixedTop}
        {leftWidgets}
      </View>
      <View style={styles.rail}>{rightWidgets}</View>
    </View>
  );
}

/**
 * The rail's own fixed, first item (design's "What the quick-action strip
 * becomes") — NOT sourced from `quickActionStore` at all: a small vertical
 * list, "+ Expense" as the one primary (filled) action, then Income / Scan
 * Receipt / Voice as three smaller secondary rows. Deliberately fixed and
 * not user-configurable — the product owner named these four specific
 * actions as part of the layout's own shape, not as a rendering of whatever
 * quick actions happen to be enabled on mobile (see the design's
 * Departures). Hidden for a viewer, same as the mobile strip — none of
 * these four actions is something a viewer can do.
 */
function RailQuickActions() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.quickCard}>
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => router.push('/expense/new')}
        activeOpacity={0.8}
        accessibilityRole="button"
      >
        <Ionicons name="add" size={18} color={theme.colors.textInverse} />
        <Text style={styles.primaryButtonText}>{t('dashboard.addExpense')}</Text>
      </TouchableOpacity>
      <View style={styles.secondaryRow}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push('/income/new')}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Ionicons name="cash-outline" size={16} color={theme.colors.textSecondary} />
          <Text style={styles.secondaryButtonText} numberOfLines={2}>
            {t('incomes.addIncome')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push('/expense/receipt')}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Ionicons name="camera-outline" size={16} color={theme.colors.textSecondary} />
          <Text style={styles.secondaryButtonText} numberOfLines={2}>
            {t('dashboard.scanReceipt')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push('/expense/voice')}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Ionicons name="mic-outline" size={16} color={theme.colors.textSecondary} />
          <Text style={styles.secondaryButtonText} numberOfLines={2}>
            {t('dashboard.voiceInput')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  // One physical rail column — `RAIL_WIDTH` fixed, never shrinks (the
  // focus column's own `flex:1, minWidth:0` is what absorbs any slack).
  // Used for both the single-rail case and each column of the two-rail
  // case (round 6).
  rail: {
    width: RAIL_WIDTH,
    flexShrink: 0,
  },
  // Round 6: holds the two 300px rail columns side by side, with the same
  // gap (`theme.spacing[5]` = 20) `DashboardDesktop`'s own layout row uses
  // between the focus column and the rail — verified against a real
  // deployed build's measured layout (`SECOND_RAIL_MIN_WIDTH`'s own comment
  // in `webLayout.constants.ts`).
  twoRailWrapper: {
    flexDirection: 'row' as const,
    gap: theme.spacing[5],
  },
  quickCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
    gap: theme.spacing[3],
  },
  primaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[3],
  },
  primaryButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
  },
  secondaryRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
  },
  secondaryButton: {
    flex: 1,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  secondaryButtonText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
});
