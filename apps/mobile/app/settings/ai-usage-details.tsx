import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { api } from '@/services/api';
import { getIntlLocale } from '@/i18n';

const FEATURE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  chat: 'chatbubble-outline',
  voice: 'mic-outline',
  parse: 'text-outline',
  categorization: 'pricetag-outline',
  ocr: 'camera-outline',
  story: 'book-outline',
  fat_finder: 'search-outline',
  insights: 'bulb-outline',
  investment_insights: 'trending-up-outline',
  tag_suggestion: 'pricetags-outline',
  project_suggestion: 'folder-outline',
  split_suggestion: 'git-branch-outline',
  goal_plan: 'flag-outline',
};

type UsageDetails = {
  month: number;
  year: number;
  totalCost: number;
  totalRequests: number;
  summary: Array<{ feature: string; count: number; totalCost: number }>;
  logs: Array<{ id: string; feature: string; cost: number; date: string }>;
};

export default function AiUsageDetailsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const intlLocale = getIntlLocale();

  const now = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<UsageDetails | null>(null);
  const [loading, setLoading] = useState(true);

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  const getMonthLabel = (m: number, y: number): string => {
    const date = new Date(y, m - 1, 1);
    const name = date.toLocaleDateString(intlLocale, { month: 'long' });
    return `${name.charAt(0).toUpperCase() + name.slice(1)} ${y}`;
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getUsageDetails(month, year);
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const goToPrevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (isCurrentMonth) return;
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const getFeatureLabel = (feature: string): string => {
    const key = `aiUsage.features.${feature}`;
    const translated = t(key);
    return translated !== key ? translated : feature.replace(/_/g, ' ');
  };

  const formatDate = (dateStr: string): string => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(intlLocale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const renderSummaryItem = ({ item }: { item: UsageDetails['summary'][0] }) => {
    const icon = FEATURE_ICONS[item.feature] || 'sparkles-outline';
    return (
      <View style={styles.summaryRow}>
        <Ionicons name={icon} size={20} color={theme.colors.primary} />
        <Text style={styles.summaryLabel} numberOfLines={1}>{getFeatureLabel(item.feature)}</Text>
        <Text style={styles.summaryCount}>{item.count}x</Text>
        <Text style={styles.summaryCost}>{item.totalCost}</Text>
      </View>
    );
  };

  const renderLogItem = ({ item }: { item: UsageDetails['logs'][0] }) => {
    const icon = FEATURE_ICONS[item.feature] || 'sparkles-outline';
    return (
      <View style={styles.logRow}>
        <Ionicons name={icon} size={16} color={theme.colors.textTertiary} />
        <Text style={styles.logFeature} numberOfLines={1}>{getFeatureLabel(item.feature)}</Text>
        <Text style={styles.logDate}>{formatDate(item.date)}</Text>
        <Text style={styles.logCost}>-{item.cost}</Text>
      </View>
    );
  };

  const renderHeader = () => (
    <>
      {/* Month Picker */}
      <View style={styles.monthPickerRow}>
        <TouchableOpacity onPress={goToPrevMonth} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.primary} />
        </TouchableOpacity>
        <Text style={styles.monthPickerLabel}>{getMonthLabel(month, year)}</Text>
        <TouchableOpacity onPress={goToNextMonth} hitSlop={8} disabled={isCurrentMonth}>
          <Ionicons name="chevron-forward" size={22} color={isCurrentMonth ? theme.colors.textDisabled : theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 40 }} />
      ) : !data || data.totalRequests === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="sparkles-outline" size={48} color={theme.colors.textDisabled} />
          <Text style={styles.emptyText}>{t('aiUsage.noUsage')}</Text>
        </View>
      ) : (
        <>
          {/* Total */}
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>{t('aiUsage.totalUsed')}</Text>
            <Text style={styles.totalValue}>{data.totalCost}</Text>
            <Text style={styles.totalSub}>{t('subscription.aiRequests')}</Text>
          </View>

          {/* Summary by feature */}
          <Text style={styles.sectionTitle}>{t('aiUsage.byFeature')}</Text>
          <View style={styles.card}>
            {data.summary.map((item) => (
              <View key={item.feature}>
                {renderSummaryItem({ item })}
              </View>
            ))}
          </View>

          {/* History header */}
          <Text style={styles.sectionTitle}>{t('aiUsage.history')}</Text>
        </>
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={!loading && data ? data.logs : []}
        keyExtractor={(item) => item.id}
        renderItem={renderLogItem}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.content}
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
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[8],
  },
  monthPickerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[4],
  },
  monthPickerLabel: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    minWidth: 140,
    textAlign: 'center' as const,
  },
  totalCard: {
    alignItems: 'center' as const,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[5],
  },
  totalLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase' as const,
  },
  totalValue: {
    ...theme.textStyles.h1,
    color: theme.colors.primary,
    fontWeight: '700' as const,
  },
  totalSub: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  sectionTitle: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase' as const,
    marginBottom: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[4],
  },
  summaryRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
  },
  summaryLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  summaryCount: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    minWidth: 30,
    textAlign: 'right' as const,
  },
  summaryCost: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
    fontWeight: '600' as const,
    minWidth: 35,
    textAlign: 'right' as const,
  },
  logRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
  },
  logFeature: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  logDate: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  logCost: {
    ...theme.textStyles.caption,
    color: theme.colors.danger,
    fontWeight: '600' as const,
    minWidth: 30,
    textAlign: 'right' as const,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.divider,
  },
  emptyContainer: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[8],
    gap: theme.spacing[2],
  },
  emptyText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
});
