import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { InvestmentCard, renderHomeWidget } from '@/components/home/HomeWidgetSwitch';
import type { HomeWidgetContext } from '@/components/home/HomeWidgetContext';
import type { WidgetKey } from '@/stores/widgetVisibilityStore';

/** The four keys `FocusColumn` owns — excluded from the rail regardless of
 *  where the user has dragged them in `widgetOrder`. */
const FOCUS_COLUMN_KEYS = new Set<WidgetKey>(['safeToSpend', 'netProfit', 'incomeExpenses', 'monthlyBudget']);

interface DashboardRailProps {
  ctx: HomeWidgetContext;
  widgetOrder: WidgetKey[];
}

/**
 * Desktop web's fixed-width standing rail (`docs/design/2026-09-05-
 * dashboard-web.md`'s "The rail"): the fixed quick-action list (below),
 * then `InvestmentCard` (investment accounts only — its pre-existing
 * "always first, outside `widgetOrder`" special case, unchanged), then
 * every remaining `WIDGET_KEYS` entry — everything except the four now
 * living in `FocusColumn` — in the user's own stored order, filtered.
 * Nothing else about that order changes.
 *
 * Reads the same whatever is in it: nearly empty just ends (no minimum
 * height, no filler content — the user's own choice to turn most widgets
 * off, same as a short sidebar); much longer than the focus column just
 * keeps going, because both columns live inside the SAME single `ScrollView`
 * (`DashboardDesktop`) — the shorter column simply ends and the page's one
 * scrollbar keeps moving.
 */
export function DashboardRail({ ctx, widgetOrder }: DashboardRailProps) {
  const { canEdit, currentAccountType, investmentSummary } = ctx;

  // De-dupe exactly like `DashboardMobile` — a duplicate key in the stored
  // order would render the same widget twice (doubled card + broken modal).
  const railKeys = [...new Set(widgetOrder)].filter((key) => !FOCUS_COLUMN_KEYS.has(key));

  const investmentEl =
    currentAccountType === 'investment' && investmentSummary ? <InvestmentCard key="investment" ctx={ctx} /> : null;

  // `{ desktop: true }` only changes `financialHealth`'s own breakdown panel
  // (a centred dialog instead of a bottom sheet) — every other case ignores
  // the option and renders exactly as it does for `DashboardMobile`.
  const railWidgets = railKeys.map((key) => renderHomeWidget(key, ctx, { desktop: true }));

  return (
    <View>
      {canEdit && <RailQuickActions />}
      {investmentEl}
      {railWidgets}
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
