import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { GroupButton } from './GroupButton';

/**
 * A failed load. Groups are online-only, so this must never look like an empty group: it names the
 * failure and offers a retry.
 */
export function GroupErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.container}>
      <Ionicons name="cloud-offline-outline" size={48} color={theme.colors.textTertiary} />
      <Text style={styles.text}>{t('groups.loadError')}</Text>
      <GroupButton label={t('groups.retry')} onPress={onRetry} variant="secondary" style={styles.button} />
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: theme.spacing[6],
    gap: theme.spacing[3],
  },
  text: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  button: {
    alignSelf: 'stretch' as const,
  },
});
