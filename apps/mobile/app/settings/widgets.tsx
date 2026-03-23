import React from 'react';
import { View, Text, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useWidgetVisibilityStore } from '@/stores/widgetVisibilityStore';
import { useTheme, useStyles, type Theme } from '@/theme';

export default function WidgetsSettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { visibility: widgetVisibility, setVisible: setWidgetVisible } = useWidgetVisibilityStore();

  const widgets = [
    { key: 'gamification', label: t('settings.widget.gamification') },
    { key: 'monthlyBudget', label: t('settings.widget.monthlyBudget') },
    { key: 'incomeExpenses', label: t('settings.widget.incomeExpenses') },
    { key: 'debts', label: t('settings.widget.debts') },
    { key: 'netProfit', label: t('settings.widget.netProfit') },
    { key: 'netCapital', label: t('settings.widget.netCapital') },
    { key: 'fatFinder', label: t('settings.widget.fatFinder') },
    { key: 'calendar', label: t('settings.widget.calendar') },
    { key: 'goals', label: t('settings.widget.goals') },
    { key: 'wallets', label: t('settings.widget.wallets') },
  ] as const;

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          {widgets.map(({ key, label }, index) => (
            <View key={key}>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>{label}</Text>
                <Switch
                  value={widgetVisibility[key]}
                  onValueChange={(v) => setWidgetVisible(key, v)}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                />
              </View>
              {index < widgets.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>
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
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
  },
  fieldRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    minHeight: 32,
  },
  fieldLabel: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginVertical: theme.spacing[3],
  },
});
