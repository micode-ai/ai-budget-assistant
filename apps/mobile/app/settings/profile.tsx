import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  FlatList,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { api } from '@/services/api';
import type { Currency } from '@budget/shared-types';

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

export default function ProfileSettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { user, updateUser } = useAuthStore();

  const [name, setName] = useState(user?.name || '');
  const [editingName, setEditingName] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [timezonePicker, setTimezonePicker] = useState(false);
  const [timezoneSearch, setTimezoneSearch] = useState('');

  const filteredTimezones = useMemo(() => {
    if (!timezoneSearch.trim()) return TIMEZONES;
    const q = timezoneSearch.toLowerCase();
    return TIMEZONES.filter((tz) => tz.toLowerCase().includes(q));
  }, [timezoneSearch]);

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

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
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

        {/* Name, Email, Timezone */}
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

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>{t('settings.email')}</Text>
            <TouchableOpacity
              style={styles.fieldValueRow}
              onPress={() => router.push('/settings/change-email' as any)}
            >
              <Text style={styles.fieldValue}>{user?.email}</Text>
              <Ionicons name="pencil-outline" size={16} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

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

        {/* Subscription */}
        <View style={[styles.card, { marginTop: theme.spacing[6] }]}>
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
    marginTop: theme.spacing[4],
    marginBottom: theme.spacing[2],
  },
  fieldValue: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
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
});
