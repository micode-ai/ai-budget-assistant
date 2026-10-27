import { Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

interface Props {
  parentName: string;
  onBack: () => void;
}

export function CategoryDrillBreadcrumb({ parentName, onBack }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onBack}
      accessibilityRole="button"
      accessibilityLabel={t('analytics.allCategories')}
    >
      <Ionicons name="chevron-back" size={16} color={theme.colors.primary} />
      <Text style={styles.link}>{t('analytics.allCategories')}</Text>
      <Text style={styles.sep}>›</Text>
      <Text style={styles.current} numberOfLines={1}>{parentName}</Text>
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    marginBottom: theme.spacing[3],
  },
  link: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
  sep: { ...theme.textStyles.bodyMedium, color: theme.colors.textTertiary },
  current: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, flexShrink: 1 },
});
