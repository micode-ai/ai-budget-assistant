import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Child } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';

export interface ChildChipsProps {
  /** Pickable children. A selected child missing from this list (archived) is still drawn. */
  children: Child[];
  /** Selected child ids. */
  selected: string[];
  onChange(ids: string[]): void;
  /** Read-only: only the selected children are drawn, nothing is pressable (viewers, view mode). */
  disabled?: boolean;
  /** Every known child (archived included), to name a selected archived child. */
  allChildren?: Child[];
}

/**
 * The "For" row: which children an expense is for. Multi-select; several
 * children split the expense equally (the store's default shares).
 *
 * Purely presentational and platform-neutral — it is hosted by the phone forms
 * and, unchanged, by the desktop dialogs that host those forms.
 */
export function ChildChips({
  children,
  selected,
  onChange,
  disabled = false,
  allChildren,
}: ChildChipsProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const known = allChildren ?? children;
  const pickable = disabled ? [] : children;
  const extra = selected
    .filter((id) => !pickable.some((c) => c.id === id))
    .map((id) => known.find((c) => c.id === id))
    .filter((c): c is Child => !!c);
  const shown = [...pickable, ...extra];
  if (shown.length === 0) return null;

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('children.forLabel')}</Text>
      <View style={styles.row}>
        {shown.map((child) => {
          const isSelected = selected.includes(child.id);
          const dot = child.color || theme.colors.primary;
          return (
            <Pressable
              key={child.id}
              onPress={disabled ? undefined : () => toggle(child.id)}
              disabled={disabled}
              accessibilityRole={disabled ? 'text' : 'checkbox'}
              accessibilityState={disabled ? undefined : { checked: isSelected }}
              style={[styles.chip, isSelected && styles.chipSelected]}
            >
              <View style={[styles.dot, { backgroundColor: dot }]} />
              <Text
                numberOfLines={1}
                style={[styles.chipText, isSelected && styles.chipTextSelected]}
              >
                {child.name || t('children.unnamed')}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {},
  label: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  row: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    maxWidth: 200,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius['2xl'],
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chipText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  chipTextSelected: {
    color: theme.colors.textPrimary,
    fontWeight: '600' as const,
  },
});
