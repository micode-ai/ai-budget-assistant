import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles } from '@/theme';
import type { ChatActionResult } from '@budget/shared-types';
import { createSharedResultStyles } from './results/sharedResultStyles';
import { UndoResult } from './results/UndoResult';
import { DepositTotalResult } from './results/DepositTotalResult';
import { DiscountTotalResult } from './results/DiscountTotalResult';
import { ShieldResult } from './results/ShieldResult';
import { ShoppingAddResult } from './results/ShoppingAddResult';
import { ShoppingRemoveResult } from './results/ShoppingRemoveResult';
import { ShoppingSuggestionsResult } from './results/ShoppingSuggestionsResult';
import { ExpensesResult } from './results/ExpensesResult';
import { BudgetStatusResult } from './results/BudgetStatusResult';
import { CategoryBreakdownResult } from './results/CategoryBreakdownResult';
import { AffordabilityResult } from './results/AffordabilityResult';
import { CreateSuccessResult } from './results/CreateSuccessResult';

interface ActionResultCardProps {
  actionResult: ChatActionResult;
  /** Additive, default `false` (design's §5a rule 1). Threaded into the
   *  sub-components below that render `listItemAmount`/`totalValue` — see
   *  those styles' own comments for what it changes. */
  desktop?: boolean;
}

export function ActionResultCard({ actionResult, desktop = false }: ActionResultCardProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createSharedResultStyles);

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

  // Render based on action type. Each case's card lives in its own file
  // under `./results/` (mirrors `HomeWidgetSwitch.tsx`'s widget split) — a
  // new AI function's result card gets its own file there plus a new case
  // here, not another inline component in this file.
  switch (actionResult.actionType) {
    case 'get_expenses':
      return <ExpensesResult data={data} desktop={desktop} />;
    case 'get_budget_status':
      return <BudgetStatusResult data={data} desktop={desktop} />;
    case 'get_category_breakdown':
      return <CategoryBreakdownResult data={data} desktop={desktop} />;
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
      return <ShoppingSuggestionsResult data={data} desktop={desktop} />;
    case 'get_inflation_shield':
      return <ShieldResult data={data} desktop={desktop} />;
    case 'get_deposit_total':
      return <DepositTotalResult data={data} desktop={desktop} />;
    case 'get_discount_total':
      return <DiscountTotalResult data={data} desktop={desktop} />;
    case 'undo_last_action':
      return <UndoResult data={data} />;
    default:
      return null;
  }
}
