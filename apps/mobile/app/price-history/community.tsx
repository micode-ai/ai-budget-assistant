import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useCommunityPriceStore } from '@/stores/communityPriceStore';
import type { CommunityPricePeriod, CommunityProductSearchItem, CommunityPriceStore } from '@budget/shared-types';

const PERIODS: CommunityPricePeriod[] = ['1w', '4w'];
const PERIOD_KEYS: Record<CommunityPricePeriod, string> = {
  '1w': 'communityPrices.week1',
  '4w': 'communityPrices.week4',
};

export default function CommunityPriceScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const {
    searchTerm,
    searchResults,
    isSearching,
    selectedProduct,
    result,
    period,
    isLoading,
    search,
    loadPrices,
    setPeriod,
    reset,
  } = useCommunityPriceStore();

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchChange = useCallback(
    (text: string) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        search(text);
      }, 300);
    },
    [search],
  );

  const handleSelectProduct = useCallback(
    (item: CommunityProductSearchItem) => {
      loadPrices(item.canonicalName, null, period);
    },
    [loadPrices, period],
  );

  const handleBackToSearch = useCallback(() => {
    reset();
  }, [reset]);

  const renderSearchResult = useCallback(
    ({ item }: { item: CommunityProductSearchItem }) => (
      <TouchableOpacity style={styles.resultRow} onPress={() => handleSelectProduct(item)}>
        <View style={styles.resultLeft}>
          <Ionicons name="pricetag-outline" size={18} color={theme.colors.primary} />
          <Text style={styles.resultName} numberOfLines={1}>
            {item.canonicalName}
          </Text>
        </View>
        <Text style={styles.resultSub}>
          {t('communityPrices.regionsAvailable', { count: item.regionsAvailable })}
        </Text>
      </TouchableOpacity>
    ),
    [handleSelectProduct, styles, theme, t],
  );

  const renderStoreRow = useCallback(
    ({ item }: { item: CommunityPriceStore }) => (
      <View style={styles.storeRow}>
        <View style={styles.storeLeft}>
          {item.isCheapest && (
            <View style={styles.cheapestBadge}>
              <Text style={styles.cheapestText}>{t('communityPrices.cheapest')}</Text>
            </View>
          )}
          <View style={styles.storeNameWrap}>
            <Text style={styles.storeName} numberOfLines={1}>
              {item.merchantName}
            </Text>
            <Text style={styles.storeBackedBy}>
              {t('communityPrices.backedBy', {
                receipts: item.receiptCount,
                contributors: item.contributorCount,
              })}
            </Text>
          </View>
        </View>
        <Text style={styles.storePrice}>
          {formatCurrency(item.medianPrice, item.currencyCode)}
        </Text>
      </View>
    ),
    [styles, t],
  );

  // Compare view — a product has been selected
  if (selectedProduct) {
    return (
      <>
        <Stack.Screen options={{ title: t('communityPrices.screenTitle') }} />
        <SafeAreaView style={styles.container} edges={[]}>
          <TouchableOpacity style={styles.backRow} onPress={handleBackToSearch}>
            <Ionicons name="chevron-back" size={18} color={theme.colors.primary} />
            <Text style={styles.backText} numberOfLines={1}>
              {selectedProduct}
            </Text>
          </TouchableOpacity>

          <View style={styles.periodRow}>
            {PERIODS.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.periodChip, period === p && styles.periodChipActive]}
                onPress={() => setPeriod(p)}
              >
                <Text
                  style={[styles.periodChipText, period === p && styles.periodChipTextActive]}
                >
                  {t(PERIOD_KEYS[p] as any)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : result && result.stores.length > 0 ? (
            <>
              <Text style={styles.weekLabel}>{result.weekLabel}</Text>
              <FlatList
                data={result.stores}
                renderItem={renderStoreRow}
                keyExtractor={(item) => item.merchantName}
                contentContainerStyle={styles.listContent}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
              />
            </>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="storefront-outline" size={48} color={theme.colors.textTertiary} />
              <Text style={styles.emptyTitle}>{t('communityPrices.noResults')}</Text>
            </View>
          )}
        </SafeAreaView>
      </>
    );
  }

  // Search view
  return (
    <>
      <Stack.Screen options={{ title: t('communityPrices.screenTitle') }} />
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={20} color={theme.colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              defaultValue={searchTerm}
              onChangeText={handleSearchChange}
              placeholder={t('communityPrices.searchPlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        {isSearching && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        )}

        <FlatList
          data={searchResults}
          renderItem={renderSearchResult}
          keyExtractor={(item) => item.canonicalName}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            !isSearching ? (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={48} color={theme.colors.textTertiary} />
                <Text style={styles.emptyTitle}>
                  {searchTerm.trim().length >= 2
                    ? t('communityPrices.noResults')
                    : t('communityPrices.searchHint')}
                </Text>
              </View>
            ) : null
          }
        />
      </SafeAreaView>
    </>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  searchContainer: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[2],
  },
  searchBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing[2],
  },
  searchInput: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    flex: 1,
    paddingVertical: theme.spacing[1],
  },
  loadingContainer: {
    padding: theme.spacing[6],
    alignItems: 'center' as const,
  },
  listContent: {
    padding: theme.spacing[4],
    paddingTop: theme.spacing[2],
    flexGrow: 1 as const,
  },
  resultRow: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    ...theme.shadows.sm,
  },
  resultLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    flex: 1,
    marginRight: theme.spacing[2],
  },
  resultName: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  resultSub: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  separator: {
    height: theme.spacing[2],
  },
  emptyState: {
    alignItems: 'center' as const,
    paddingTop: theme.spacing[10],
    gap: theme.spacing[3],
  },
  emptyTitle: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
  backRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    gap: theme.spacing[1],
  },
  backText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.primary,
    flexShrink: 1,
  },
  periodRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  periodChip: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  periodChipActive: {
    backgroundColor: theme.colors.primary,
  },
  periodChipText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
  periodChipTextActive: {
    color: '#fff',
  },
  weekLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    paddingHorizontal: theme.spacing[4],
    marginBottom: theme.spacing[1],
  },
  storeRow: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    ...theme.shadows.sm,
  },
  storeLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flex: 1,
    marginRight: theme.spacing[2],
  },
  cheapestBadge: {
    backgroundColor: theme.colors.successLight,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    marginRight: theme.spacing[2],
    flexShrink: 0,
  },
  cheapestText: {
    ...theme.textStyles.caption,
    color: theme.colors.success,
  },
  storeNameWrap: {
    flex: 1,
  },
  storeName: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
  },
  storeBackedBy: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  storePrice: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
});
