import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useExpenseStore } from '@/stores/expenseStore';
import { ExpenseMapView } from '@/components/map/ExpenseMapView';
import { captureCurrentLocation, requestLocationPermission } from '@/services/locationCapture';
import { api } from '@/services/api';
import { showAlert } from '@/utils/alert';

type SearchResult = { lat: number; lng: number; name: string };

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
  const initialName = expense?.location?.name ?? null;

  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(initial);
  // Set only when the pin came from a search result (a hand-placed pin has no name).
  const [pinName, setPinName] = useState<string | null>(initialName);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Debounced forward-geocoding of the typed query.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.geocodeSearch(q);
        setResults(res.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  if (!expense) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.hint}>{t('expenseDetail.notFound')}</Text>
      </SafeAreaView>
    );
  }

  const selectResult = (r: SearchResult) => {
    setPin({ lat: r.lat, lng: r.lng });
    setPinName(r.name || null);
    setResults([]);
    setQuery('');
  };

  const handleMyLocation = async () => {
    const granted = await requestLocationPermission();
    if (!granted) {
      showAlert(t('location.sectionTitle'), t('location.permissionDenied'));
      return;
    }
    const loc = await captureCurrentLocation({ force: true });
    if (loc) {
      setPin(loc);
      setPinName(null); // hand-picked position has no address label
    }
  };

  const handleSave = () => {
    const coordsUnchanged = initial && pin && initial.lat === pin.lat && initial.lng === pin.lng;
    const nameChanged = (pinName ?? null) !== initialName;
    if (pin && (!coordsUnchanged || nameChanged)) {
      // Search results carry a name; a hand-placed pin does not (server + repo
      // clear locationName for a name-less object).
      updateExpense(expense.id, {
        location: { lat: pin.lat, lng: pin.lng, ...(pinName ? { name: pinName } : {}) },
      });
    }
    router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Address / place search */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={theme.colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={t('location.searchPlaceholder')}
          placeholderTextColor={theme.colors.textTertiary}
          autoCorrect={false}
          returnKeyType="search"
        />
        {searching && <ActivityIndicator size="small" color={theme.colors.primary} />}
        {!searching && query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={18} color={theme.colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {query.trim().length >= 3 && (results.length > 0 || !searching) && (
        <View style={styles.resultsCard}>
          {results.length === 0 && !searching ? (
            <Text style={styles.resultEmpty}>{t('location.searchNoResults')}</Text>
          ) : (
            results.map((r, i) => (
              <TouchableOpacity
                key={`${r.lat},${r.lng},${i}`}
                style={[styles.resultRow, i < results.length - 1 && styles.resultDivider]}
                onPress={() => selectResult(r)}
              >
                <Ionicons name="location-outline" size={18} color={theme.colors.primary} />
                <Text style={styles.resultText} numberOfLines={2}>{r.name}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      <ExpenseMapView
        picker
        pickerPin={pin}
        onMapPress={(lat, lng) => {
          setPin({ lat, lng });
          setPinName(null);
        }}
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
  searchBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginHorizontal: theme.spacing[4],
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[2],
    paddingHorizontal: theme.spacing[3.5],
    paddingVertical: theme.spacing[2.5],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchInput: {
    flex: 1,
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    padding: 0,
  },
  resultsCard: {
    marginHorizontal: theme.spacing[4],
    marginBottom: theme.spacing[2],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden' as const,
  },
  resultRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3.5],
    paddingVertical: theme.spacing[3],
  },
  resultDivider: { borderBottomWidth: 1, borderBottomColor: theme.colors.divider },
  resultText: { ...theme.textStyles.bodySm, color: theme.colors.textPrimary, flex: 1 },
  resultEmpty: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    padding: theme.spacing[3.5],
  },
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
  primaryButtonText: { ...theme.textStyles.body, color: theme.colors.textInverse, fontWeight: '600' as const },
});
