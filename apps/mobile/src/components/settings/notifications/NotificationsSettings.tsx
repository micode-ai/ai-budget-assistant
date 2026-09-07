import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Switch,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { api } from '@/services/api';
import { SettingsScreenScroll } from '../SettingsScreenScroll';

/**
 * The notification settings body: twelve per-user push preferences, plus a
 * master row that reads as on when any one of them is, and writes all twelve.
 *
 * Lifted out of `app/settings/notifications.tsx` unchanged so the desktop
 * settings shell can host it - `src/` may not import from `app/`, so a route
 * file is not somewhere a pane can render from. The route is now a thin wrapper
 * around `SettingsRoute`, which is the one file that decides mobile vs desktop.
 *
 * Two differences from the original body, both mechanical and both required by
 * that hosting: the outer `SafeAreaView` is gone (`SettingsScreenFrame` supplies
 * it on the full-page path, with the same `edges={[]}` and the same
 * background), and the root `ScrollView` is `SettingsScreenScroll` - the same
 * `ScrollView` full-page, a plain `View` in a pane, because the shell owns the
 * page scroll and a nested scroller would be the second scrollbar the language
 * forbids. Its `ScrollView` carried only `style` and `contentContainerStyle`,
 * so unlike the widgets screen there is no prop here that a pane makes inert.
 *
 * **This screen loads once, on mount, and that is safe - the preferences are
 * per-user, not per-account.** The distinction matters because a pane keeps its
 * component mounted while the account switcher in `WebTopBar` stays reachable
 * above it, so a screen that snapshots account-scoped data on mount would go on
 * showing the previous account's. This one cannot: `api.getNotificationPreferences`
 * sends no account parameter, the handler behind it reads `req.user.id` from the
 * JWT and never `req.accountId` (its controller carries `JwtAuthGuard` alone -
 * the `AccountContextGuard` on that file is on the three bot link-code routes),
 * and the service reads twelve `User.notify*` columns. This component also
 * subscribes to no store at all. So the pane is deliberately NOT keyed on
 * `currentAccountId`: keying it would discard state and re-fetch on every
 * account switch to arrive at the identical answer.
 */
