import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useExpenseStore } from '@/stores/expenseStore';
import { ExpenseMapView } from '@/components/map/ExpenseMapView';
import type { Expense } from '@budget/shared-types';

interface Props {
  expense: Expense;
  canEdit: boolean;
}

export function LocationSection({ expense, canEdit }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const updateExpense = useExpenseStore((s) => s.updateExpense);

  const loc = expense.location;
  const hasLocation = !!loc && !(loc.lat === 0 && loc.lng === 0);

  if (!hasLocation && !canEdit) return null;

  const openPicker = () =>
    router.push({ pathname: '/expense/location', params: { id: expense.id } });

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('location.title')}</Text>
        {canEdit && hasLocation && (
          <TouchableOpacity onPress={() => updateExpense(expense.id, { location: null })}>
            <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
          </TouchableOpacity>
        )}
      </View>

      {hasLocation ? (
        <>
          <TouchableOpacity activeOpacity={canEdit ? 0.7 : 1} onPress={canEdit ? openPicker : undefined}>
            <ExpenseMapView
              points={[{ id: expense.id, lat: loc!.lat, lng: loc!.lng, title: expense.merchant || expense.description || '', amountLabel: '' }]}
              interactive={false}
              style={styles.miniMap}
            />
          </TouchableOpacity>
          <View style={styles.nameRow}>
            <Ionicons name="location-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.nameText} numberOfLines={2}>
              {loc!.name || `${loc!.lat.toFixed(5)}, ${loc!.lng.toFixed(5)}`}
            </Text>
          </View>
          {canEdit && (
            <TouchableOpacity style={styles.actionRow} onPress={openPicker}>
              <Text style={styles.actionText}>{t('location.editLocation')}</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <TouchableOpacity style={styles.actionRow} onPress={openPicker}>
          <Ionicons name="location-outline" size={16} color={theme.colors.primary} />
          <Text style={styles.actionText}>{t('location.addLocation')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  headerRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  title: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },
  miniMap: { height: 160, borderRadius: theme.borderRadius.lg },
  nameRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    marginTop: theme.spacing[2],
  },
  nameText: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, flex: 1 },
  actionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    marginTop: theme.spacing[2],
  },
  actionText: { ...theme.textStyles.bodySm, color: theme.colors.primary, fontWeight: '600' as const },
});
