import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { Child } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';

export interface ChildLinePickerProps {
  /** Pickable (active) children. */
  children: Child[];
  /** Every known child (archived included), to name an attributed archived child. */
  allChildren?: Child[];
  /** The line's child (local id), or null. */
  value: string | null;
  /** A learned suggestion for this line — drawn highlighted, NEVER applied by itself. */
  suggestion?: string | null;
  onChange(childId: string | null): void;
  /** Read-only (viewers): only an attributed child is drawn, nothing is pressable. */
  disabled?: boolean;
}

/**
 * Which child one receipt line is for. Collapsed it is a small pill under the
 * line — the line's child, a highlighted suggestion ("Pieluchy → Ania?"), or a
 * quiet "For…" — and a tap opens a single-select chip row. A suggestion only
 * becomes an attribution when the user taps it.
 *
 * Purely presentational and platform-neutral: the receipt confirm card, the
 * expense detail item list and the desktop `ExpenseDialog` (which hosts that
 * list) all draw it.
 */
export function ChildLinePicker({
  children,
  allChildren,
  value,
  suggestion,
  onChange,
  disabled = false,
}: ChildLinePickerProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [open, setOpen] = useState(false);

  const known = allChildren ?? children;
  const current = value ? known.find((c) => c.id === value) : undefined;
  const suggested = !value && suggestion ? children.find((c) => c.id === suggestion) : undefined;
  const nameOf = (c: Child) => c.name || t('children.unnamed');

  if (disabled) {
    if (!current) return null;
    return (
      <View style={styles.row}>
        <View style={[styles.pill, styles.pillSet]}>
          <View style={[styles.dot, { backgroundColor: current.color || theme.colors.primary }]} />
          <Text style={styles.pillTextSet} numberOfLines={1}>
            {nameOf(current)}
          </Text>
        </View>
      </View>
    );
  }
  if (children.length === 0 && !current) return null;

  const pick = (id: string | null) => {
    setOpen(false);
    if (id !== value) onChange(id);
  };

  return (
    <View>
      <View style={styles.row}>
        <Pressable
          onPress={() => setOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={
            current
              ? t('children.lineForA11y', { name: nameOf(current) })
              : suggested
                ? t('children.lineSuggestedA11y', { name: nameOf(suggested) })
                : t('children.lineFor')
          }
          style={[styles.pill, current ? styles.pillSet : suggested ? styles.pillSuggested : styles.pillEmpty]}
        >
          {current ? (
            <>
              <View style={[styles.dot, { backgroundColor: current.color || theme.colors.primary }]} />
              <Text style={styles.pillTextSet} numberOfLines={1}>
                {nameOf(current)}
              </Text>
            </>
          ) : suggested ? (
            <>
              <Ionicons name="sparkles-outline" size={12} color={theme.colors.primary} />
              <Text style={styles.pillTextSuggested} numberOfLines={1}>
                {t('children.lineSuggested', { name: nameOf(suggested) })}
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="person-add-outline" size={12} color={theme.colors.textTertiary} />
              <Text style={styles.pillTextEmpty}>{t('children.lineFor')}</Text>
            </>
          )}
        </Pressable>
      </View>

      {open && (
        <View style={styles.choices}>
          {children.map((child) => {
            const selected = child.id === value;
            const isSuggested = !value && child.id === suggestion;
            return (
              <Pressable
                key={child.id}
                onPress={() => pick(selected ? null : child.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                style={[styles.chip, selected && styles.chipSelected, isSuggested && styles.chipSuggested]}
              >
                <View style={[styles.dot, { backgroundColor: child.color || theme.colors.primary }]} />
                <Text numberOfLines={1} style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {nameOf(child)}
                </Text>
              </Pressable>
            );
          })}
          {value && (
            <Pressable onPress={() => pick(null)} accessibilityRole="button" style={styles.chip}>
              <Ionicons name="close" size={12} color={theme.colors.textSecondary} />
              <Text style={styles.chipText}>{t('children.lineNone')}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    marginTop: theme.spacing[1],
  },
  pill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    maxWidth: 220,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 3,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
  },
  pillSet: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  pillSuggested: {
    borderColor: theme.colors.primary,
    borderStyle: 'dashed' as const,
    backgroundColor: theme.colors.surface,
  },
  pillEmpty: {
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  pillTextSet: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  pillTextSuggested: {
    fontSize: 12,
    color: theme.colors.primary,
    flexShrink: 1,
  },
  pillTextEmpty: {
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
  choices: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[1.5],
    marginTop: theme.spacing[1.5],
  },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    maxWidth: 180,
    paddingHorizontal: theme.spacing[2.5],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius['2xl'],
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  chipSuggested: {
    borderColor: theme.colors.primary,
    borderStyle: 'dashed' as const,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  chipTextSelected: {
    color: theme.colors.textPrimary,
    fontWeight: '600' as const,
  },
});
