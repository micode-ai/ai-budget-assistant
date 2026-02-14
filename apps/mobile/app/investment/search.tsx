import { View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useState, useCallback, useRef } from 'react';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useInvestmentStore } from '@/stores/investmentStore';
import { api } from '@/services/api';
import { useTheme, useStyles, type Theme } from '@/theme';

interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
  currency: string;
  isRecommended?: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  Stock: '#4F46E5',
  Crypto: '#F59E0B',
  ETF: '#10B981',
};

export default function AssetSearchScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { addHolding } = useInvestmentStore();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (!text.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      setLoading(true);
      setHasSearched(true);
      try {
        const data = await api.searchAssets(text.trim());
        setResults(data || []);
      } catch (e) {
        console.log('Search failed:', e);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 500);
  }, []);

  const handleSelectAsset = async (asset: SearchResult) => {
    try {
      await addHolding({
        assetSymbol: asset.symbol,
        assetName: asset.name,
        assetType: asset.type as any,
        assetExchange: asset.exchange,
        assetCurrency: asset.currency,
      });
      router.back();
    } catch (e) {
      console.log('Failed to add holding:', e);
    }
  };

  const renderResultItem = ({ item, index }: { item: SearchResult; index: number }) => {
    const badgeColor = TYPE_COLORS[item.type] || theme.colors.textTertiary;
    const isRecommended = item.isRecommended;

    return (
      <TouchableOpacity
        style={[
          styles.resultCard,
          isRecommended && styles.recommendedCard,
        ]}
        onPress={() => handleSelectAsset(item)}
      >
        <View style={styles.resultLeft}>
          <View style={styles.symbolRow}>
            <Text style={styles.resultSymbol}>{item.symbol}</Text>
            {isRecommended && (
              <View style={styles.recommendedBadge}>
                <Ionicons name="checkmark-circle" size={14} color={theme.colors.success} />
                <Text style={styles.recommendedText}>{t('investments.recommended')}</Text>
              </View>
            )}
          </View>
          <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
        </View>
        <View style={styles.resultRight}>
          <View style={[styles.typeBadge, { backgroundColor: badgeColor + '20' }]}>
            <Text style={[styles.typeBadgeText, { color: badgeColor }]}>{item.type}</Text>
          </View>
          <Text style={styles.resultExchange}>
            {[item.exchange, item.currency].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const EmptyComponent = () => {
    if (loading) return null;

    if (!hasSearched) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={64} color={theme.colors.textTertiary} />
          <Text style={styles.emptyTitle}>{t('investments.searchPlaceholder')}</Text>
          <Text style={styles.emptySubtitle}>{t('investments.searchHint')}</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <Ionicons name="alert-circle-outline" size={64} color={theme.colors.textTertiary} />
        <Text style={styles.emptyTitle}>{t('investments.noResults')}</Text>
        <Text style={styles.emptySubtitle}>{t('investments.tryDifferentQuery')}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={20} color={theme.colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={handleSearch}
            placeholder={t('investments.searchPlaceholder')}
            placeholderTextColor={theme.colors.textTertiary}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <Ionicons name="close-circle" size={20} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Loading */}
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      )}

      {/* Results */}
      <FlatList
        data={results}
        renderItem={renderResultItem}
        keyExtractor={(item) => `${item.symbol}-${item.exchange}`}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={EmptyComponent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </SafeAreaView>
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
  resultCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    ...theme.shadows.sm,
  },
  resultLeft: {
    flex: 1,
    marginRight: theme.spacing[3],
  },
  symbolRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[1],
  },
  resultSymbol: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  recommendedCard: {
    borderWidth: 2,
    borderColor: theme.colors.success,
    backgroundColor: theme.colors.success + '08',
  },
  recommendedBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    backgroundColor: theme.colors.success + '15',
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[0.5] || 2,
    borderRadius: theme.borderRadius.sm,
  },
  recommendedText: {
    ...theme.textStyles.caption,
    color: theme.colors.success,
    fontWeight: '600' as const,
  },
  resultName: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
  },
  resultRight: {
    alignItems: 'flex-end' as const,
    gap: theme.spacing[2],
  },
  typeBadge: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  typeBadgeText: {
    ...theme.textStyles.caption,
    fontWeight: '600' as const,
  },
  resultExchange: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  separator: {
    height: theme.spacing[2],
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing[8],
    paddingTop: theme.spacing[8],
  },
  emptyTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing[4],
    textAlign: 'center' as const,
  },
  emptySubtitle: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: theme.spacing[2],
  },
});
