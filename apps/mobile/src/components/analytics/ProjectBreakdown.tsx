import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { ProjectSpending } from '@/features/analytics/useAnalytics';

interface Props {
  projectSpending: ProjectSpending[];
  currency: string;
}

export function ProjectBreakdown({ projectSpending, currency }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('analytics.byProject')}</Text>
      {projectSpending.map((ps) => (
        <View key={ps.projectId} style={styles.projectItem}>
          <View style={styles.projectHeader}>
            <View style={styles.categoryInfo}>
              <View style={[styles.projectDot, { backgroundColor: ps.color }]} />
              <Text style={styles.categoryName}>{ps.name}</Text>
            </View>
            <Text style={styles.categoryAmount}>
              {formatCurrency(ps.amount, currency)}
            </Text>
          </View>
          {ps.budget != null && ps.budget > 0 && (
            <View style={styles.projectBudgetBar}>
              <View style={styles.projectBudgetTrack}>
                <View
                  style={[
                    styles.projectBudgetFill,
                    {
                      width: `${Math.min((ps.amount / ps.budget) * 100, 100)}%`,
                      backgroundColor: ps.amount > ps.budget ? theme.colors.danger : ps.color,
                    },
                  ]}
                />
              </View>
              <Text style={styles.projectBudgetText}>
                {ps.amount > ps.budget
                  ? t('analytics.overBudget')
                  : `${formatCurrency(ps.budget - ps.amount, currency)} ${t('projects.budgetRemaining')}`
                }
              </Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  section: {
    marginBottom: theme.spacing[5],
  },
  sectionTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3],
  },
  projectItem: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[2],
  },
  projectHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  categoryInfo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  projectDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  categoryName: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textPrimary,
  },
  categoryAmount: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  projectBudgetBar: {
    marginTop: theme.spacing[3],
  },
  projectBudgetTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.progressTrack,
    overflow: 'hidden' as const,
  },
  projectBudgetFill: {
    height: '100%' as const,
    borderRadius: 3,
  },
  projectBudgetText: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
});
