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

// `InvestmentCard` is rendered directly by DashboardScreen (above the ordered
// widget list, outside the WidgetKey system) — re-exported here so it keeps
// one entry point alongside `renderHomeWidget`.
export { InvestmentCard };

/**
 * Renders the dashboard card/widget for a given WidgetKey, or null when the
 * widget is hidden / has no data to show. Mirrors the switch previously
 * inline in DashboardScreen — same cases, same ordering, same guard conditions.
 *
 * Each case's actual card component lives in its own file under `./widgets/`
 * (ABA — HomeWidgetSwitch regrowth fix) — add a new widget there, not here.
 */
export function renderHomeWidget(key: WidgetKey, ctx: HomeWidgetContext) {
  const { widgetVisibility, monthlyBudgetSummary, widgetRefreshKey, currentAccountType, safeToSpendData, hasSafeToSpend } = ctx;

  switch (key) {
    case 'safeToSpend':
      // Shown as the home hero number (tap → breakdown sheet). No duplicate
      // dashboard card — the hero is the single in-app surface for this value.
      return null;

    case 'familyFeed':
      return widgetVisibility.familyFeed && currentAccountType !== 'personal'
        ? <FamilyFeedWidget key="familyFeed" />
        : null;

    case 'inflationShield':
      return widgetVisibility.inflationShield ? <InflationShieldWidget key="inflationShield" /> : null;

    case 'financialHealth':
      return widgetVisibility.financialHealth ? <FinancialHealthWidget key="financialHealth" /> : null;

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
