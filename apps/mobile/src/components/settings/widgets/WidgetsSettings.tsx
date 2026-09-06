import React, { useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
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
import { SettingsScreenScroll } from '../SettingsScreenScroll';

/**
 * The widgets screen's body: reorder and show/hide the home quick actions and
 * the dashboard widgets.
 *
 * Lifted out of `app/settings/widgets.tsx` unchanged so the desktop settings shell
 * can host it - `src/` may not import from `app/`, so a route file is not
 * somewhere a pane can render from. The route is now a thin wrapper around
 * `SettingsRoute`, which is the one file that decides mobile vs desktop.
 *
 * Two differences from the original body, both mechanical and both required by
 * that hosting: the outer `SafeAreaView` is gone (`SettingsScreenFrame` supplies
 * it on the full-page path, with the same `edges={[]}` and the same
 * background), and the root `ScrollView` is `SettingsScreenScroll` - the same
 * `ScrollView` full-page, a plain `View` in a pane, because the shell owns the
 * page scroll and a nested scroller would be the second scrollbar the language
 * forbids.
 *
 * **The drag inside a pane.** `scrollEnabled` is passed through untouched and
 * still reaches a real `ScrollView` full-page. In a pane `SettingsScreenScroll`
 * is a plain `View`, so the flag lands nowhere and the shell's own `ScrollView`
 * stays enabled for the length of a drag - deliberate, and not something this
 * screen may fix on its own: the scroller it would have to lock belongs to the
 * shell, and reaching for it would be a new mechanism rather than a move.
 *
 * What is safe to say without a browser is that the reorder arithmetic cannot
 * care about the pane. `ReorderableToggleList` drags on `gs.dy` against a fixed
 * `ITEM_HEIGHT`, with no `measure()`, no `onLayout` and no page coordinate
 * anywhere in it, so a narrower, horizontally offset parent changes none of its
 * inputs. What a bounded parent does change is the row width, which the list
 * already handles: the label is `flex: 1` between a fixed handle and a `Switch`.
 */
export function WidgetsSettings() {
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
    shopping_hub: t('dashboard.shoppingList'),
  };

  const widgetLabels: Record<WidgetKey, string> = {
    safeToSpend: t('safeToSpend.widgetLabel'),
    familyFeed: t('familyFeed.title'),
    inflationShield: t('inflationShield.title'),
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
    <SettingsScreenScroll
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
    </SettingsScreenScroll>
  );
}

const createStyles = (theme: Theme) => ({
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
