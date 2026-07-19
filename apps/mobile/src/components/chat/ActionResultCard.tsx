import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { ChatActionResult } from '@budget/shared-types';

interface ActionResultCardProps {
  actionResult: ChatActionResult;
}

export function ActionResultCard({ actionResult }: ActionResultCardProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  if (!actionResult.success) {
    return (
      <View style={[styles.card, styles.errorCard]}>
        <View style={styles.header}>
          <Ionicons name="close-circle" size={18} color={theme.colors.danger} />
          <Text style={[styles.headerText, { color: theme.colors.danger }]}>
            {t('chat.resultFailed')}
          </Text>
        </View>
        {actionResult.errorMessage && (
          <Text style={styles.errorText}>{actionResult.errorMessage}</Text>
        )}
      </View>
    );
  }

  const data = actionResult.data || {};

  // Render based on action type
  switch (actionResult.actionType) {
    case 'get_expenses':
      return <ExpensesResult data={data} />;
    case 'get_budget_status':
      return <BudgetStatusResult data={data} />;
    case 'get_category_breakdown':
      return <CategoryBreakdownResult data={data} />;
    case 'create_expense':
    case 'create_income':
    case 'create_budget':
    case 'create_category':
      return <CreateSuccessResult actionType={actionResult.actionType} data={data} />;
    case 'check_affordability':
      return <AffordabilityResult data={data} />;
    case 'add_to_shopping_list':
      return <ShoppingAddResult data={data} />;
    case 'remove_from_shopping_list':
      return <ShoppingRemoveResult data={data} />;
    case 'get_shopping_suggestions':
      return <ShoppingSuggestionsResult data={data} />;
    case 'get_inflation_shield':
      return <ShieldResult data={data} />;
    default:
      return null;
  }
}

function ShieldResult({ data }: { data: Record<string, unknown> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const items = (data.items as any[]) || [];
  const savedSoFar = Number(data.savedSoFar ?? 0);
  const baseCurrency = String(data.baseCurrency ?? '');

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.headerText}>
          {t('chat.actionInflationShield')}
          {savedSoFar > 0 ? ` · ${savedSoFar.toFixed(2)} ${baseCurrency}` : ''}
        </Text>
      </View>
      {items.slice(0, 5).map((it: any, idx: number) => (
        <View key={idx} style={styles.listItem}>
          <Text style={styles.listItemText} numberOfLines={1}>
            {it.canonicalName}{it.store ? ` · ${it.store}` : ''}
          </Text>
          <Text style={styles.listItemAmount}>
            +{Number(it.monthlyChangePct ?? 0).toFixed(0)}% · {Number(it.projectedSaving ?? 0).toFixed(2)} {baseCurrency}
          </Text>
        </View>
      ))}
      {items.length > 5 && <Text style={styles.moreText}>+{items.length - 5} more</Text>}
    </View>
  );
}

function ShoppingAddResult({ data }: { data: Record<string, unknown> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const items = (data.items as string[]) || [];
  const listName = String(data.listName ?? '');

  return (
    <View style={[styles.card, styles.successCard]}>
      <View style={styles.header}>
        <Ionicons name="cart" size={18} color={theme.colors.success} />
        <Text style={[styles.headerText, { color: theme.colors.success }]}>
          {t('chat.actionAddShoppingList')}
          {listName ? ` · ${listName}` : ''}
        </Text>
      </View>
      {items.map((label, idx) => (
        <View key={idx} style={styles.listItem}>
          <Text style={styles.listItemText} numberOfLines={1}>
            {label}
          </Text>
          <Ionicons name="add-circle-outline" size={16} color={theme.colors.primary} />
        </View>
      ))}
    </View>
  );
}

function ShoppingRemoveResult({ data }: { data: Record<string, unknown> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const removedLabels = (data.removedLabels as string[]) || [];
  const notFoundLabels = (data.notFoundLabels as string[]) || [];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="remove-circle-outline" size={18} color={theme.colors.danger} />
        <Text style={styles.headerText}>{t('chat.actionRemoveShoppingList')}</Text>
      </View>
      {removedLabels.map((label, idx) => (
        <View key={idx} style={styles.listItem}>
          <Text style={styles.listItemText} numberOfLines={1}>
            {label}
          </Text>
          <Ionicons name="remove-circle-outline" size={16} color={theme.colors.danger} />
        </View>
      ))}
      {notFoundLabels.length > 0 && (
        <Text style={styles.moreText}>
          {t('chat.actionShoppingNotFound', { names: notFoundLabels.join(', ') })}
        </Text>
      )}
    </View>
  );
}

function ShoppingSuggestionsResult({ data }: { data: Record<string, unknown> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const restock = ((data.restock as any[]) || []).slice(0, 5);
  const deals = ((data.deals as any[]) || []).slice(0, 5);
  const restockTotal = (data.restock as any[])?.length || 0;
  const dealsTotal = (data.deals as any[])?.length || 0;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="basket-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.headerText}>{t('chat.actionShoppingSuggestions')}</Text>
      </View>
      {restock.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>{t('chat.shoppingSuggestionsRestock')}</Text>
          {restock.map((r: any, idx: number) => (
            <View key={idx} style={styles.listItem}>
              <Text style={styles.listItemText} numberOfLines={1}>
                {r.canonicalName}
              </Text>
              <Text style={styles.listItemAmount}>{r.dueInDays}d</Text>
            </View>
          ))}
          {restockTotal > 5 && <Text style={styles.moreText}>+{restockTotal - 5} more</Text>}
        </>
      )}
      {deals.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>{t('chat.shoppingSuggestionsDeals')}</Text>
          {deals.map((d: any, idx: number) => (
            <View key={idx} style={styles.listItem}>
              <Text style={styles.listItemText} numberOfLines={1}>
                {d.canonicalName}{d.merchant ? ` · ${d.merchant}` : ''}
              </Text>
              <Text style={styles.listItemAmount}>
                -{Number(d.dropPct ?? 0).toFixed(0)}% · {Number(d.price ?? 0).toFixed(2)} {d.currency}
              </Text>
            </View>
          ))}
          {dealsTotal > 5 && <Text style={styles.moreText}>+{dealsTotal - 5} more</Text>}
        </>
      )}
    </View>
  );
}

