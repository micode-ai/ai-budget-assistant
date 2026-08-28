import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

interface FatFinderFooterProps {
  generatedAt?: string;
  loading: boolean;
  onRegenerate: () => void;
}

export function FatFinderFooter({ generatedAt, loading, onRegenerate }: FatFinderFooterProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.footerSection}>
      {generatedAt && (
        <Text style={styles.generatedAt}>
          {t('fatFinder.generatedAt', {
            time: new Date(generatedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
          })}
        </Text>
      )}
      <TouchableOpacity
        style={[styles.regenerateButton, loading && styles.regenerateButtonDisabled]}
        onPress={onRegenerate}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : (
          <Ionicons name="refresh-outline" size={18} color={theme.colors.primary} />
        )}
        <Text style={styles.regenerateText}>{t('fatFinder.regenerate')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  footerSection: {
    marginTop: theme.spacing[4],
    paddingTop: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  generatedAt: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  regenerateButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2.5],
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
  },
  regenerateButtonDisabled: {
    opacity: 0.6,
  },
  regenerateText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
});
