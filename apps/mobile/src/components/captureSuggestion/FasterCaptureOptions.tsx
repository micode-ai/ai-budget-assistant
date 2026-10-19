import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { CaptureOption } from '@/features/captureSuggestion/captureSuggestion';

interface Props {
  options: CaptureOption[];
  onChoose: (option: CaptureOption) => void;
}

/** The option rows, one definition for the phone sheet and the desktop dialog. */
export function FasterCaptureOptions({ options, onChoose }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.list}>
      {options.map((option) => (
        <TouchableOpacity
          key={option.key}
          style={styles.row}
          onPress={() => onChoose(option)}
          accessibilityRole="button"
          accessibilityLabel={t(`captureSuggestion.options.${option.key}.title`)}
        >
          <View style={[styles.iconWrap, { backgroundColor: theme.colors.primary + '1A' }]}>
            <Ionicons name={option.icon as never} size={20} color={theme.colors.primary} />
          </View>
          <View style={styles.texts}>
            <Text style={styles.title}>{t(`captureSuggestion.options.${option.key}.title`)}</Text>
            <Text style={styles.body}>{t(`captureSuggestion.options.${option.key}.body`)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  list: {
    gap: theme.spacing[2],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.background,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  texts: {
    flex: 1 as const,
  },
  title: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  body: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
});
