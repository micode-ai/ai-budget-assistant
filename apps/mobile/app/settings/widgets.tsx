import React, { useState } from 'react';
import { Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  useWidgetVisibilityStore,
  WIDGET_KEYS,
  type WidgetKey,
} from '@/stores/widgetVisibilityStore';
import {
  useQuickActionStore,
  QUICK_ACTION_KEYS,
  type QuickActionKey,
} from '@/stores/quickActionStore';
import { ReorderableToggleList } from '@/components/ReorderableToggleList';
import { useStyles, useTheme, type Theme } from '@/theme';

export default function WidgetsSettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const widgets = useWidgetVisibilityStore();
  const quickActions = useQuickActionStore();

  const [quickDragging, setQuickDragging] = useState(false);
  const [widgetDragging, setWidgetDragging] = useState(false);

  const quickActionLabels: Record<QuickActionKey, string> = {
    add_expense: t('dashboard.addExpense'),
    scan_receipt: t('dashboard.scanReceipt'),
    voice_expense: t('dashboard.voiceInput'),
    voice_income: t('dashboard.voiceIncome'),
    scan_invoice: t('dashboard.scanInvoice'),
    exchange: t('dashboard.exchangeCurrency'),
    converter: t('dashboard.currencyConverter'),
    transfers: t('dashboard.transfers'),
    subscriptions: t('subscriptionManager.title'),
  };

  const widgetLabels: Record<WidgetKey, string> = {
    safeToSpend: t('safeToSpend.widgetLabel'),
    financialHealth: t('settings.widget.financialHealth'),
    gamification: t('settings.widget.gamification'),
    monthlyBudget: t('settings.widget.monthlyBudget'),
    incomeExpenses: t('settings.widget.incomeExpenses'),
    debts: t('settings.widget.debts'),
    netProfit: t('settings.widget.netProfit'),
    netCapital: t('settings.widget.netCapital'),
    fatFinder: t('settings.widget.fatFinder'),
    calendar: t('settings.widget.calendar'),
    goals: t('settings.widget.goals'),
    wallets: t('settings.widget.wallets'),
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        scrollEnabled={!quickDragging && !widgetDragging}
      >
        <Text style={styles.hint}>{t('settings.widgetsReorderHint')}</Text>

        <Text style={styles.sectionTitle}>{t('settings.quickActionsTitle')}</Text>
        <ReorderableToggleList
          keys={QUICK_ACTION_KEYS}
          order={quickActions.order}
          visibility={quickActions.visibility}
          labels={quickActionLabels}
          onReorder={quickActions.reorder}
          onToggle={quickActions.setVisible}
          onDraggingChange={setQuickDragging}
        />
        <TouchableOpacity
          style={styles.resetButton}
          onPress={quickActions.resetOrder}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh-outline" size={16} color={theme.colors.textTertiary} />
          <Text style={styles.resetButtonText}>{t('settings.widgetsResetOrder')}</Text>
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>
          {t('settings.widgetsTitle')}
        </Text>
        <ReorderableToggleList
          keys={WIDGET_KEYS}
          order={widgets.order}
          visibility={widgets.visibility}
          labels={widgetLabels}
          onReorder={widgets.reorder}
          onToggle={widgets.setVisible}
          onDraggingChange={setWidgetDragging}
        />
        <TouchableOpacity
          style={styles.resetButton}
          onPress={widgets.resetOrder}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh-outline" size={16} color={theme.colors.textTertiary} />
          <Text style={styles.resetButtonText}>{t('settings.widgetsResetOrder')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
  },
  hint: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[3],
    textAlign: 'center' as const,
  },
  sectionTitle: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[2],
    textTransform: 'uppercase' as const,
  },
  sectionTitleSpaced: {
    marginTop: theme.spacing[6],
  },
  resetButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    marginTop: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  resetButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
  },
});
