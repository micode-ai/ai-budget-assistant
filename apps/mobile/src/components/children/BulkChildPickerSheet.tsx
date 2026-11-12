import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { Child } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';

interface Props {
  /** Active children of the current account. */
  children: Child[];
  onConfirm: (childIds: string[]) => void;
  onClose: () => void;
}

/**
 * The body of the bulk "Assign to child" picker. Chrome-free, like
 * `BulkTagPickerSheet`: the phone wraps it in its bottom sheet, the desktop in
 * its centred panel (`ExpensesDesktopDialogs`).
 */
export function BulkChildPickerSheet({ children, onConfirm, onClose }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [picked, setPicked] = useState<string[]>([]);

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <>
      <View style={styles.header}>
        <Text style={styles.title}>{t('children.bulkAssign')}</Text>
        <TouchableOpacity onPress={onClose} accessibilityRole="button">
          <Text style={styles.cancel}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.note}>{t('children.bulkAssignNote')}</Text>

      <ScrollView style={styles.list}>
        {children.map((child) => {
          const isPicked = picked.includes(child.id);
          return (
            <TouchableOpacity
              key={child.id}
              style={styles.row}
              onPress={() => toggle(child.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isPicked }}
            >
              <View style={[styles.dot, { backgroundColor: child.color || theme.colors.primary }]} />
              <Text style={[styles.rowText, isPicked && styles.rowTextPicked]} numberOfLines={1}>
                {child.name || t('children.unnamed')}
              </Text>
              {isPicked && <Ionicons name="checkmark" size={18} color={theme.colors.primary} />}
            </TouchableOpacity>
          );
        })}
        {children.length === 0 && <Text style={styles.empty}>{t('children.empty')}</Text>}
      </ScrollView>

      <TouchableOpacity
        style={[styles.confirmButton, picked.length === 0 && styles.confirmDisabled]}
        disabled={picked.length === 0}
        onPress={() => onConfirm(picked)}
        accessibilityRole="button"
      >
        <Text style={styles.confirmText}>{t('common.done')}</Text>
      </TouchableOpacity>
    </>
  );
}

const createStyles = (theme: Theme) => ({
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
  },
  title: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textPrimary },
  cancel: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.primary },
  note: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, marginBottom: theme.spacing[2] },
  list: { maxHeight: 360 },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  rowText: { fontSize: 15, flex: 1, color: theme.colors.textPrimary },
  rowTextPicked: { color: theme.colors.primary, fontWeight: '600' as const },
  empty: {
    fontSize: 14,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[4],
    color: theme.colors.textTertiary,
  },
  confirmButton: {
    margin: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderRadius: 24,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.primary,
  },
  confirmDisabled: { opacity: 0.4 },
  confirmText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textInverse },
});
