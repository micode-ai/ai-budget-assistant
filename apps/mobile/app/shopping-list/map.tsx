import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { BasketStoreResult } from '@budget/shared-types';
import { useShoppingListStore } from '@/stores/shoppingListStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { ExpenseMapView } from '@/components/map/ExpenseMapView';
import { buildStoreMapPoints } from '@/components/map/buildStoreMapPoints';
import { captureCurrentLocation, requestLocationPermission } from '@/services/locationCapture';

type SortMode = 'cheapest' | 'nearby';

export default function ShoppingListMapScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const compareBasket = useShoppingListStore((s) => s.compareBasket);
  const basketResult = useShoppingListStore((s) => s.basketResult);
  const isComparing = useShoppingListStore((s) => s.isComparing);

  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('cheapest');

  const locateAndCompare = useCallback(async () => {
    setLocating(true);
    const granted = await requestLocationPermission();
    const loc = granted ? await captureCurrentLocation({ force: true }) : null;
    setOrigin(loc);
    setLocating(false);
    // If GPS is denied/unavailable (e.g. web), still compare without an
    // origin — stores plot on the map without distance labels.
    compareBasket(loc ?? undefined);
  }, [compareBasket]);

  useEffect(() => {
    locateAndCompare();
    // Run once on mount only — re-running on every `locateAndCompare`
    // identity change (a new callback each `compareBasket` reference change)
    // would re-trigger the GPS+compare flow in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stores = useMemo(() => basketResult?.stores ?? [], [basketResult]);
  const currency = basketResult?.currency ?? 'PLN';

  const { points, missingCount } = useMemo(
    () => buildStoreMapPoints(stores, currency),
    [stores, currency],
  );

  const hasNearbyFlag = stores.some((s) => s.nearby === true);
  const rankedStores = useMemo(() => {
    if (sortMode === 'nearby') {
      const base = hasNearbyFlag ? stores.filter((s) => s.nearby === true) : stores;
      return [...base].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }
    return [...stores].sort((a, b) => a.estimatedTotal - b.estimatedTotal);
  }, [stores, sortMode, hasNearbyFlag]);

  const renderStoreCard = (store: BasketStoreResult) => (
    <View
      key={store.merchantName}
      style={[styles.storeCard, store.isCheapest && styles.storeCardCheapest]}
    >
      <View style={styles.storeHeaderRow}>
        <Text style={styles.storeName} numberOfLines={1}>
          {store.merchantName}
        </Text>
        {store.isCheapest && (
          <View style={styles.cheapestBadge}>
            <Ionicons name="trophy" size={12} color={theme.colors.textInverse} />
            <Text style={styles.cheapestBadgeText}>{t('shoppingList.cheapest')}</Text>
          </View>
        )}
      </View>

      <View style={styles.storeMetaRow}>
        <Text style={styles.storeTotal}>{formatCurrency(store.estimatedTotal, currency)}</Text>
        {store.distanceKm != null && (
          <View style={styles.distanceBadge}>
            <Ionicons name="navigate-outline" size={12} color={theme.colors.textSecondary} />
            <Text style={styles.distanceText}>{store.distanceKm} km</Text>
          </View>
        )}
        <View style={styles.coverageBadge}>
          <Text style={styles.coverageBadgeText}>
            {t('shoppingList.coverage', { covered: store.coveredItems, total: store.totalItems })}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <Stack.Screen options={{ title: t('shoppingList.mapTitle') }} />

      {isComparing || locating ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>{t('shoppingList.comparing')}</Text>
        </View>
      ) : points.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="map-outline" size={40} color={theme.colors.textTertiary} />
          <Text style={styles.emptyText}>{t('shoppingList.noStoreLocations')}</Text>
        </View>
      ) : (
        <>
          <View style={styles.mapWrap}>
            <ExpenseMapView
              points={points}
              openLabel={t('map.open')}
              center={origin ? { lat: origin.lat, lng: origin.lng, zoom: 12 } : undefined}
              onPointPress={() => {}}
              style={styles.map}
            />
          </View>

          {missingCount > 0 && (
            <View style={styles.missingBanner}>
              <Ionicons name="information-circle-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.missingBannerText}>
                {t('map.noLocationCount', { count: missingCount })}
              </Text>
            </View>
          )}

          <View style={styles.sortRow}>
            <View style={styles.sortPillGroup}>
              <TouchableOpacity
                style={[styles.sortPill, sortMode === 'cheapest' && styles.sortPillActive]}
                onPress={() => setSortMode('cheapest')}
              >
                <Text
                  style={[styles.sortPillText, sortMode === 'cheapest' && styles.sortPillTextActive]}
                >
                  {t('shoppingList.sortCheapest')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sortPill, sortMode === 'nearby' && styles.sortPillActive]}
                onPress={() => setSortMode('nearby')}
              >
                <Text style={[styles.sortPillText, sortMode === 'nearby' && styles.sortPillTextActive]}>
                  {t('shoppingList.sortNearby')}
                </Text>
              </TouchableOpacity>
            </View>

            {!origin && (
              <TouchableOpacity style={styles.findNearbyButton} onPress={locateAndCompare}>
                <Ionicons name="locate-outline" size={14} color={theme.colors.primary} />
                <Text style={styles.findNearbyText}>{t('shoppingList.findNearby')}</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {rankedStores.map(renderStoreCard)}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },

  centered: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: theme.spacing[6],
    gap: theme.spacing[3],
  },
  loadingText: { ...theme.textStyles.body, color: theme.colors.textTertiary },
  emptyText: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },

  mapWrap: { height: 260 },
  map: { flex: 1 },

  missingBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surfaceSecondary,
  },
  missingBannerText: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary },

  sortRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[2],
  },
  sortPillGroup: {
    flexDirection: 'row' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
    padding: 2,
  },
  sortPill: {
    paddingVertical: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
  },
  sortPillActive: {
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  sortPillText: { ...theme.textStyles.bodySmMedium, color: theme.colors.textTertiary },
  sortPillTextActive: { color: theme.colors.textPrimary, fontWeight: '600' as const },

  findNearbyButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  findNearbyText: { ...theme.textStyles.bodySm, color: theme.colors.primary, fontWeight: '600' as const },

  list: { flex: 1 },
  listContent: {
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[10],
    gap: theme.spacing[3],
  },

  storeCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  storeCardCheapest: {
    borderColor: theme.colors.success,
    borderWidth: 2,
    backgroundColor: theme.colors.success + '0D',
  },
  storeHeaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: theme.spacing[1],
  },
  storeName: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontWeight: '600' as const,
    flex: 1,
    marginRight: theme.spacing[2],
  },
  cheapestBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    backgroundColor: theme.colors.success,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 3,
  },
  cheapestBadgeText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: theme.colors.textInverse,
  },
  storeMetaRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  storeTotal: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontWeight: '700' as const,
  },
  distanceBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
  },
  distanceText: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary },
  coverageBadge: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing[2.5],
    paddingVertical: 3,
  },
  coverageBadgeText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
});
