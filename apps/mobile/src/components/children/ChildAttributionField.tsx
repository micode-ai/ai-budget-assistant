import { View, Text, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { ExpenseChildSelection } from '@/hooks/useExpenseChildSelection';
import { ChildChips } from './ChildChips';

interface Props {
  selection: ExpenseChildSelection;
  /** Read-only (view mode, viewers): only the chosen children are drawn. */
  disabled?: boolean;
  /** Read-only display of these ids instead of the selection state (view mode). */
  displayIds?: string[];
  /** Wraps the row — only when there is a row to draw, so no empty bordered box is left behind. */
  style?: StyleProp<ViewStyle>;
}

/**
 * The component half of the "For" sub-form (`useExpenseChildSelection`).
 *
 * An account with no children shows nothing — most accounts have none, and an
 * empty row on every expense form would be noise. A FAILED load is not the
 * same thing and is never drawn as one: an editable form shows a retry line
 * instead of silently hiding the row.
 */
export function ChildAttributionField({ selection, disabled = false, displayIds, style }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { kids, selected, onChange } = selection;

  if (!disabled && kids.loadFailed) {
    return (
      <View style={style}>
        <Pressable style={styles.failed} onPress={kids.reload} accessibilityRole="button">
          <Ionicons name="refresh" size={16} color={theme.colors.textSecondary} />
          <Text style={styles.failedText}>{t('children.loadFailed')}</Text>
          <Text style={styles.retry}>{t('common.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  const ids = displayIds ?? selected;
  const visible = disabled
    ? ids.some((id) => kids.children.some((c) => c.id === id))
    : kids.activeChildren.length > 0 || ids.length > 0;
  if (!visible) return null;

  return (
    <View style={style}>
      <ChildChips
        children={kids.activeChildren}
        allChildren={kids.children}
        selected={ids}
        onChange={(next) => void onChange(next)}
        disabled={disabled}
      />
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  failed: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
  },
  failedText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  retry: {
    ...theme.textStyles.bodySm,
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },
});
