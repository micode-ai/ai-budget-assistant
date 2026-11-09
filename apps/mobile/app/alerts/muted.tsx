import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles, type Theme } from '@/theme';
import { api } from '@/services/api';
import { useAccountStore } from '@/stores/accountStore';
import { showAlert } from '@/utils/alert';
import type { AnomalySuppression } from '@budget/shared-types';

export default function MutedAlertsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const canEdit = useAccountStore((s) => s.canEdit());
  const [items, setItems] = useState<AnomalySuppression[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setItems(await api.listAlertSuppressions());
    } catch (e) {
      console.warn('Failed to load muted alerts:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (id: string) => {
    try {
      await api.removeAlertSuppression(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      console.warn('Failed to remove suppression:', e);
      showAlert(t('errors.error'), t('alerts.markNormalFailed'));
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="volume-mute-outline" size={56} color={theme.colors.textTertiary} />
          <Text style={styles.emptyText}>{t('alerts.mutedEmpty')}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={<Text style={styles.hint}>{t('alerts.mutedHint')}</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.label}>{item.label}</Text>
              {canEdit && (
                <TouchableOpacity onPress={() => remove(item.id)} hitSlop={8}>
                  <Text style={styles.remove}>{t('alerts.mutedRemove')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[6],
    gap: theme.spacing[3],
  },
  // Capped and centred so rows don't stretch across a desktop window; a no-op on a phone.
  list: { padding: theme.spacing[4], width: '100%' as const, maxWidth: 760, alignSelf: 'center' as const },
  hint: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, marginBottom: theme.spacing[3] },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  label: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, flex: 1 },
  remove: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
  emptyText: { ...theme.textStyles.body, color: theme.colors.textTertiary, textAlign: 'center' as const },
});
