import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  Linking,
  Modal,
  FlatList,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useWalletStore } from '@/stores/walletStore';
import { useBudgetStore } from '@/stores/budgetStore';
import { getLastSyncTime } from '@/db/syncMetadataRepository';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { api } from '@/services/api';
import { SUPPORTED_LANGUAGES, changeLanguage } from '@/i18n';
import { LEGAL_URLS } from '@/constants/legal';
import type { Currency } from '@budget/shared-types';
import Constants from 'expo-constants';

type IconName = keyof typeof Ionicons.glyphMap;

const CURRENCIES: Currency[] = ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN'];
const TIMEZONES: string[] = [
  'Africa/Abidjan', 'Africa/Accra', 'Africa/Algiers', 'Africa/Cairo', 'Africa/Casablanca',
  'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi', 'Africa/Tunis',
  'America/Anchorage', 'America/Argentina/Buenos_Aires', 'America/Bogota', 'America/Chicago',
  'America/Denver', 'America/Edmonton', 'America/Halifax', 'America/Havana',
  'America/Lima', 'America/Los_Angeles', 'America/Manaus', 'America/Mexico_City',
  'America/New_York', 'America/Phoenix', 'America/Santiago', 'America/Sao_Paulo',
  'America/St_Johns', 'America/Toronto', 'America/Vancouver', 'America/Winnipeg',
  'Asia/Almaty', 'Asia/Baghdad', 'Asia/Baku', 'Asia/Bangkok', 'Asia/Beirut',
  'Asia/Colombo', 'Asia/Dhaka', 'Asia/Dubai', 'Asia/Hong_Kong', 'Asia/Irkutsk',
  'Asia/Istanbul', 'Asia/Jakarta', 'Asia/Jerusalem', 'Asia/Kabul', 'Asia/Kamchatka',
  'Asia/Karachi', 'Asia/Kathmandu', 'Asia/Kolkata', 'Asia/Krasnoyarsk', 'Asia/Kuala_Lumpur',
  'Asia/Kuwait', 'Asia/Magadan', 'Asia/Manila', 'Asia/Novosibirsk', 'Asia/Omsk',
  'Asia/Riyadh', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Taipei',
  'Asia/Tashkent', 'Asia/Tbilisi', 'Asia/Tehran', 'Asia/Tokyo', 'Asia/Vladivostok',
  'Asia/Yakutsk', 'Asia/Yekaterinburg', 'Asia/Yerevan',
  'Atlantic/Azores', 'Atlantic/Cape_Verde', 'Atlantic/Reykjavik',
  'Australia/Adelaide', 'Australia/Brisbane', 'Australia/Darwin', 'Australia/Hobart',
  'Australia/Melbourne', 'Australia/Perth', 'Australia/Sydney',
  'Europe/Amsterdam', 'Europe/Athens', 'Europe/Belgrade', 'Europe/Berlin', 'Europe/Brussels',
  'Europe/Bucharest', 'Europe/Budapest', 'Europe/Copenhagen', 'Europe/Dublin', 'Europe/Helsinki',
  'Europe/Kyiv', 'Europe/Lisbon', 'Europe/London', 'Europe/Madrid', 'Europe/Milan',
  'Europe/Minsk', 'Europe/Moscow', 'Europe/Oslo', 'Europe/Paris', 'Europe/Prague',
  'Europe/Riga', 'Europe/Rome', 'Europe/Samara', 'Europe/Sofia', 'Europe/Stockholm',
  'Europe/Tallinn', 'Europe/Vienna', 'Europe/Vilnius', 'Europe/Warsaw', 'Europe/Zurich',
  'Indian/Maldives', 'Indian/Mauritius',
  'Pacific/Auckland', 'Pacific/Chatham', 'Pacific/Fiji', 'Pacific/Guadalcanal',
  'Pacific/Guam', 'Pacific/Honolulu', 'Pacific/Tongatapu',
  'UTC',
];

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { user, updateUser, logout } = useAuthStore();
  const { mode, setMode } = useThemeStore();

  const [name, setName] = useState(user?.name || '');
  const [editingName, setEditingName] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Timezone picker
  const [timezonePicker, setTimezonePicker] = useState(false);
  const [timezoneSearch, setTimezoneSearch] = useState('');

  // Notification preferences
  const [notifBudgetAlerts, setNotifBudgetAlerts] = useState(true);
  const [notifSharedActivity, setNotifSharedActivity] = useState(true);
  const [notifLoading, setNotifLoading] = useState(true);

  const appVersion = Constants.expoConfig?.version || '1.0.0';

  // Last sync time
  const [lastSyncTime, setLastSyncTimeState] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    getLastSyncTime().then(setLastSyncTimeState);
  }, []);

  const formatLastSyncTime = useCallback((timestamp: number | null): string => {
    if (!timestamp) return t('settings.neverSynced');
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t('settings.justNow');
    if (minutes < 60) return t('settings.minutesAgo', { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('settings.hoursAgo', { count: hours });
    return new Date(timestamp).toLocaleString();
  }, [t]);

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      await Promise.allSettled([
        useExpenseStore.getState().loadExpenses(),
        useIncomeStore.getState().loadIncomes(),
        useCategoryStore.getState().loadCategories(),
        useWalletStore.getState().loadWallet(),
        useBudgetStore.getState().loadBudgets(),
      ]);
      const time = await getLastSyncTime();
      setLastSyncTimeState(time);
      Alert.alert(t('common.success'), t('settings.syncComplete'));
    } catch {
      Alert.alert(t('common.error'), t('settings.syncFailed'));
    } finally {
      setIsSyncing(false);
    }
  };

  const loadNotificationPreferences = useCallback(async () => {
    try {
      const prefs = await api.getNotificationPreferences();
      setNotifBudgetAlerts(prefs.budgetAlerts);
      setNotifSharedActivity(prefs.sharedAccountActivity);
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

  const handleToggleAllNotifications = async (value: boolean) => {
    setNotifBudgetAlerts(value);
    setNotifSharedActivity(value);
    try {
      await api.updateNotificationPreferences({ budgetAlerts: value, sharedAccountActivity: value });
    } catch (e) {
      setNotifBudgetAlerts(!value);
      setNotifSharedActivity(!value);
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) {
      Alert.alert(t('common.error'), t('validation.nameMin2'));
      return;
    }
    setIsSaving(true);
    try {
      await api.updateProfile({ name: trimmed });
      updateUser({ name: trimmed });
      setEditingName(false);
      Alert.alert(t('common.success'), t('settings.profileUpdated'));
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCurrencyChange = async (currency: Currency) => {
    if (currency === user?.currencyCode) return;
    try {
      await api.updateProfile({ currencyCode: currency });
      updateUser({ currencyCode: currency });
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const filteredTimezones = useMemo(() => {
    if (!timezoneSearch.trim()) return TIMEZONES;
    const q = timezoneSearch.toLowerCase();
    return TIMEZONES.filter((tz) => tz.toLowerCase().includes(q));
  }, [timezoneSearch]);

  const handleTimezoneChange = async (timezone: string) => {
    if (timezone === user?.timezone) {
      setTimezonePicker(false);
      return;
    }
    try {
      await api.updateProfile({ timezone });
      updateUser({ timezone });
      setTimezonePicker(false);
      Alert.alert(t('common.success'), t('settings.timezoneUpdated'));
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleLanguageChange = async (langCode: string) => {
    if (langCode === i18n.language) return;
    await changeLanguage(langCode);
  };

  const handleLogout = () => {
    Alert.alert(
      t('settings.logout'),
      t('settings.logoutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.logout'),
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Profile Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.profile')}</Text>

          {/* Avatar */}
          <View style={styles.avatarRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(user?.name || 'U')[0].toUpperCase()}
              </Text>
            </View>
            <View style={styles.avatarInfo}>
              <Text style={styles.userName}>{user?.name}</Text>
              <Text style={styles.userEmail}>{user?.email}</Text>
            </View>
          </View>

          {/* Name */}
          <View style={styles.card}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{t('settings.name')}</Text>
              {editingName ? (
                <View style={styles.editRow}>
                  <TextInput
                    style={styles.editInput}
                    value={name}
                    onChangeText={setName}
                    placeholderTextColor={theme.colors.textTertiary}
                    autoFocus
                  />
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={handleSaveName}
                    disabled={isSaving}
                  >
                    <Ionicons name="checkmark" size={18} color={theme.colors.textInverse} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => { setEditingName(false); setName(user?.name || ''); }}
                  >
                    <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.fieldValueRow} onPress={() => setEditingName(true)}>
                  <Text style={styles.fieldValue}>{user?.name}</Text>
                  <Ionicons name="pencil-outline" size={16} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.divider} />

            {/* Email */}
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{t('settings.email')}</Text>
              <Text style={styles.fieldValue}>{user?.email}</Text>
            </View>

            <View style={styles.divider} />

            {/* Timezone */}
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{t('settings.timezone')}</Text>
              <TouchableOpacity style={styles.fieldValueRow} onPress={() => { setTimezoneSearch(''); setTimezonePicker(true); }}>
                <Text style={styles.fieldValue}>{user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}</Text>
                <Ionicons name="pencil-outline" size={16} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Currency */}
          <Text style={styles.fieldLabelOutside}>{t('settings.currency')}</Text>
          <View style={styles.chipRow}>
            {CURRENCIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.chip, user?.currencyCode === c && styles.chipActive]}
                onPress={() => handleCurrencyChange(c)}
              >
                <Text style={[styles.chipText, user?.currencyCode === c && styles.chipTextActive]}>
                  {c}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* App Settings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.appSettings')}</Text>

          {/* Language */}
          <Text style={styles.fieldLabelOutside}>{t('settings.language')}</Text>
          <View style={styles.chipRow}>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[styles.chip, i18n.language === lang.code && styles.chipActive]}
                onPress={() => handleLanguageChange(lang.code)}
              >
                <Text style={[styles.chipText, i18n.language === lang.code && styles.chipTextActive]}>
                  {lang.flag}
                </Text>
                <Text style={[styles.chipText, i18n.language === lang.code && styles.chipTextActive]}>
                  {lang.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Theme */}
          <Text style={styles.fieldLabelOutside}>{t('settings.appearance')}</Text>
          <View style={styles.themeRow}>
            {([
              { key: 'system' as const, icon: 'phone-portrait-outline' as IconName, label: t('settings.system') },
              { key: 'light' as const, icon: 'sunny-outline' as IconName, label: t('settings.light') },
              { key: 'dark' as const, icon: 'moon-outline' as IconName, label: t('settings.dark') },
            ]).map((item) => (
              <TouchableOpacity
                key={item.key}
                style={[styles.themeChip, mode === item.key && styles.themeChipActive]}
                onPress={() => setMode(item.key)}
              >
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={mode === item.key ? theme.colors.primary : theme.colors.textTertiary}
                />
                <Text style={[styles.themeChipText, mode === item.key && styles.themeChipTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('notifications.title')}</Text>
          <View style={styles.card}>
            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('notifications.pushNotifications')}</Text>
                <Text style={styles.fieldDesc}>{t('notifications.pushNotificationsDesc')}</Text>
              </View>
              <Switch
                value={notifBudgetAlerts || notifSharedActivity}
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
          </View>
        </View>

        {/* Subscription Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('subscription.title')}</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.fieldRow}
              onPress={() => router.push('/subscription' as any)}
            >
              <View style={styles.fieldValueRow}>
                <Ionicons name="diamond-outline" size={18} color={theme.colors.textSecondary} />
                <Text style={styles.fieldLabel}>{t('subscription.managePlan')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Admin Section */}
        {user?.isAdmin && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('admin.title')}</Text>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.fieldRow}
                onPress={() => router.push('/admin' as any)}
              >
                <View style={styles.fieldValueRow}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.warning} />
                  <Text style={styles.fieldLabel}>{t('admin.openPanel')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Wallet Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('wallet.title')}</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.fieldRow}
              onPress={() => router.push('/wallet/set-balance')}
            >
              <View style={styles.fieldValueRow}>
                <Ionicons name="wallet-outline" size={18} color={theme.colors.textSecondary} />
                <Text style={styles.fieldLabel}>{t('wallet.setInitialBalance')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.fieldRow}
              onPress={() => router.push('/wallet')}
            >
              <View style={styles.fieldValueRow}>
                <Ionicons name="cash-outline" size={18} color={theme.colors.textSecondary} />
                <Text style={styles.fieldLabel}>{t('wallet.balances')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Data & Sync Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.dataSync')}</Text>
          <View style={styles.card}>
            <View style={styles.fieldRow}>
              <View style={styles.fieldValueRow}>
                <Ionicons name="sync-outline" size={18} color={theme.colors.textSecondary} />
                <Text style={styles.fieldLabel}>{t('settings.lastSynced')}</Text>
              </View>
              <Text style={styles.fieldValue}>
                {formatLastSyncTime(lastSyncTime)}
              </Text>
            </View>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.fieldRow}
              onPress={handleSyncNow}
              disabled={isSyncing}
            >
              <View style={styles.fieldValueRow}>
                <Ionicons name="refresh-outline" size={18} color={theme.colors.textSecondary} />
                <Text style={styles.fieldLabel}>
                  {isSyncing ? t('settings.syncing') : t('settings.syncNow')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.about')}</Text>
          <View style={styles.card}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{t('settings.version')}</Text>
              <Text style={styles.fieldValue}>{appVersion}</Text>
            </View>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.fieldRow}
              onPress={() => router.push('/help' as any)}
            >
              <View style={styles.fieldValueRow}>
                <Ionicons name="help-circle-outline" size={18} color={theme.colors.textSecondary} />
                <Text style={styles.fieldLabel}>{t('help.title')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.fieldRow}
              onPress={() => Linking.openURL('mailto:support@aibudget.app')}
            >
              <Text style={styles.fieldLabel}>{t('settings.support')}</Text>
              <Ionicons name="mail-outline" size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.fieldRow}
              onPress={() => Linking.openURL(LEGAL_URLS.privacyPolicy)}
            >
              <View style={styles.fieldValueRow}>
                <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.textSecondary} />
                <Text style={styles.fieldLabel}>{t('legal.privacyPolicy')}</Text>
              </View>
              <Ionicons name="open-outline" size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.fieldRow}
              onPress={() => Linking.openURL(LEGAL_URLS.termsOfService)}
            >
              <View style={styles.fieldValueRow}>
                <Ionicons name="document-text-outline" size={18} color={theme.colors.textSecondary} />
                <Text style={styles.fieldLabel}>{t('legal.termsOfService')}</Text>
              </View>
              <Ionicons name="open-outline" size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Logout */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={theme.colors.danger} />
            <Text style={styles.logoutButtonText}>{t('settings.logout')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Timezone Picker Modal */}
      <Modal visible={timezonePicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('settings.timezone')}</Text>
              <TouchableOpacity onPress={() => setTimezonePicker(false)}>
                <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalSearch}
              placeholder={t('settings.timezoneSearch')}
              placeholderTextColor={theme.colors.textTertiary}
              value={timezoneSearch}
              onChangeText={setTimezoneSearch}
              autoFocus
            />
            <FlatList
              data={filteredTimezones}
              keyExtractor={(item) => item}
              keyboardShouldPersistTaps="handled"
              style={styles.modalList}
              renderItem={({ item }) => {
                const isSelected = item === (user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
                return (
                  <TouchableOpacity
                    style={[styles.modalItem, isSelected && styles.modalItemActive]}
                    onPress={() => handleTimezoneChange(item)}
                  >
                    <Text style={[styles.modalItemText, isSelected && styles.modalItemTextActive]}>
                      {item.replace(/_/g, ' ')}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark" size={18} color={theme.colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
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

  // Avatar
  avatarRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  avatarText: {
    ...theme.textStyles.h2,
    color: theme.colors.textInverse,
  },
  avatarInfo: {
    marginLeft: theme.spacing[4],
    flex: 1,
  },
  userName: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  userEmail: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[0.5],
  },

  // Card
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
  fieldLabelOutside: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  fieldValue: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  fieldDesc: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
  fieldValueRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginVertical: theme.spacing[3],
  },

  // Edit name
  editRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    flex: 1,
    marginLeft: theme.spacing[3],
  },
  editInput: {
    flex: 1,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[2],
    fontSize: 15,
    color: theme.colors.textPrimary,
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  cancelButton: {
    backgroundColor: theme.colors.surfaceSecondary,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },

  // Chips (currency, language)
  chipRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  chipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  chipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
  },
  chipTextActive: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },

  // Theme
  themeRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
  },
  themeChip: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[1],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[2.5],
    paddingHorizontal: theme.spacing[2],
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  themeChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  themeChipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
  },
  themeChipTextActive: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },

  // Timezone modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)' as const,
    justifyContent: 'flex-end' as const,
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    maxHeight: '70%' as const,
    paddingBottom: theme.spacing[6],
  },
  modalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  modalTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  modalSearch: {
    margin: theme.spacing[4],
    marginBottom: 0,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
    fontSize: 15,
    color: theme.colors.textPrimary,
  },
  modalList: {
    marginTop: theme.spacing[2],
  },
  modalItem: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  modalItemActive: {
    backgroundColor: theme.colors.primaryLight,
  },
  modalItemText: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  modalItemTextActive: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },

  // Logout
  logoutButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    borderWidth: 1,
    borderColor: theme.colors.danger,
    gap: theme.spacing[2],
  },
  logoutButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.danger,
  },
});
