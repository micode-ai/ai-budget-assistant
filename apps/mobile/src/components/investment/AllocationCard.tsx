import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { AllocationSlice } from '@/hooks/usePortfolioAnalytics';

interface Props {
  allocation: AllocationSlice[];
  onInfoPress: () => void;
}

export function AllocationCard({ allocation, onInfoPress }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={onInfoPress}>
      <View style={styles.cardTitleRow}>
        <Text style={styles.cardTitle}>{t('investments.allocationByType')}</Text>
        <Ionicons name="information-circle-outline" size={20} color={theme.colors.textTertiary} />
      </View>
      {allocation.length > 0 ? (
        allocation.map((item) => (
          <View key={item.type} style={styles.row}>
            <View style={styles.rowInfo}>
              <View style={[styles.dot, { backgroundColor: item.color }]} />
              <Text style={styles.label}>{item.type}</Text>
            </View>
            <View style={styles.barContainer}>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${Math.min(item.percentage, 100)}%`, backgroundColor: item.color }]} />
              </View>
              <Text style={styles.percent}>{item.percentage.toFixed(1)}%</Text>
            </View>
          </View>
        ))
      ) : (
        <View style={styles.placeholder}>
          <Ionicons name="pie-chart-outline" size={48} color={theme.colors.textTertiary} />
          <Text style={styles.placeholderText}>{t('investments.noAllocationData')}</Text>
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
  row: {
    marginBottom: theme.spacing[3],
  },
  rowInfo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  label: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  barContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
    overflow: 'hidden' as const,
  },
  barFill: {
    height: '100%' as const,
    borderRadius: 4,
  },
  percent: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
    fontWeight: '600' as const,
    minWidth: 50,
    textAlign: 'right' as const,
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
