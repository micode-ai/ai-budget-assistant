import { Text, TouchableOpacity, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useStyles, type Theme } from '@/theme';

export type DebtFilterType = 'all' | 'active' | 'overdue' | 'paid';

interface DebtFilterChipsProps {
  activeFilter: DebtFilterType;
  onChange: (filter: DebtFilterType) => void;
}

export function DebtFilterChips({ activeFilter, onChange }: DebtFilterChipsProps) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);

  const filters: { key: DebtFilterType; label: string }[] = [
    { key: 'all', label: t('debt.filterAll') },
    { key: 'active', label: t('debt.filterActive') },
    { key: 'overdue', label: t('debt.filterOverdue') },
    { key: 'paid', label: t('debt.filterPaid') },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterScroll}
      contentContainerStyle={styles.filterRow}
    >
      {filters.map((filter) => (
        <TouchableOpacity
          key={filter.key}
          style={[styles.filterChip, activeFilter === filter.key && styles.filterChipActive]}
          onPress={() => onChange(filter.key)}
        >
          <Text
            style={[
              styles.filterChipText,
              activeFilter === filter.key && styles.filterChipTextActive,
            ]}
          >
            {filter.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const createStyles = (theme: Theme) => ({
  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: theme.spacing[4],
  },
  filterRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
  },
  filterChip: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius['3xl'],
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  filterChipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
  },
  filterChipTextActive: {
    color: theme.colors.primary,
  },
});
