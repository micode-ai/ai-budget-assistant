import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useExpenseStore } from '@/stores/expenseStore';
import { ExpenseMapView } from '@/components/map/ExpenseMapView';
import { captureCurrentLocation, requestLocationPermission } from '@/services/locationCapture';
import { showAlert } from '@/utils/alert';

export default function ExpenseLocationScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { expenses, updateExpense } = useExpenseStore();

  // Same 4-way resolution as expense/[id].tsx (deep links may carry the server PK).
  const expense = expenses.find(
    (e) => e.id === id || e.serverId === id || e.clientId === id || e.localId === id,
  );

  const initial = expense?.location && !(expense.location.lat === 0 && expense.location.lng === 0)
    ? { lat: expense.location.lat, lng: expense.location.lng }
    : null;
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(initial);

  if (!expense) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.hint}>{t('expenseDetail.notFound')}</Text>
      </SafeAreaView>
    );
  }

  const handleMyLocation = async () => {
    const granted = await requestLocationPermission();
    if (!granted) {
      showAlert(t('location.sectionTitle'), t('location.permissionDenied'));
      return;
    }
    const loc = await captureCurrentLocation({ force: true });
    if (loc) setPin(loc);
  };

  const handleSave = () => {
    const unchanged = initial && pin && initial.lat === pin.lat && initial.lng === pin.lng;
    if (pin && !unchanged) {
      // No `name`: a manually placed pin invalidates the stale geocoded label
      // (server + local repo both clear locationName for a name-less object).
      updateExpense(expense.id, { location: { lat: pin.lat, lng: pin.lng } });
    }
    router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ExpenseMapView
        picker
        pickerPin={pin}
        onMapPress={(lat, lng) => setPin({ lat, lng })}
        center={pin ? { lat: pin.lat, lng: pin.lng, zoom: 15 } : { lat: 50, lng: 15, zoom: 4 }}
        style={styles.map}
      />
      <Text style={styles.hint}>{t('location.tapToPlace')}</Text>
      <View style={styles.footer}>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleMyLocation}>
          <Ionicons name="locate-outline" size={18} color={theme.colors.primary} />
          <Text style={styles.secondaryButtonText}>{t('location.myLocation')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, !pin && styles.primaryButtonDisabled]}
          onPress={handleSave}
          disabled={!pin}
        >
          <Text style={styles.primaryButtonText}>{t('common.save')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  map: { flex: 1 },
  hint: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[2],
  },
  footer: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    padding: theme.spacing[4],
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[1.5],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  secondaryButtonText: { ...theme.textStyles.body, color: theme.colors.primary, fontWeight: '600' as const },
  primaryButton: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { ...theme.textStyles.body, color: '#fff', fontWeight: '600' as const },
});
