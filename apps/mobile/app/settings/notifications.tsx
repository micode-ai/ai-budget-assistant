import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
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
  const [notifLoading, setNotifLoading] = useState(true);

  // Telegram
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramUsername, setTelegramUsername] = useState<string | null>(null);
  const [telegramLinkCode, setTelegramLinkCode] = useState<string | null>(null);
  const [telegramBotUsername, setTelegramBotUsername] = useState<string>('');
  const [telegramLoading, setTelegramLoading] = useState(false);

  const loadNotificationPreferences = useCallback(async () => {
    try {
      const prefs = await api.getNotificationPreferences();
      setNotifBudgetAlerts(prefs.budgetAlerts);
      setNotifSharedActivity(prefs.sharedAccountActivity);
      setNotifDebtReminders(prefs.debtReminders);
    } catch (e) {
      console.error('Failed to load notification preferences:', e);
    } finally {
      setNotifLoading(false);
    }
  }, []);

  const loadTelegramStatus = useCallback(async () => {
    try {
      const status = await api.getTelegramLinkStatus();
      setTelegramLinked(status.linked);
      setTelegramUsername(status.telegramUsername || null);
    } catch {
      // Ignore — telegram feature may not be available
    }
  }, []);

  useEffect(() => {
    loadNotificationPreferences();
    loadTelegramStatus();
  }, [loadNotificationPreferences, loadTelegramStatus]);

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

  const handleToggleAllNotifications = async (value: boolean) => {
    setNotifBudgetAlerts(value);
    setNotifSharedActivity(value);
    setNotifDebtReminders(value);
    try {
      await api.updateNotificationPreferences({ budgetAlerts: value, sharedAccountActivity: value, debtReminders: value });
    } catch (e) {
      setNotifBudgetAlerts(!value);
      setNotifSharedActivity(!value);
      setNotifDebtReminders(!value);
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleGenerateTelegramCode = async () => {
    setTelegramLoading(true);
    try {
      const result = await api.generateTelegramLinkCode();
      setTelegramLinkCode(result.code);
      setTelegramBotUsername(result.botUsername);
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleCopyTelegramCode = async () => {
    if (telegramLinkCode) {
      await Clipboard.setStringAsync(telegramLinkCode);
      Alert.alert(t('settings.telegram.codeCopied'));
    }
  };

  const handleUnlinkTelegram = async () => {
    Alert.alert(
      t('settings.telegram.disconnect'),
      t('settings.telegram.disconnectConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.telegram.disconnect'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.unlinkTelegram();
              setTelegramLinked(false);
              setTelegramUsername(null);
              setTelegramLinkCode(null);
            } catch (e) {
              Alert.alert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
            }
          },
        },
      ],
    );
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
                value={notifBudgetAlerts || notifSharedActivity || notifDebtReminders}
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
          </View>
        </View>

        {/* Telegram Bot */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.telegram.title')}</Text>
          <View style={styles.card}>
            {telegramLinked ? (
              <>
                <View style={styles.fieldRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>{t('settings.telegram.linked')}</Text>
                    {telegramUsername && (
                      <Text style={styles.fieldDesc}>@{telegramUsername}</Text>
                    )}
                  </View>
                  <Ionicons name="checkmark-circle" size={24} color={theme.colors.success} />
                </View>
                <View style={styles.divider} />
                <TouchableOpacity style={styles.fieldRow} onPress={handleUnlinkTelegram}>
                  <Text style={[styles.fieldLabel, { color: theme.colors.danger }]}>
                    {t('settings.telegram.disconnect')}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[styles.fieldDesc, { marginBottom: theme.spacing[3] }]}>
                  {t('settings.telegram.description')}
                </Text>
                {telegramLinkCode ? (
                  <>
                    <TouchableOpacity
                      style={[styles.fieldRow, { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, padding: theme.spacing[3] }]}
                      onPress={handleCopyTelegramCode}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.fieldLabel, { fontSize: 24, letterSpacing: 4, textAlign: 'center' }]}>
                          {telegramLinkCode}
                        </Text>
                        <Text style={[styles.fieldDesc, { textAlign: 'center', marginTop: theme.spacing[1] }]}>
                          {t('settings.telegram.tapToCopy')}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <Text style={[styles.fieldDesc, { marginTop: theme.spacing[3] }]}>
                      {t('settings.telegram.linkInstructions', { botUsername: telegramBotUsername || 'BudgetBot' })}
                    </Text>
                  </>
                ) : (
                  <TouchableOpacity
                    style={[styles.fieldRow, { justifyContent: 'center' }]}
                    onPress={handleGenerateTelegramCode}
                    disabled={telegramLoading}
                  >
                    {telegramLoading ? (
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                    ) : (
                      <>
                        <Ionicons name="paper-plane-outline" size={20} color={theme.colors.primary} style={{ marginRight: theme.spacing[2] }} />
                        <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>
                          {t('settings.telegram.connect')}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </>
            )}
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
