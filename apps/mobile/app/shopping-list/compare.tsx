import React, { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { BasketStoreResult, BasketPerItemCheapest } from '@budget/shared-types';
import { useShoppingListStore } from '@/stores/shoppingListStore';
import { useTheme, useStyles, type Theme } from '@/theme';

export default function CompareBasketScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const compareBasket = useShoppingListStore((s) => s.compareBasket);
  const basketResult = useShoppingListStore((s) => s.basketResult);
  const isComparing = useShoppingListStore((s) => s.isComparing);

  useEffect(() => {
    compareBasket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const headerRight = () =>
    basketResult ? (
      <TouchableOpacity
        onPress={() => router.push('/shopping-list/map')}
        hitSlop={8}
        accessibilityLabel={t('shoppingList.mapTitle')}
      >
        <Ionicons name="map-outline" size={22} color={theme.colors.primary} />
      </TouchableOpacity>
    ) : null;

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
            <Ionicons name="trophy" size={12} color={theme.colors.onSemantic} />
            <Text style={styles.cheapestBadgeText}>{t('shoppingList.cheapest')}</Text>
          </View>
        )}
      </View>

      <Text style={styles.storeTotal}>
        {formatCurrency(store.estimatedTotal, basketResult?.currency ?? 'USD')}
      </Text>

      <View style={styles.storeMetaRow}>
        <View style={styles.coverageBadge}>
          <Text style={styles.coverageBadgeText}>
            {t('shoppingList.coverage', {
              covered: store.coveredItems,
              total: store.totalItems,
            })}
          </Text>
        </View>

        {store.hasStale && (
          <View style={styles.staleRow}>
            <Ionicons name="time-outline" size={13} color={theme.colors.warning} />
            <Text style={styles.staleText}>{t('shoppingList.stalePrices')}</Text>
          </View>
        )}
      </View>

      {store.missingItems.length > 0 && (
        <Text style={styles.missingText}>
          {t('shoppingList.missingCount', { count: store.missingItems.length })}
        </Text>
      )}
    </View>
  );

  const renderPerItemRow = (row: BasketPerItemCheapest, isLast: boolean) => (
    <React.Fragment key={row.canonicalName}>
      <View style={styles.perItemRow}>
        <Text style={styles.perItemName} numberOfLines={1}>
          {row.canonicalName}
        </Text>
        {row.cheapestStore && row.price !== null ? (
          <Text style={styles.perItemValue} numberOfLines={1}>
            {row.cheapestStore} · {formatCurrency(row.price, basketResult?.currency ?? 'USD')}
          </Text>
        ) : (
          <Text style={styles.perItemNotTracked}>{t('shoppingList.notTracked')}</Text>
        )}
      </View>
      {!isLast && <View style={styles.divider} />}
    </React.Fragment>
  );

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <Stack.Screen options={{ title: t('shoppingList.compareTitle'), headerRight }} />

      {isComparing ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>{t('shoppingList.comparing')}</Text>
        </View>
      ) : basketResult ? (
        <ScrollView contentContainerStyle={styles.content}>
          <TouchableOpacity
            style={styles.mapButton}
            onPress={() => router.push('/shopping-list/map')}
          >
            <Ionicons name="map-outline" size={18} color={theme.colors.textInverse} />
            <Text style={styles.mapButtonText}>{t('shoppingList.mapTitle')}</Text>
          </TouchableOpacity>

          <View style={styles.storesSection}>{basketResult.stores.map(renderStoreCard)}</View>

          {basketResult.perItemCheapest.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('shoppingList.cheapestPerItem')}</Text>
              <View style={styles.card}>
                {basketResult.perItemCheapest.map((row, i) =>
                  renderPerItemRow(row, i === basketResult.perItemCheapest.length - 1),
                )}
              </View>
            </View>
          )}
        </ScrollView>
      ) : (
        <View style={styles.centered}>
          <Ionicons name="storefront-outline" size={40} color={theme.colors.textTertiary} />
          <Text style={styles.emptyText}>{t('shoppingList.noPriceData')}</Text>
          <TouchableOpacity
            style={styles.scanButton}
            onPress={() => router.push('/expense/receipt')}
          >
            <Ionicons name="camera-outline" size={18} color={theme.colors.textInverse} />
            <Text style={styles.scanButtonText}>{t('receipt.title')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing[4], paddingBottom: theme.spacing[10] },

  centered: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: theme.spacing[6],
    gap: theme.spacing[3],
  },
  loadingText: { ...theme.textStyles.body, color: theme.colors.textTertiary },
  emptyText: { ...theme.textStyles.body, color: theme.colors.textTertiary, textAlign: 'center' as const },

  scanButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[5],
    borderRadius: theme.borderRadius.lg,
    marginTop: theme.spacing[2],
  },
  scanButtonText: { fontSize: 15, fontWeight: '600' as const, color: theme.colors.textInverse },

  mapButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing[4],
  },
  mapButtonText: { fontSize: 15, fontWeight: '600' as const, color: theme.colors.textInverse },

  storesSection: { gap: theme.spacing[3] },
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
    color: theme.colors.onSemantic,
  },
  storeTotal: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[2],
  },
  storeMetaRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
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
  staleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  staleText: { ...theme.textStyles.bodySm, color: theme.colors.warning },
  missingText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[2],
  },

  section: { marginTop: theme.spacing[5] },
  sectionTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[4],
  },
  perItemRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[3],
  },
  perItemName: { ...theme.textStyles.body, color: theme.colors.textPrimary, flex: 1 },
  perItemValue: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    flexShrink: 0,
  },
  perItemNotTracked: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    fontStyle: 'italic' as const,
    flexShrink: 0,
  },
  divider: { height: 1, backgroundColor: theme.colors.divider },
});
