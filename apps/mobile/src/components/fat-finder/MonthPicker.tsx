import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles, type Theme } from '@/theme';
import { AiUsageBadge } from '@/components/AiUsageBadge';
import { getMonthLabel } from '@/features/fat-finder/fatFinderDisplay';

interface MonthPickerProps {
  month: number;
  year: number;
  isCurrentMonth: boolean;
  /** The anchored financial month's span ("10 Oct – 9 Nov"), or null for a calendar month. */
  range?: string | null;
  loading: boolean;
  intlLocale: string;
  onPrev: () => void;
  onNext: () => void;
}

export function MonthPicker({
  month,
  year,
  isCurrentMonth,
  range,
  loading,
  intlLocale,
  onPrev,
  onNext,
}: MonthPickerProps) {
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.monthPickerRow}>
      <TouchableOpacity onPress={onPrev} hitSlop={8} disabled={loading}>
        <Ionicons name="chevron-back" size={22} color={theme.colors.primary} />
      </TouchableOpacity>
      <View>
        <Text style={styles.monthPickerLabel}>{getMonthLabel(month, year, intlLocale)}</Text>
        {range ? <Text style={styles.monthPickerRange}>{range}</Text> : null}
      </View>
      <TouchableOpacity onPress={onNext} hitSlop={8} disabled={isCurrentMonth || loading}>
        <Ionicons
          name="chevron-forward"
          size={22}
          color={isCurrentMonth ? theme.colors.textDisabled : theme.colors.primary}
        />
      </TouchableOpacity>
      <AiUsageBadge />
    </View>
  );
}

const createStyles = (theme: Theme) => ({
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
    minWidth: 160,
    textAlign: 'center' as const,
  },
  monthPickerRange: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
});
