import { TouchableOpacity, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

interface ShoppingModeButtonProps {
  active: boolean;
  onPress: () => void;
}

/**
 * The "I'm going shopping" toggle row. Android only, and not cosmetically —
 * there is no iOS native project in this repo, and on web
 * `startLocationUpdatesAsync` throws — so the caller renders this component
 * behind its own `Platform.OS === 'android'` check rather than the check
 * living in here. Deliberately not canEdit-gated: a viewer can walk into a
 * shop, and starting a location session on their own device writes nothing
 * to the account.
 */
export function ShoppingModeButton({ active, onPress }: ShoppingModeButtonProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <TouchableOpacity
      style={[styles.button, active && styles.buttonActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons
        name={active ? 'stop-circle-outline' : 'navigate-outline'}
        size={18}
        color={active ? theme.colors.textInverse : theme.colors.primary}
      />
      <Text style={[styles.text, active && styles.textActive]}>
        {active ? t('shoppingMode.stop') : t('shoppingMode.start')}
      </Text>
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  // No horizontal margin on purpose: the shopping-list screen's ScrollView
  // content padding already sets the gutter every element on it sits inside.
  button: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  buttonActive: { backgroundColor: theme.colors.primary },
  text: {
    ...theme.textStyles.bodyMedium,
    fontWeight: '600' as const,
    color: theme.colors.primary,
  },
  textActive: { color: theme.colors.textInverse },
});
