import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

export function DebtsEmptyState() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.emptyState}>
      <Ionicons name="people-outline" size={64} color={theme.colors.textDisabled} />
      <Text style={styles.emptyTitle}>{t('debt.noDebts')}</Text>
      <Text style={styles.emptySubtitle}>{t('debt.noDebtsHint')}</Text>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  emptyState: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing[8],
    paddingTop: theme.spacing[12],
  },
  emptyTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing[4],
  },
  emptySubtitle: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: theme.spacing[2],
  },
});