function ExpensesResult({ data }: { data: Record<string, unknown> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  // When a keyword filter was applied, `matchedExpenses` contains only the
  // semantically matched items. Fall back to `recentExpenses` for general queries.
  const expenses = (data.matchedExpenses as any[]) || (data.recentExpenses as any[]) || (data.expenses as any[]) || [];
  const count = Number(data.count ?? expenses.length);
  const totalsByCurrency = (data.totalsByCurrency as Record<string, number>) || {};
  const totalEntries = Object.entries(totalsByCurrency);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="receipt-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.headerText}>
          {t('chat.actionGetExpenses')} ({count})
        </Text>
      </View>
      {expenses.slice(0, 5).map((exp: any, idx: number) => (
        <View key={idx} style={styles.listItem}>
          <Text style={styles.listItemText} numberOfLines={1}>
            {exp.description || exp.category || '—'}
          </Text>
          <Text style={styles.listItemAmount}>
            {Number(exp.amount).toFixed(2)} {exp.currencyCode}
          </Text>
        </View>
      ))}
      {expenses.length > 5 && (
        <Text style={styles.moreText}>+{expenses.length - 5} more</Text>
      )}
      {totalEntries.length > 0 && (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t('common.total') || 'Total'}:</Text>
          <Text style={styles.totalValue}>
            {totalEntries
              .map(([cur, amt]) => `${Number(amt).toFixed(2)} ${cur}`)
              .join(' · ')}
          </Text>
        </View>
      )}
    </View>
  );
}

