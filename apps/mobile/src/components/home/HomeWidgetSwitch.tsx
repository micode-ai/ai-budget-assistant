import type { WidgetKey } from '@/stores/widgetVisibilityStore';
import { NetProfitWidget, NetCapitalWidget, CalendarWidget, FinancialHealthWidget, FamilyFeedWidget, InflationShieldWidget } from '@/components/widgets';
import { FatFinderCard } from '@/components/insights/FatFinderCard';
import { GoalsCard } from '@/components/goals/GoalsCard';
import { InvestmentCard } from './widgets/InvestmentCard';
import { GamificationCard } from './widgets/GamificationCard';
import { MonthlyBudgetCard } from './widgets/MonthlyBudgetCard';
import { IncomeExpensesCard } from './widgets/IncomeExpensesCard';
import { DebtsCard } from './widgets/DebtsCard';
import { WalletsSection } from './widgets/WalletsSection';

import type { HomeWidgetContext } from './HomeWidgetContext';
export type { HomeWidgetContext } from './HomeWidgetContext';

// `InvestmentCard` is rendered directly by `DashboardMobile` and, on desktop,
// by `DashboardRail` (both above/outside the ordered widget list, outside the
// WidgetKey system) — re-exported here so it keeps one entry point alongside
// `renderHomeWidget`.
export { InvestmentCard };

interface RenderHomeWidgetOptions {
  /**
   * Desktop web only (`docs/design/2026-09-05-dashboard-web.md`'s "The two
   * sheets that must stop being sheets") — threads through to
   * `FinancialHealthWidget`'s own `desktop?` prop so its breakdown panel
   * opens as a centred dialog instead of a bottom sheet when this switch is
   * called from `DashboardRail`. Undefined by default, so `DashboardMobile`'s
   * own call site (which passes no options) is unaffected — the widget keeps
   * its mobile bottom-sheet chrome there.
   */
  desktop?: boolean;
}

/**
 * Renders the dashboard card/widget for a given WidgetKey, or null when the
 * widget is hidden / has no data to show. Mirrors the switch previously
 * inline in `DashboardMobile` — same cases, same ordering, same guard
 * conditions. Called by both `DashboardMobile` and, for the widgets not
 * living in the focus column, desktop web's `DashboardRail`.
 *
 * Each case's actual card component lives in its own file under `./widgets/`
 * (ABA — HomeWidgetSwitch regrowth fix) — add a new widget there, not here.
 */
export function renderHomeWidget(key: WidgetKey, ctx: HomeWidgetContext, opts?: RenderHomeWidgetOptions) {
  const { widgetVisibility, monthlyBudgetSummary, widgetRefreshKey, currentAccountType, safeToSpendData, hasSafeToSpend } = ctx;

  switch (key) {
    case 'safeToSpend':
      // Shown as the home hero number (tap → breakdown sheet) on mobile, and
      // folded into the desktop focus column's hero (`FocusColumn`) — never a
      // separate rail card on either platform.
      return null;

    case 'familyFeed':
      return widgetVisibility.familyFeed && currentAccountType !== 'personal'
        ? <FamilyFeedWidget key="familyFeed" />
        : null;

    case 'inflationShield':
      return widgetVisibility.inflationShield ? <InflationShieldWidget key="inflationShield" /> : null;

    case 'financialHealth':
      return widgetVisibility.financialHealth
        ? <FinancialHealthWidget key="financialHealth" desktop={opts?.desktop} />
        : null;

    case 'gamification':
      return widgetVisibility.gamification ? <GamificationCard key="gamification" ctx={ctx} /> : null;

    case 'monthlyBudget':
      return widgetVisibility.monthlyBudget && monthlyBudgetSummary.budgetCount > 0 ? (
        <MonthlyBudgetCard key="monthlyBudget" ctx={ctx} />
      ) : null;

    case 'incomeExpenses':
      return widgetVisibility.incomeExpenses ? <IncomeExpensesCard key="incomeExpenses" ctx={ctx} /> : null;

    case 'debts':
      return widgetVisibility.debts ? <DebtsCard key="debts" ctx={ctx} /> : null;

    case 'netProfit':
      return widgetVisibility.netProfit ? <NetProfitWidget key="netProfit" refreshKey={widgetRefreshKey} /> : null;

    case 'netCapital':
      return widgetVisibility.netCapital ? <NetCapitalWidget key="netCapital" /> : null;

    case 'fatFinder':
      return widgetVisibility.fatFinder ? <FatFinderCard key="fatFinder" /> : null;

    case 'calendar':
      return widgetVisibility.calendar ? <CalendarWidget key="calendar" refreshKey={widgetRefreshKey} /> : null;

    case 'goals':
      return widgetVisibility.goals ? <GoalsCard key="goals" /> : null;

    case 'wallets':
      return widgetVisibility.wallets ? <WalletsSection key="wallets" ctx={ctx} /> : null;

    default:
      return null;
  }
}