export function NotificationsSettings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  // Notification preferences
  const [notifBudgetAlerts, setNotifBudgetAlerts] = useState(true);
  const [notifSharedActivity, setNotifSharedActivity] = useState(true);
  const [notifDebtReminders, setNotifDebtReminders] = useState(true);
  const [notifRecurringExpenses, setNotifRecurringExpenses] = useState(true);
  const [notifSubscriptionRenewals, setNotifSubscriptionRenewals] = useState(true);
  const [notifAnomalyAlerts, setNotifAnomalyAlerts] = useState(true);
  const [notifTrackingGap, setNotifTrackingGap] = useState(true);
  const [notifPurchaseRequests, setNotifPurchaseRequests] = useState(true);
  const [notifTripSettleUp, setNotifTripSettleUp] = useState(true);
  const [notifShoppingReminders, setNotifShoppingReminders] = useState(true);
  const [notifShoppingDeals, setNotifShoppingDeals] = useState(true);
  const [notifInflationShield, setNotifInflationShield] = useState(true);
  const [notifLoading, setNotifLoading] = useState(true);

  const loadNotificationPreferences = useCallback(async () => {
    try {
      const prefs = await api.getNotificationPreferences();
      setNotifBudgetAlerts(prefs.budgetAlerts);
      setNotifSharedActivity(prefs.sharedAccountActivity);
      setNotifDebtReminders(prefs.debtReminders);
      setNotifRecurringExpenses(prefs.recurringExpenses ?? true);
      setNotifSubscriptionRenewals(prefs.subscriptionRenewals ?? true);
      setNotifAnomalyAlerts(prefs.anomalyAlerts ?? true);
      setNotifTrackingGap(prefs.trackingGap ?? true);
      setNotifPurchaseRequests(prefs.purchaseRequests ?? true);
      setNotifTripSettleUp(prefs.tripSettleUp ?? true);
      setNotifShoppingReminders(prefs.shoppingReminders ?? true);
      setNotifShoppingDeals(prefs.shoppingDeals ?? true);
      setNotifInflationShield(prefs.inflationShield ?? true);
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
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleToggleSharedActivity = async (value: boolean) => {
    setNotifSharedActivity(value);
    try {
      await api.updateNotificationPreferences({ sharedAccountActivity: value });
    } catch (e) {
      setNotifSharedActivity(!value);
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleToggleDebtReminders = async (value: boolean) => {
    setNotifDebtReminders(value);
    try {
      await api.updateNotificationPreferences({ debtReminders: value });
    } catch (e) {
      setNotifDebtReminders(!value);
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleToggleRecurringExpenses = async (value: boolean) => {
    setNotifRecurringExpenses(value);
    try {
      await api.updateNotificationPreferences({ recurringExpenses: value });
    } catch (e) {
      setNotifRecurringExpenses(!value);
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleToggleSubscriptionRenewals = async (value: boolean) => {
    setNotifSubscriptionRenewals(value);
    try {
      await api.updateNotificationPreferences({ subscriptionRenewals: value });
    } catch (e) {
      setNotifSubscriptionRenewals(!value);
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleToggleAnomalyAlerts = async (value: boolean) => {
    setNotifAnomalyAlerts(value);
    try {
      await api.updateNotificationPreferences({ anomalyAlerts: value });
    } catch (e) {
      setNotifAnomalyAlerts(!value);
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleToggleTrackingGap = async (value: boolean) => {
    setNotifTrackingGap(value);
    try {
      await api.updateNotificationPreferences({ trackingGap: value });
    } catch (e) {
      setNotifTrackingGap(!value);
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleTogglePurchaseRequests = async (value: boolean) => {
    setNotifPurchaseRequests(value);
    try {
      await api.updateNotificationPreferences({ purchaseRequests: value });
    } catch (e) {
      setNotifPurchaseRequests(!value);
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleToggleTripSettleUp = async (value: boolean) => {
    setNotifTripSettleUp(value);
    try {
      await api.updateNotificationPreferences({ tripSettleUp: value });
    } catch (e) {
      setNotifTripSettleUp(!value);
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleToggleShoppingReminders = async (value: boolean) => {
    setNotifShoppingReminders(value);
    try {
      await api.updateNotificationPreferences({ shoppingReminders: value });
    } catch (e) {
      setNotifShoppingReminders(!value);
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleToggleShoppingDeals = async (value: boolean) => {
    setNotifShoppingDeals(value);
    try {
      await api.updateNotificationPreferences({ shoppingDeals: value });
    } catch (e) {
      setNotifShoppingDeals(!value);
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleToggleInflationShield = async (value: boolean) => {
    setNotifInflationShield(value);
    try {
      await api.updateNotificationPreferences({ inflationShield: value });
    } catch (e) {
      setNotifInflationShield(!value);
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleToggleAllNotifications = async (value: boolean) => {
    setNotifBudgetAlerts(value);
    setNotifSharedActivity(value);
    setNotifDebtReminders(value);
    setNotifRecurringExpenses(value);
    setNotifSubscriptionRenewals(value);
    setNotifAnomalyAlerts(value);
    setNotifTrackingGap(value);
    setNotifPurchaseRequests(value);
    setNotifTripSettleUp(value);
    setNotifShoppingReminders(value);
    setNotifShoppingDeals(value);
    setNotifInflationShield(value);
    try {
      await api.updateNotificationPreferences({ budgetAlerts: value, sharedAccountActivity: value, debtReminders: value, recurringExpenses: value, subscriptionRenewals: value, anomalyAlerts: value, trackingGap: value, purchaseRequests: value, tripSettleUp: value, shoppingReminders: value, shoppingDeals: value, inflationShield: value });
    } catch (e) {
      setNotifBudgetAlerts(!value);
      setNotifSharedActivity(!value);
      setNotifDebtReminders(!value);
      setNotifRecurringExpenses(!value);
      setNotifSubscriptionRenewals(!value);
      setNotifAnomalyAlerts(!value);
      setNotifTrackingGap(!value);
      setNotifPurchaseRequests(!value);
      setNotifTripSettleUp(!value);
      setNotifShoppingReminders(!value);
      setNotifShoppingDeals(!value);
      setNotifInflationShield(!value);
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  return (
    <SettingsScreenScroll style={styles.scrollView} contentContainerStyle={styles.content}>
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
              value={notifBudgetAlerts || notifSharedActivity || notifDebtReminders || notifRecurringExpenses || notifSubscriptionRenewals || notifAnomalyAlerts || notifTrackingGap || notifPurchaseRequests || notifTripSettleUp || notifShoppingReminders || notifShoppingDeals || notifInflationShield}
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

          <View style={styles.divider} />

          <View style={styles.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('notifications.subscriptionRenewals')}</Text>
              <Text style={styles.fieldDesc}>{t('notifications.subscriptionRenewalsDesc')}</Text>
            </View>
            <Switch
              value={notifSubscriptionRenewals}
              onValueChange={handleToggleSubscriptionRenewals}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              disabled={notifLoading}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('notifications.anomalyAlerts')}</Text>
              <Text style={styles.fieldDesc}>{t('notifications.anomalyAlertsDesc')}</Text>
            </View>
            <Switch
              value={notifAnomalyAlerts}
              onValueChange={handleToggleAnomalyAlerts}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              disabled={notifLoading}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('notifications.trackingReminder')}</Text>
              <Text style={styles.fieldDesc}>{t('notifications.trackingReminderDesc')}</Text>
            </View>
            <Switch
              value={notifTrackingGap}
              onValueChange={handleToggleTrackingGap}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              disabled={notifLoading}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('purchaseRequests.notifPurchaseRequests')}</Text>
              <Text style={styles.fieldDesc}>{t('purchaseRequests.notifPurchaseRequestsDesc')}</Text>
            </View>
            <Switch
              value={notifPurchaseRequests}
              onValueChange={handleTogglePurchaseRequests}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              disabled={notifLoading}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('trip.notifyTripSettleUp')}</Text>
              <Text style={styles.fieldDesc}>{t('trip.notifyTripSettleUpDesc')}</Text>
            </View>
            <Switch
              value={notifTripSettleUp}
              onValueChange={handleToggleTripSettleUp}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              disabled={notifLoading}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('notifications.shoppingReminder')}</Text>
              <Text style={styles.fieldDesc}>{t('notifications.shoppingReminderDesc')}</Text>
            </View>
            <Switch
              value={notifShoppingReminders}
              onValueChange={handleToggleShoppingReminders}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              disabled={notifLoading}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('notifications.shoppingDeals')}</Text>
              <Text style={styles.fieldDesc}>{t('notifications.shoppingDealsDesc')}</Text>
            </View>
            <Switch
              value={notifShoppingDeals}
              onValueChange={handleToggleShoppingDeals}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              disabled={notifLoading}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('notifications.inflationShield')}</Text>
              <Text style={styles.fieldDesc}>{t('notifications.inflationShieldDesc')}</Text>
            </View>
            <Switch
              value={notifInflationShield}
              onValueChange={handleToggleInflationShield}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              disabled={notifLoading}
            />
          </View>
        </View>
      </View>

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