function BudgetStatusResult({ data }: { data: Record<string, unknown> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const budgets = (data.budgets as any[]) || [];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="pie-chart-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.headerText}>{t('chat.actionGetBudgetStatus')}</Text>
      </View>
      {budgets.map((b: any, idx: number) => {
        const pct = Math.min(Number(b.percentageUsed || 0), 100);
        const isOver = b.isOverBudget;
        return (
          <View key={idx} style={styles.budgetItem}>
            <View style={styles.budgetHeader}>
              <Text style={styles.listItemText}>{b.name}</Text>
              <Text style={[styles.listItemAmount, isOver && { color: theme.colors.danger }]}>
                {Number(b.spent || 0).toFixed(0)} / {Number(b.amount).toFixed(0)} {b.currencyCode}
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(pct, 100)}%` as any,
                    backgroundColor: isOver ? theme.colors.danger : theme.colors.primary,
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {pct.toFixed(0)}% {t('chat.spent')}
              {b.daysRemaining != null ? ` · ${b.daysRemaining}d ${t('chat.remaining')}` : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function CategoryBreakdownResult({ data }: { data: Record<string, unknown> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const categories = (data.categories as any[]) || [];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="stats-chart-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.headerText}>{t('chat.actionGetCategoryBreakdown')}</Text>
      </View>
      {categories.slice(0, 8).map((cat: any, idx: number) => (
        <View key={idx} style={styles.listItem}>
          <Text style={styles.listItemText} numberOfLines={1}>
            {cat.categoryName || '—'}
          </Text>
          <Text style={styles.listItemAmount}>
            {Number(cat.amount || 0).toFixed(2)} ({Number(cat.percentage || 0).toFixed(0)}%)
          </Text>
        </View>
      ))}
    </View>
  );
}

function AffordabilityResult({ data }: { data: Record<string, unknown> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const affordable = Boolean(data.affordable);
  const reasonCode = String(data.reasonCode ?? '');
  const amount = Number(data.amount ?? 0);
  const currencyCode = String(data.currencyCode ?? '');
  const safeToSpendToday = Number(data.safeToSpendToday ?? 0);
  const baseCurrency = String(data.baseCurrency ?? currencyCode);
  const goalImpact = data.goalImpact as { goalName: string; slipDays: number } | undefined;
  const suggestedDate = data.suggestedDate as string | undefined;

  const reasonLabel = (() => {
    switch (reasonCode) {
      case 'within_safe':
        return t('affordability.yes');
      case 'within_available_tight':
        return t('affordability.tight');
      case 'delays_goal':
        return t('affordability.delaysGoal');
      case 'wait_until_income':
        return suggestedDate
          ? t('affordability.waitUntil', { date: suggestedDate })
          : t('affordability.no');
      case 'over_available':
      default:
        return t('affordability.no');
    }
  })();

  const chipColor = affordable ? theme.colors.success : theme.colors.danger;
  const chipIcon = affordable ? 'checkmark-circle' : 'close-circle';

  return (
    <View style={[styles.card, affordable ? styles.successCard : styles.errorCard]}>
      {/* Verdict chip */}
      <View style={styles.affordabilityChip}>
        <Ionicons name={chipIcon} size={20} color={chipColor} />
        <Text style={[styles.affordabilityVerdict, { color: chipColor }]}>
          {affordable ? t('affordability.yes') : t('affordability.no')}
        </Text>
      </View>

      {/* Reason line */}
      <Text style={styles.affordabilityReason}>{reasonLabel}</Text>

      {/* Amount vs safe-to-spend */}
      <View style={styles.affordabilityRow}>
        <Text style={styles.affordabilityLabel}>
          {amount.toFixed(2)} {currencyCode}
        </Text>
        <Text style={styles.affordabilityMeta}>
          {'/ '}{t('safeToSpend.today')}{': '}{safeToSpendToday.toFixed(2)} {baseCurrency}
        </Text>
      </View>

      {/* Goal impact — when purchase delays a goal */}
      {goalImpact && (
        <Text style={styles.affordabilityGoalImpact}>
          {t('affordability.delaysGoal')}{': '}{goalImpact.goalName}
          {' ('}+{goalImpact.slipDays}d{')'}
        </Text>
      )}
    </View>
  );
}

function CreateSuccessResult({ actionType, data }: { actionType: string; data: Record<string, unknown> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const labels: Record<string, string> = {
    create_expense: t('chat.actionCreateExpense'),
    create_income: t('chat.actionCreateIncome'),
    create_budget: t('chat.actionCreateBudget'),
    create_category: t('chat.actionCreateCategory'),
  };

  return (
    <View style={[styles.card, styles.successCard]}>
      <View style={styles.header}>
        <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
        <Text style={[styles.headerText, { color: theme.colors.success }]}>
          {t('chat.resultSuccess')}
        </Text>
      </View>
      <Text style={styles.successDetail}>
        {labels[actionType] || actionType}
        {data.amount ? `: ${Number(data.amount).toFixed(2)} ${data.currencyCode || ''}` : ''}
        {actionType === 'create_category' && data.name ? `: ${data.name} (${data.type})` : ''}
      </Text>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    marginTop: theme.spacing[3],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  errorCard: {
    borderColor: theme.colors.dangerLight,
  },
  successCard: {
    borderColor: theme.colors.primaryLight,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    marginBottom: theme.spacing[2],
  },
  headerText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  errorText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  listItem: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[1],
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  listItemText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    flex: 1,
    marginRight: theme.spacing[2],
  },
  listItemAmount: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  moreText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    paddingTop: theme.spacing[1],
  },
  sectionLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[1],
    marginBottom: theme.spacing[1],
  },
  totalRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingTop: theme.spacing[2],
    marginTop: theme.spacing[1],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  totalLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  totalValue: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontWeight: '600' as const,
  },
  budgetItem: {
    marginBottom: theme.spacing[3],
  },
  budgetHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginBottom: theme.spacing[1],
  },
  progressBar: {
    height: 6,
    backgroundColor: theme.colors.border,
    borderRadius: 3,
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%' as const,
    borderRadius: 3,
  },
  progressText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  successDetail: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  affordabilityChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    marginBottom: theme.spacing[1.5],
  },
  affordabilityVerdict: {
    ...theme.textStyles.bodyMedium,
    fontWeight: '700' as const,
    fontSize: 16,
  },
  affordabilityReason: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  affordabilityRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: theme.spacing[1.5],
    flexWrap: 'wrap' as const,
  },
  affordabilityLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  affordabilityMeta: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  affordabilityGoalImpact: {
    ...theme.textStyles.bodySm,
    color: theme.colors.warning,
    marginTop: theme.spacing[1.5],
  },
});
