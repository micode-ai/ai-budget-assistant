import { ActivityIndicator, TouchableOpacity, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

/** The not-loaded state shared by every all-accounts layout: a retry on failure, a spinner otherwise, never zeros. */
export function AllAccountsStatus({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.center}>
      {failed ? (
        <>
          <Text style={styles.muted}>{t('allAccounts.loadFailed')}</Text>
          <TouchableOpacity onPress={onRetry} accessibilityRole="button">
            <Text style={styles.link}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <ActivityIndicator color={theme.colors.primary} />
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  center: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.background,
  },
  muted: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  link: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
});
