import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { BenchmarkPoint } from '@/hooks/usePortfolioAnalytics';

export const BENCHMARKS = [
  { symbol: 'SPY', name: 'S&P 500' },
  { symbol: 'QQQ', name: 'NASDAQ 100' },
  { symbol: 'DIA', name: 'Dow Jones' },
  { symbol: 'IWM', name: 'Russell 2000' },
];

interface Props {
  benchmarkComparison: BenchmarkPoint[];
  benchmarkLoading: boolean;
  selectedBenchmark: string;
  onBenchmarkChange: (symbol: string) => void;
  onInfoPress: () => void;
}

export function BenchmarkCard({ benchmarkComparison, benchmarkLoading, selectedBenchmark, onBenchmarkChange, onInfoPress }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const comparison = benchmarkComparison[0];

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={onInfoPress}>
      <View style={styles.cardTitleRow}>
        <Text style={styles.cardTitle}>{t('investments.benchmarkComparison')}</Text>
        <Ionicons name="information-circle-outline" size={20} color={theme.colors.textTertiary} />
      </View>

      <View style={styles.selector}>
        {BENCHMARKS.map((b) => (
          <TouchableOpacity
            key={b.symbol}
            style={[styles.pill, selectedBenchmark === b.symbol && styles.pillActive]}
            onPress={() => onBenchmarkChange(b.symbol)}
          >
            <Text style={[styles.pillText, selectedBenchmark === b.symbol && styles.pillTextActive]}>
              {b.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {benchmarkLoading ? (
        <View style={styles.placeholder}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      ) : comparison ? (
        <View style={styles.result}>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>{t('investments.yourPortfolio')}</Text>
            <Text style={[styles.resultValue, { color: comparison.portfolioReturn >= 0 ? theme.colors.success : theme.colors.danger }]}>
              {comparison.portfolioReturn >= 0 ? '+' : ''}{comparison.portfolioReturn.toFixed(2)}%
            </Text>
          </View>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>{BENCHMARKS.find((b) => b.symbol === selectedBenchmark)?.name ?? selectedBenchmark}</Text>
            <Text style={[styles.resultValue, { color: comparison.benchmarkReturn >= 0 ? theme.colors.success : theme.colors.danger }]}>
              {comparison.benchmarkReturn >= 0 ? '+' : ''}{comparison.benchmarkReturn.toFixed(2)}%
            </Text>
          </View>
          <View style={styles.diff}>
            <Text style={styles.diffLabel}>{t('investments.difference')}</Text>
            <Text style={[styles.diffValue, {
              color: (comparison.portfolioReturn - comparison.benchmarkReturn) >= 0 ? theme.colors.success : theme.colors.danger,
            }]}>
              {(comparison.portfolioReturn - comparison.benchmarkReturn) >= 0 ? '+' : ''}
              {(comparison.portfolioReturn - comparison.benchmarkReturn).toFixed(2)}%
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.placeholder}>
          <Ionicons name="analytics-outline" size={40} color={theme.colors.textTertiary} />
          <Text style={styles.placeholderText}>{t('investments.noBenchmarkData')}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
    ...theme.shadows.sm,
  },
  cardTitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  cardTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  selector: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  pill: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius['2xl'],
    backgroundColor: theme.colors.surfaceSecondary,
  },
  pillActive: {
    backgroundColor: theme.colors.primary,
  },
  pillText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    fontWeight: '600' as const,
  },
  pillTextActive: {
    color: theme.colors.textInverse,
  },
  result: {
    gap: theme.spacing[2],
  },
  resultRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  resultLabel: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
  },
  resultValue: {
    ...theme.textStyles.bodyLargeSemiBold,
  },
  diff: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    marginTop: theme.spacing[2],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[3],
  },
  diffLabel: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
  },
  diffValue: {
    ...theme.textStyles.h3,
  },
  placeholder: {
    alignItems: 'center' as const,
    padding: theme.spacing[6],
    gap: theme.spacing[2],
  },
  placeholderText: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
});
