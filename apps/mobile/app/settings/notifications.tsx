import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { api } from '@/services/api';

export default function NotificationsSettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  // Notification preferences
  const [notifBudgetAlerts, setNotifBudgetAlerts] = useState(true);
  const [notifSharedActivity, setNotifSharedActivity] = useState(true);
  const [notifDebtReminders, setNotifDebtReminders] = useState(true);
  const [notifRecurringExpenses, setNotifRecurringExpenses] = useState(true);
  const [notifLoading, setNotifLoading] = useState(true);

  const loadNotificationPreferences = useCallback(async () => {
    try {
      const prefs = await api.getNotificationPreferences();
      setNotifBudgetAlerts(prefs.budgetAlerts);
      setNotifSharedActivity(prefs.sharedAccountActivity);
      setNotifDebtReminders(prefs.debtReminders);
      setNotifRecurringExpenses(prefs.recurringExpenses ?? true);
    } catch (e) {
      console.error('Failed to load notification preferences:', e);
    } finally {
      setNotifLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotificationPreferences();
  }, [loadNotificationPreferences]);

  const handleToggleBudgetAlerts = async (value: boolean) => {
    setNotifBudgetAlerts(value);
    try {
      await api.updateNotificationPreferences({ budgetAlerts: value });
    } catch (e) {
      setNotifBudgetAlerts(!value);
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleToggleSharedActivity = async (value: boolean) => {
    setNotifSharedActivity(value);
    try {
      await api.updateNotificationPreferences({ sharedAccountActivity: value });
    } catch (e) {
      setNotifSharedActivity(!value);
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleToggleDebtReminders = async (value: boolean) => {
    setNotifDebtReminders(value);
    try {
      await api.updateNotificationPreferences({ debtReminders: value });
    } catch (e) {
      setNotifDebtReminders(!value);
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleToggleRecurringExpenses = async (value: boolean) => {
    setNotifRecurringExpenses(value);
    try {
      await api.updateNotificationPreferences({ recurringExpenses: value });
    } catch (e) {
      setNotifRecurringExpenses(!value);
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleToggleAllNotifications = async (value: boolean) => {
    setNotifBudgetAlerts(value);
    setNotifSharedActivity(value);
    setNotifDebtReminders(value);
    setNotifRecurringExpenses(value);
    try {
      await api.updateNotificationPreferences({ budgetAlerts: value, sharedAccountActivity: value, debtReminders: value, recurringExpenses: value });
    } catch (e) {
      setNotifBudgetAlerts(!value);
      setNotifSharedActivity(!value);
      setNotifDebtReminders(!value);
      setNotifRecurringExpenses(!value);
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('notifications.title')}</Text>
          <View style={styles.card}>
            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('notifications.pushNotifications')}</Text>
                <Text style={styles.fieldDesc}>{t('notifications.pushNotificationsDesc')}</Text>
              </View>
              <Switch
                value={notifBudgetAlerts || notifSharedActivity || notifDebtReminders || notifRecurringExpenses}
                onValueChange={handleToggleAllNotifications}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                disabled={notifLoading}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('notifications.budgetAlerts')}</Text>
                <Text style={styles.fieldDesc}>{t('notifications.budgetAlertsDesc')}</Text>
              </View>
              <Switch
                value={notifBudgetAlerts}
                onValueChange={handleToggleBudgetAlerts}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                disabled={notifLoading}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('notifications.sharedAccountActivity')}</Text>
                <Text style={styles.fieldDesc}>{t('notifications.sharedAccountActivityDesc')}</Text>
              </View>
              <Switch
                value={notifSharedActivity}
                onValueChange={handleToggleSharedActivity}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                disabled={notifLoading}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('notifications.debtReminders')}</Text>
                <Text style={styles.fieldDesc}>{t('notifications.debtRemindersDesc')}</Text>
              </View>
              <Switch
                value={notifDebtReminders}
                onValueChange={handleToggleDebtReminders}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                disabled={notifLoading}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('notifications.recurringExpenses')}</Text>
                <Text style={styles.fieldDesc}>{t('notifications.recurringExpensesDesc')}</Text>
              </View>
              <Switch
                value={notifRecurringExpenses}
                onValueChange={handleToggleRecurringExpenses}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                disabled={notifLoading}
              />
            </View>
          </View>
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
  section: {
    marginBottom: theme.spacing[6],
  },
  sectionTitle: {
    ...theme.textStyles.label,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[3],
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
  fieldDesc: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginVertical: theme.spacing[3],
  },
});
