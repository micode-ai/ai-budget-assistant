import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useStyles, type Theme } from '@/theme';

export type DebtActiveTab = 'lent' | 'borrowed';

interface DebtSegmentedTabsProps {
  activeTab: DebtActiveTab;
  onChange: (tab: DebtActiveTab) => void;
}

export function DebtSegmentedTabs({ activeTab, onChange }: DebtSegmentedTabsProps) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.segmentedControl}>
      <TouchableOpacity
        style={[styles.segmentButton, activeTab === 'lent' && styles.segmentButtonActive]}
        onPress={() => onChange('lent')}
      >
        <Text style={[styles.segmentText, activeTab === 'lent' && styles.segmentTextActive]}>
          {t('debt.moneyLent')}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.segmentButton, activeTab === 'borrowed' && styles.segmentButtonActive]}
        onPress={() => onChange('borrowed')}
      >
        <Text style={[styles.segmentText, activeTab === 'borrowed' && styles.segmentTextActive]}>
          {t('debt.moneyBorrowed')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  segmentedControl: {
    flexDirection: 'row' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: 3,
    marginBottom: theme.spacing[3],
  },
  segmentButton: {
    flex: 1,
    paddingVertical: theme.spacing[2],
    alignItems: 'center' as const,
    borderRadius: theme.borderRadius.md,
  },
  segmentButtonActive: {
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  segmentText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
  },
  segmentTextActive: {
    color: theme.colors.textPrimary,
    fontWeight: '600' as const,
  },
});
